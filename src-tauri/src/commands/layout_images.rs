//! Personal layout-image cache.
//!
//! Downloads zone-layout images from the community guide site into the
//! user's app-data folder, strictly for personal use on their machine —
//! images are never bundled with the app, committed to the repo, or
//! redistributed. Guardrails, in order:
//!
//!  - runs only when the user explicitly clicks "Download layout images";
//!  - robots.txt is fetched first and honored (`User-agent: *` Disallow
//!    rules abort the crawl; `Crawl-delay` stretches the pacing);
//!  - every request is rate-limited and sent with an honest User-Agent;
//!  - files land in `$APPDATA/layout-images` (covered by the asset-protocol
//!    scope in tauri.conf.json), and every image records the page it came
//!    from so the UI can attribute and link back to the source.

use super::err_str;
use leaguestart_core::layouts::{LayoutDb, ZoneLayout};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SITE: &str = "https://www.definitivguide.com";
const START_PATH: &str = "/docs/category/path-of-exile-1";
const USER_AGENT: &str = concat!(
    "Leaguestart/",
    env!("CARGO_PKG_VERSION"),
    " (personal layout-image cache; +https://github.com/d-evled/Leaguestart)"
);
/// Politeness floor between any two HTTP requests.
const MIN_DELAY: Duration = Duration::from_millis(700);
const PAGE_CAP: u64 = 4 * 1024 * 1024;
const IMAGE_CAP: u64 = 25 * 1024 * 1024;
const MAX_IMAGES_PER_ZONE: usize = 8;

// ---------------------------------------------------------------- types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFile {
    /// Relative to the cache dir on disk; absolute when returned to the UI.
    pub path: String,
    pub src_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneImages {
    pub area_id: String,
    pub page_url: String,
    pub page_title: String,
    pub files: Vec<ImageFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageManifest {
    pub fetched_at: u64,
    pub source_url: String,
    pub zones: Vec<ZoneImages>,
    pub unmatched_pages: Vec<String>,
    pub zones_without_images: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSummary {
    pub pages_crawled: usize,
    pub zones_with_images: usize,
    pub images_downloaded: usize,
    pub unmatched_pages: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchProgress {
    phase: String,
    done: usize,
    total: usize,
    message: String,
}

// ------------------------------------------------------------- commands --

/// Crawl the guide on the user's machine and cache its layout images
/// locally. Long-running; progress is emitted as `layoutimages://progress`.
#[tauri::command]
pub async fn fetch_layout_images(app: AppHandle) -> Result<FetchSummary, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_blocking(&app))
        .await
        .map_err(err_str)?
}

/// Read the cache manifest, dropping files deleted from disk and
/// absolutizing paths so the frontend can `convertFileSrc` them.
#[tauri::command]
pub fn get_layout_images(app: AppHandle) -> Result<Option<ImageManifest>, String> {
    let dir = images_dir(&app)?;
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&manifest_path).map_err(err_str)?;
    let mut manifest: ImageManifest = serde_json::from_str(&text).map_err(err_str)?;
    for zone in &mut manifest.zones {
        zone.files.retain(|f| dir.join(&f.path).is_file());
        for f in &mut zone.files {
            f.path = dir.join(&f.path).to_string_lossy().into_owned();
        }
    }
    Ok(Some(manifest))
}

/// Delete the entire local image cache (manifest included).
#[tauri::command]
pub fn clear_layout_images(app: AppHandle) -> Result<(), String> {
    let dir = images_dir(&app)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(err_str)?;
    }
    Ok(())
}

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(err_str)?
        .join("layout-images"))
}

// ------------------------------------------------------------ the crawl --

