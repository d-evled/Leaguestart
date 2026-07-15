//! PoB import: decode a pasted code locally, or fetch the raw code from a
//! known paste site first. The only network calls this app ever makes are
//! to the paste site the user explicitly pasted a link to (and the GitHub
//! update check) — never to pathofexile.com or the game.

use super::err_str;
use leaguestart_core::pob::{decode_pob_code, PobBuildInfo};
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PobImport {
    pub class: Option<String>,
    pub ascendancy: Option<String>,
    pub level: Option<i64>,
    /// "code" for a directly pasted code, otherwise the raw URL fetched.
    pub source: String,
}

impl PobImport {
    fn from_info(info: PobBuildInfo, source: String) -> Self {
        Self {
            class: info.class,
            ascendancy: info.ascendancy,
            level: info.level,
            source,
        }
    }
}

/// Map a share link to the endpoint that returns the bare PoB code.
fn raw_paste_url(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let rest = rest.strip_prefix("www.").unwrap_or(rest);
    fn first_segment(s: &str) -> Option<&str> {
        let id = s.split(['/', '?', '#']).next()?;
        (!id.is_empty()).then_some(id)
    }
    if let Some(path) = rest.strip_prefix("pastebin.com/") {
        let id = first_segment(path.trim_start_matches("raw/"))?;
        Some(format!("https://pastebin.com/raw/{id}"))
    } else if let Some(path) = rest.strip_prefix("pobb.in/") {
        let id = first_segment(path)?;
        Some(format!("https://pobb.in/{id}/raw"))
    } else if let Some(path) = rest.strip_prefix("poe.ninja/pob/") {
        let id = first_segment(path.trim_start_matches("raw/"))?;
        Some(format!("https://poe.ninja/pob/raw/{id}"))
    } else {
        None
    }
}

fn fetch_text(url: &str, user_agent: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .user_agent(user_agent)
        .build();
    let resp = agent.get(url).call().map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("{url} returned HTTP {code}"),
        other => format!("couldn't reach {url}: {other}"),
    })?;
    resp.into_string()
        .map_err(|e| format!("couldn't read response from {url}: {e}"))
}

/// Accepts either a raw PoB import code or a pastebin.com / pobb.in /
/// poe.ninja/pob share link and returns the decoded build summary.
#[tauri::command]
pub async fn import_pob(app: tauri::AppHandle, input: String) -> Result<PobImport, String> {
    let user_agent = format!("Leaguestart/{}", app.package_info().version);
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed = input.trim().to_string();
        if trimmed.is_empty() {
            return Err("paste a PoB import code or a pastebin/pobb.in link".to_string());
        }
        let (code, source) = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            let raw = raw_paste_url(&trimmed).ok_or_else(|| {
                "unsupported link — supported sites: pastebin.com, pobb.in, poe.ninja/pob. \
                 Alternatively paste the PoB code itself."
                    .to_string()
            })?;
            (fetch_text(&raw, &user_agent)?, raw)
        } else {
            (trimmed, "code".to_string())
        };
        let info = decode_pob_code(&code).map_err(err_str)?;
        Ok(PobImport::from_info(info, source))
    })
    .await
    .map_err(err_str)?
}

#[cfg(test)]
mod tests {
    use super::raw_paste_url;

    #[test]
    fn maps_share_links_to_raw() {
        assert_eq!(
            raw_paste_url("https://pastebin.com/AbC123xy").as_deref(),
            Some("https://pastebin.com/raw/AbC123xy")
        );
        assert_eq!(
            raw_paste_url("https://pastebin.com/raw/AbC123xy").as_deref(),
            Some("https://pastebin.com/raw/AbC123xy")
        );
        assert_eq!(
            raw_paste_url("https://pobb.in/abcDEF?x=1").as_deref(),
            Some("https://pobb.in/abcDEF/raw")
        );
        assert_eq!(
            raw_paste_url("https://www.poe.ninja/pob/xyz").as_deref(),
            Some("https://poe.ninja/pob/raw/xyz")
        );
        assert_eq!(raw_paste_url("https://example.com/whatever"), None);
        assert_eq!(raw_paste_url("not a url"), None);
    }
}
