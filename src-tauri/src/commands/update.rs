//! Version check against GitHub Releases. Called by the frontend on app
//! open and once a day; one small GET to api.github.com, nothing else is
//! sent. Users can turn it off in Settings (`update_check_enabled`).

use super::err_str;
use serde::Serialize;
use std::time::Duration;

const RELEASES_API: &str = "https://api.github.com/repos/d-evled/Leaguestart/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/d-evled/Leaguestart/releases";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub url: String,
    pub title: Option<String>,
}

/// Returns `Some` only when a newer release exists. `None` covers both
/// "up to date" and "no releases published yet".
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || check_blocking(&current))
        .await
        .map_err(err_str)?
}

fn check_blocking(current: &str) -> Result<Option<UpdateInfo>, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .user_agent(&format!("Leaguestart/{current}"))
        .build();
    let resp = match agent
        .get(RELEASES_API)
        .set("Accept", "application/vnd.github+json")
        .call()
    {
        Ok(r) => r,
        // 404 = repository has no releases yet; not an error worth surfacing.
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(ureq::Error::Status(code, _)) => return Err(format!("update check: HTTP {code}")),
        Err(e) => return Err(format!("update check failed: {e}")),
    };
    let body: serde_json::Value = resp.into_json().map_err(err_str)?;
    let latest = body["tag_name"]
        .as_str()
        .unwrap_or_default()
        .trim_start_matches(['v', 'V']);
    if latest.is_empty() || !version_newer(latest, current) {
        return Ok(None);
    }
    Ok(Some(UpdateInfo {
        current: current.to_string(),
        latest: latest.to_string(),
        url: body["html_url"]
            .as_str()
            .unwrap_or(RELEASES_PAGE)
            .to_string(),
        title: body["name"].as_str().map(str::to_string),
    }))
}

/// Dotted-numeric comparison; a non-numeric tail ("-beta") ends the compared
/// prefix, so "0.2.0-beta" compares as 0.2.0.
fn version_newer(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split(['.', '-', '+'])
            .map_while(|p| p.parse::<u64>().ok())
            .collect()
    };
    let (l, c) = (parse(latest), parse(current));
    for i in 0..l.len().max(c.len()) {
        let (a, b) = (
            l.get(i).copied().unwrap_or(0),
            c.get(i).copied().unwrap_or(0),
        );
        if a != b {
            return a > b;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::version_newer;

    #[test]
    fn compares_versions() {
        assert!(version_newer("0.2.0", "0.1.0"));
        assert!(version_newer("1.0.0", "0.9.9"));
        assert!(version_newer("0.1.10", "0.1.9"));
        assert!(version_newer("0.2", "0.1.5"));
        assert!(!version_newer("0.1.0", "0.1.0"));
        assert!(!version_newer("0.1.0", "0.2.0"));
        assert!(!version_newer("", "0.1.0"));
    }
}