fn fetch_blocking(app: &AppHandle) -> Result<FetchSummary, String> {
    let layouts = LayoutDb::load_embedded();
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .user_agent(USER_AGENT)
        .build();
    let mut errors: Vec<String> = Vec::new();

    // 1. robots.txt — absent (404) means allowed; anything else that fails
    //    means we can't reach the site at all, so stop with a clear message.
    emit(app, "robots", 0, 0, "checking robots.txt…");
    let robots = match fetch_page(&agent, &format!("{SITE}/robots.txt")) {
        Ok(text) => parse_robots(&text),
        Err(e) if e.contains("HTTP 404") || e.contains("HTTP 410") => RobotsRules::default(),
        Err(e) => {
            return Err(format!(
                "Could not reach the guide site ({e}). If this keeps happening the site may be \
                 blocking non-browser clients — the outbound guide links still work."
            ))
        }
    };
    if !robots_allows(&robots, START_PATH) {
        return Err(
            "The guide site's robots.txt disallows automated fetching of its docs, so nothing \
             was downloaded. The outbound guide links still work."
                .into(),
        );
    }
    let mut pacer = Pacer::new(crawl_delay(&robots));

    // 2. category index → act category pages + any directly listed docs.
    emit(app, "index", 0, 0, "reading the guide index…");
    pacer.wait();
    let index = Html::parse_document(&fetch_page(&agent, &format!("{SITE}{START_PATH}"))?);
    let mut categories: Vec<String> = Vec::new();
    let mut doc_paths: BTreeSet<String> = BTreeSet::new();
    for link in extract_doc_links(&index) {
        if link == START_PATH {
            continue;
        }
        if link.contains("/category/") {
            categories.push(link);
        } else {
            doc_paths.insert(link);
        }
    }
    let cat_total = categories.len();
    for (i, cat) in categories.iter().enumerate() {
        emit(app, "index", i, cat_total, cat);
        if !robots_allows(&robots, cat) {
            continue;
        }
        pacer.wait();
        match fetch_page(&agent, &format!("{SITE}{cat}")) {
            Ok(html) => {
                for link in extract_doc_links(&Html::parse_document(&html)) {
                    if !link.contains("/category/") {
                        doc_paths.insert(link);
                    }
                }
            }
            Err(e) => errors.push(e),
        }
    }
    // The user asked for layouts only — the per-act "overview" pages (and
    // anything robots.txt excludes) are skipped.
    doc_paths.retain(|p| !p.to_ascii_lowercase().contains("overview") && robots_allows(&robots, p));

    let docs: Vec<String> = doc_paths.into_iter().collect();
    if docs.is_empty() {
        return Err(
            "Found no zone pages behind the guide index — the site's structure may have \
             changed. Nothing was downloaded."
                .into(),
        );
    }

    // 3. each doc page → title/act → match to a zone → collect image URLs.
    type PageHit = (String, String, Vec<String>); // page_url, title, image urls
    let mut matched: BTreeMap<String, PageHit> = BTreeMap::new();
    let mut unmatched: Vec<String> = Vec::new();
    let total = docs.len();
    for (i, path) in docs.iter().enumerate() {
        emit(app, "pages", i, total, path);
        pacer.wait();
        let url = format!("{SITE}{path}");
        let html = match fetch_page(&agent, &url) {
            Ok(h) => h,
            Err(e) => {
                errors.push(e);
                continue;
            }
        };
        let doc = Html::parse_document(&html);
        let title = extract_title(&doc).unwrap_or_else(|| path.clone());
        let act = find_act(path)
            .or_else(|| find_act(&extract_breadcrumb_text(&doc)))
            .or_else(|| find_act(&title));
        match match_zone(layouts, &title, act) {
            Some(zone) => {
                let entry = matched
                    .entry(zone.area_id.clone())
                    .or_insert_with(|| (url.clone(), title.clone(), Vec::new()));
                for img in extract_image_urls(&doc) {
                    if !entry.2.contains(&img) {
                        entry.2.push(img);
                    }
                }
            }
            None => unmatched.push(format!("{title} ({path})")),
        }
    }

    // 4. download images (resumable — existing files are kept).
    let dir = images_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(err_str)?;
    let img_total: usize = matched
        .values()
        .map(|(_, _, urls)| urls.len().min(MAX_IMAGES_PER_ZONE))
        .sum();
    let mut img_done = 0usize;
    let mut downloaded = 0usize;
    let mut zones_out: Vec<ZoneImages> = Vec::new();
    for (area_id, (page_url, title, img_urls)) in &matched {
        let mut files = Vec::new();
        for (idx, img_url) in img_urls.iter().take(MAX_IMAGES_PER_ZONE).enumerate() {
            emit(app, "images", img_done, img_total, title);
            img_done += 1;
            let rel = format!("{area_id}/{idx}.{}", ext_for(img_url));
            let target = dir.join(&rel);
            let already = target
                .metadata()
                .map(|m| m.is_file() && m.len() > 0)
                .unwrap_or(false);
            if !already {
                if !robots_allows(&robots, img_url.strip_prefix(SITE).unwrap_or("/")) {
                    continue;
                }
                std::fs::create_dir_all(dir.join(area_id)).map_err(err_str)?;
                pacer.wait();
                match fetch_image(&agent, img_url) {
                    Ok(bytes) => {
                        std::fs::write(&target, &bytes).map_err(err_str)?;
                        downloaded += 1;
                    }
                    Err(e) => {
                        errors.push(e);
                        continue;
                    }
                }
            }
            files.push(ImageFile {
                path: rel,
                src_url: img_url.clone(),
            });
        }
        zones_out.push(ZoneImages {
            area_id: area_id.clone(),
            page_url: page_url.clone(),
            page_title: title.clone(),
            files,
        });
    }

    let covered: BTreeSet<String> = zones_out
        .iter()
        .filter(|z| !z.files.is_empty())
        .map(|z| z.area_id.clone())
        .collect();
    let zones_without_images: Vec<String> = layouts
        .zones
        .iter()
        .filter(|z| !covered.contains(&z.area_id))
        .map(|z| format!("{} (act {})", z.name, z.act))
        .collect();

    let manifest = ImageManifest {
        fetched_at: now_ms(),
        source_url: format!("{SITE}{START_PATH}"),
        zones: zones_out,
        unmatched_pages: unmatched.clone(),
        zones_without_images,
    };
    std::fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(err_str)?,
    )
    .map_err(err_str)?;
    emit(app, "done", img_total, img_total, "done");

    Ok(FetchSummary {
        pages_crawled: total,
        zones_with_images: covered.len(),
        images_downloaded: downloaded,
        unmatched_pages: unmatched,
        errors,
    })
}

fn emit(app: &AppHandle, phase: &str, done: usize, total: usize, message: &str) {
    let _ = app.emit(
        "layoutimages://progress",
        FetchProgress {
            phase: phase.into(),
            done,
            total,
            message: message.into(),
        },
    );
}

// ---------------------------------------------------------------- http --

struct Pacer {
    delay: Duration,
    last: Option<Instant>,
}

impl Pacer {
    fn new(delay: Duration) -> Self {
        Self { delay, last: None }
    }
    fn wait(&mut self) {
        if let Some(last) = self.last {
            let elapsed = last.elapsed();
            if elapsed < self.delay {
                std::thread::sleep(self.delay - elapsed);
            }
        }
        self.last = Some(Instant::now());
    }
}

fn fetch_raw(agent: &ureq::Agent, url: &str, cap: u64) -> Result<(Vec<u8>, String), String> {
    let resp = agent.get(url).call().map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("{url}: HTTP {code}"),
        other => format!("{url}: {other}"),
    })?;
    let content_type = resp.content_type().to_ascii_lowercase();
    let mut buf = Vec::new();
    resp.into_reader()
        .take(cap + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("{url}: read failed: {e}"))?;
    if buf.len() as u64 > cap {
        return Err(format!("{url}: response larger than {cap} bytes"));
    }
    Ok((buf, content_type))
}

fn fetch_page(agent: &ureq::Agent, url: &str) -> Result<String, String> {
    let (bytes, _) = fetch_raw(agent, url, PAGE_CAP)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn fetch_image(agent: &ureq::Agent, url: &str) -> Result<Vec<u8>, String> {
    let (bytes, content_type) = fetch_raw(agent, url, IMAGE_CAP)?;
    let ok_type = content_type.is_empty()
        || content_type.starts_with("image/")
        || content_type == "application/octet-stream";
    if !ok_type {
        return Err(format!("{url}: expected an image, got {content_type}"));
    }
    if bytes.is_empty() {
        return Err(format!("{url}: empty response"));
    }
    Ok(bytes)
}

// -------------------------------------------------------------- robots --

#[derive(Debug, Default)]
struct RobotsRules {
    disallow: Vec<String>,
    crawl_delay: Option<f64>,
}

fn parse_robots(text: &str) -> RobotsRules {
    let mut rules = RobotsRules::default();
    let mut in_star = false;
    let mut group_has_rules = false;
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        if key == "user-agent" {
            // A User-agent line after rules starts a new group; consecutive
            // User-agent lines share the group that follows.
            if group_has_rules {
                in_star = false;
                group_has_rules = false;
            }
            if value == "*" {
                in_star = true;
            }
            continue;
        }
        group_has_rules = true;
        if !in_star {
            continue;
        }
        match key.as_str() {
            "disallow" if !value.is_empty() => rules.disallow.push(value.to_string()),
            "crawl-delay" => rules.crawl_delay = value.parse().ok(),
            _ => {}
        }
    }
    rules
}

fn robots_allows(rules: &RobotsRules, path: &str) -> bool {
    !rules.disallow.iter().any(|d| path.starts_with(d.as_str()))
}

fn crawl_delay(rules: &RobotsRules) -> Duration {
    match rules.crawl_delay {
        Some(secs) if secs > 0.0 => MIN_DELAY.max(Duration::from_secs_f64(secs.min(10.0))),
        _ => MIN_DELAY,
    }
}

// ------------------------------------------------------- html scraping --

fn selector(css: &str) -> Selector {
    Selector::parse(css).expect("static selector is valid")
}

/// Docs links from the page, preferring the article (content cards) over
/// the full page so sidebar/nav links to unrelated sections don't leak in.
fn extract_doc_links(html: &Html) -> Vec<String> {
    let mut out = BTreeSet::new();
    for scope in ["article a[href]", "main a[href]", "a[href]"] {
        for el in html.select(&selector(scope)) {
            if let Some(href) = el.value().attr("href") {
                let href = href.split(['#', '?']).next().unwrap_or("");
                let href = href.trim_end_matches('/');
                if href.starts_with("/docs/") && href.len() > "/docs/".len() {
                    out.insert(href.to_string());
                }
            }
        }
        if !out.is_empty() {
            break;
        }
    }
    out.into_iter().collect()
}

fn extract_title(html: &Html) -> Option<String> {
    for css in ["article h1", "main h1", "h1", "title"] {
        if let Some(el) = html.select(&selector(css)).next() {
            let text: String = el.text().collect();
            let clean = text.split('|').next().unwrap_or("").trim();
            if !clean.is_empty() {
                return Some(clean.to_string());
            }
        }
    }
    None
}

fn extract_breadcrumb_text(html: &Html) -> String {
    for css in [
        r#"nav[aria-label="breadcrumbs"]"#,
        "nav.theme-doc-breadcrumbs",
        ".breadcrumbs",
    ] {
        if let Some(el) = html.select(&selector(css)).next() {
            return el.text().collect::<Vec<_>>().join(" ");
        }
    }
    String::new()
}

fn extract_image_urls(html: &Html) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    for scope in ["article img", "main img"] {
        for el in html.select(&selector(scope)) {
            let v = el.value();
            let mut candidates: Vec<String> = Vec::new();
            for attr in ["src", "data-src", "data-original"] {
                if let Some(s) = v.attr(attr) {
                    candidates.push(s.to_string());
                }
            }
            if let Some(srcset) = v.attr("srcset") {
                // Last srcset entry is conventionally the largest variant.
                if let Some(last) = srcset.split(',').next_back() {
                    if let Some(url) = last.split_whitespace().next() {
                        candidates.push(url.to_string());
                    }
                }
            }
            let Some(chosen) = candidates
                .into_iter()
                .find(|c| !c.is_empty() && !c.starts_with("data:"))
            else {
                continue;
            };
            let Some(abs) = absolutize(&chosen) else {
                continue;
            };
            if looks_like_layout_image(&abs) && seen.insert(abs.clone()) {
                out.push(abs);
            }
        }
        if !out.is_empty() {
            break;
        }
    }
    out
}

fn absolutize(url: &str) -> Option<String> {
    if url.starts_with("https://") || url.starts_with("http://") {
        return Some(url.to_string());
    }
    if let Some(rest) = url.strip_prefix("//") {
        return Some(format!("https://{rest}"));
    }
    if url.starts_with('/') {
        return Some(format!("{SITE}{url}"));
    }
    None // page-relative paths don't occur in Docusaurus output; skip
}

fn looks_like_layout_image(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let path = lower.split(['?', '#']).next().unwrap_or("");
    const CHROME: [&str; 6] = ["logo", "favicon", "avatar", "icon", "banner", "emoji"];
    if CHROME.iter().any(|b| path.contains(b)) {
        return false;
    }
    [".png", ".jpg", ".jpeg", ".webp", ".gif"]
        .iter()
        .any(|ext| path.ends_with(ext))
}

fn ext_for(url: &str) -> &'static str {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    for (suffix, ext) in [
        (".png", "png"),
        (".jpg", "jpg"),
        (".jpeg", "jpg"),
        (".webp", "webp"),
        (".gif", "gif"),
    ] {
        if path.ends_with(suffix) {
            return ext;
        }
    }
    "png"
}

// ------------------------------------------------------- zone matching --

/// "The Ship Graveyard!" → "ship graveyard": lowercase, non-alphanumerics
/// collapse to single spaces, leading "the" dropped.
fn normalize_name(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with(' ') {
            out.push(' ');
        }
    }
    let trimmed = out.trim();
    trimmed.strip_prefix("the ").unwrap_or(trimmed).to_string()
}

/// The zone name appearing as a whole-word segment of a decorated title,
/// e.g. "ledge layout guide" matches zone "ledge".
fn title_matches(title_norm: &str, zone_norm: &str) -> bool {
    if title_norm == zone_norm {
        return true;
    }
    if zone_norm.len() < 4 {
        return false;
    }
    title_norm.starts_with(&format!("{zone_norm} "))
        || title_norm.ends_with(&format!(" {zone_norm}"))
        || title_norm.contains(&format!(" {zone_norm} "))
}

/// Exact name match first (act-scoped when an act hint exists), then a
/// unique decorated-title match. Ambiguity (duplicate zone names across
/// acts 1–5/6–10 with no act hint) returns None → diagnostics.
fn match_zone<'a>(db: &'a LayoutDb, title: &str, act: Option<u8>) -> Option<&'a ZoneLayout> {
    let title_norm = normalize_name(title);
    let candidates: Vec<&ZoneLayout> = db
        .zones
        .iter()
        .filter(|z| act.is_none_or(|a| z.act == a))
        .collect();
    let exact: Vec<&ZoneLayout> = candidates
        .iter()
        .copied()
        .filter(|z| normalize_name(&z.name) == title_norm)
        .collect();
    match exact.len() {
        1 => return Some(exact[0]),
        n if n > 1 => return None,
        _ => {}
    }
    let fuzzy: Vec<&ZoneLayout> = candidates
        .iter()
        .copied()
        .filter(|z| title_matches(&title_norm, &normalize_name(&z.name)))
        .collect();
    if fuzzy.len() == 1 {
        Some(fuzzy[0])
    } else {
        None
    }
}

/// Act number from any of URL path ("/act-6/…"), breadcrumbs ("Act 6"),
/// or title — word-boundary "act" followed by 1–10.
fn find_act(s: &str) -> Option<u8> {
    let lower = s.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut from = 0usize;
    while let Some(pos) = lower[from..].find("act") {
        let start = from + pos;
        let after = start + 3;
        let boundary = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
        if boundary {
            let rest = lower[after..].trim_start_matches([' ', '-', '_', ':', '.', '/']);
            let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(n) = digits.parse::<u8>() {
                if (1..=10).contains(&n) {
                    return Some(n);
                }
            }
        }
        from = after;
    }
    None
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --------------------------------------------------------------- tests --

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn robots_groups_and_rules() {
        let r = parse_robots(
            "User-agent: Googlebot\nDisallow: /private\n\n\
             User-agent: Other\nUser-agent: *\nCrawl-delay: 2\nDisallow: /admin\n",
        );
        assert!(robots_allows(&r, "/docs/act-1/the-coast"));
        assert!(robots_allows(&r, "/private/x")); // Googlebot-only rule
        assert!(!robots_allows(&r, "/admin/x"));
        assert_eq!(crawl_delay(&r), Duration::from_secs(2));

        let empty = parse_robots("User-agent: *\nDisallow:\n");
        assert!(robots_allows(&empty, "/docs/"));
        assert_eq!(crawl_delay(&empty), MIN_DELAY);

        let blocked = parse_robots("User-agent: *\nDisallow: /");
        assert!(!robots_allows(&blocked, "/docs/anything"));

        assert!(robots_allows(&RobotsRules::default(), "/docs/"));
    }

    #[test]
    fn act_extraction() {
        assert_eq!(find_act("/docs/act-6/the-coast"), Some(6));
        assert_eq!(find_act("Act 10 — The Feeding Trough"), Some(10));
        assert_eq!(find_act("Breadcrumbs Docs Act 3 The Docks"), Some(3));
        assert_eq!(find_act("The Cataracts"), None); // "act" inside a word
        assert_eq!(find_act("Character actions"), None); // no digits after
        assert_eq!(find_act("act 42"), None); // out of range
    }

    #[test]
    fn name_normalization_and_title_matching() {
        assert_eq!(normalize_name("The Ship Graveyard!"), "ship graveyard");
        assert_eq!(normalize_name("  The   Ledge — Layout "), "ledge layout");
        assert!(title_matches("ledge layout guide", "ledge"));
        assert!(title_matches("crypt level 1", "crypt level 1"));
        assert!(!title_matches("crypt", "crypt level 1"));
    }

    #[test]
    fn zone_matching_uses_exact_then_act_context() {
        let db = LayoutDb::load_embedded();
        // Duplicate names across acts resolve only with an act hint.
        let coast6 = match_zone(db, "The Coast", Some(6)).expect("act 6 coast");
        assert_eq!(coast6.act, 6);
        assert!(match_zone(db, "The Coast", None).is_none());
        // Exact beats prefix: the Cave page must not land on the Graveyard.
        let cave = match_zone(db, "The Ship Graveyard Cave", Some(1)).expect("cave");
        assert_eq!(cave.name, "The Ship Graveyard Cave");
        // Decorated titles still resolve.
        let ledge = match_zone(db, "The Ledge – Layout", Some(1)).expect("ledge");
        assert_eq!(ledge.name, "The Ledge");
        assert!(match_zone(db, "Frequently Asked Questions", None).is_none());
    }

    #[test]
    fn html_extraction_from_docusaurus_like_page() {
        let html = Html::parse_document(
            r##"<!doctype html><html><head><title>The Coast | Guide</title></head><body>
            <nav class="navbar"><a href="/docs/category/path-of-exile-2">PoE2</a></nav>
            <main>
              <nav aria-label="breadcrumbs"><a href="/docs">Docs</a><span>Act 1</span></nav>
              <article>
                <h1>The Coast</h1>
                <img src="/assets/images/coast-layout-abc.png" alt="layout">
                <img src="/img/logo.svg">
                <img src="data:image/gif;base64,x" srcset="/assets/images/coast-b.png 1x, /assets/images/coast-b-2x.png 2x">
                <a href="/docs/poe1/act-1/the-mud-flats/">next</a>
                <a href="/docs/poe1/act-1/the-mud-flats#tips">anchor dupe</a>
              </article>
            </main></body></html>"##,
        );
        assert_eq!(extract_title(&html).as_deref(), Some("The Coast"));
        assert_eq!(find_act(&extract_breadcrumb_text(&html)), Some(1));
        // Article scope wins: the navbar's PoE2 link must not leak in.
        assert_eq!(
            extract_doc_links(&html),
            vec!["/docs/poe1/act-1/the-mud-flats".to_string()]
        );
        assert_eq!(
            extract_image_urls(&html),
            vec![
                format!("{SITE}/assets/images/coast-layout-abc.png"),
                format!("{SITE}/assets/images/coast-b-2x.png"),
            ]
        );
    }

    #[test]
    fn image_url_filtering() {
        assert_eq!(
            absolutize("//cdn.example.com/a.png").as_deref(),
            Some("https://cdn.example.com/a.png")
        );
        assert_eq!(absolutize("relative/a.png"), None);
        assert!(looks_like_layout_image(
            "https://x.com/assets/images/map.PNG?v=2"
        ));
        assert!(!looks_like_layout_image("https://x.com/img/logo.svg"));
        assert!(!looks_like_layout_image("https://x.com/banner.png"));
        assert_eq!(ext_for("https://x.com/a/b.jpeg?w=1"), "jpg");
        assert_eq!(ext_for("https://x.com/a/b"), "png");
    }
}
