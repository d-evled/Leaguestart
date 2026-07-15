//! Client.txt line parser.
//!
//! Lines look like:
//! `2026/07/10 20:31:43 12345678 abc123 [INFO Client 1234] : You have entered The Coast.`
//! `2026/07/10 20:31:40 12345401 def456 [DEBUG Client 1234] Generating level 2 area "1_1_2" with seed 42`
//!
//! Patterns assume the English client and are kept in one place so other
//! locales can be added later. Unrecognized lines return `None`.

use chrono::{Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone};
use regex::Regex;
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq)]
pub struct LogLine {
    /// Wall-clock timestamp (local time from the log) as epoch ms.
    pub ts_ms: i64,
    /// The client's millisecond uptime counter. Resets when the game
    /// restarts; when monotonic between two lines it gives ms-precision
    /// deltas independent of wall-clock/DST.
    pub uptime_ms: Option<i64>,
    pub event: LogEvent,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LogEvent {
    ZoneEntered {
        name: String,
    },
    AreaGenerating {
        area_level: i64,
        client_id: String,
        seed: Option<i64>,
    },
    InstanceDetails,
    LevelUp {
        character: String,
        class: String,
        level: i64,
    },
    Death {
        character: String,
    },
    AfkMode {
        on: bool,
    },
    /// `***** LOG FILE OPENING *****` — the game client just started; the
    /// previous session (if any) ended some time before this line.
    GameStarted,
    /// The client is connecting to the login server: written at startup and
    /// when the player exits to the login screen.
    LoginScreen,
    /// The connection to the instance server dropped (crash to character
    /// select / login, or a logout-by-disconnect).
    Disconnected,
}

static PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^(\d{4})/(\d{2})/(\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d+) \S+ \[(?:DEBUG|INFO|WARN) Client \d+\] (.*)$",
    )
    .unwrap()
});
static ZONE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^: You have entered (.+)\.$").unwrap());
static GENERATING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^Generating level (\d+) area "([^"]+)"(?: with seed (\d+))?"#).unwrap()
});
static LEVEL_UP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^: (\S+) \((\w+)\) is now level (\d+)$").unwrap());
static DEATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^: (\S+) has been slain\.$").unwrap());
static AFK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^: AFK mode is now (ON|OFF)").unwrap());
// The log-open banner has the timestamp but not the uptime/client fields.
static LOG_OPEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d{4})/(\d{2})/(\d{2}) (\d{2}):(\d{2}):(\d{2}).*\*{3,} LOG FILE OPENING \*{3,}")
        .unwrap()
});
static LOGIN_CONNECT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Async connecting to \S+").unwrap());
static DISCONNECT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Abnormal disconnect: ").unwrap());

fn ts_from_captures(caps: &regex::Captures) -> Option<i64> {
    let (y, mo, d, h, mi, s) = (
        caps[1].parse().ok()?,
        caps[2].parse().ok()?,
        caps[3].parse().ok()?,
        caps[4].parse().ok()?,
        caps[5].parse().ok()?,
        caps[6].parse().ok()?,
    );
    let naive = NaiveDateTime::new(
        NaiveDate::from_ymd_opt(y, mo, d)?,
        NaiveTime::from_hms_opt(h, mi, s)?,
    );
    // `earliest` disambiguates DST-fold times deterministically.
    Some(
        Local
            .from_local_datetime(&naive)
            .earliest()?
            .timestamp_millis(),
    )
}

/// Parse one log line. Returns `None` for anything that isn't a tracked event.
pub fn parse_line(line: &str) -> Option<LogLine> {
    let line = line.trim_end_matches(['\r', '\n']);
    let Some(caps) = PREFIX.captures(line) else {
        // The log-open banner is the one tracked line without the standard
        // uptime/client prefix.
        let caps = LOG_OPEN.captures(line)?;
        return Some(LogLine {
            ts_ms: ts_from_captures(&caps)?,
            uptime_ms: None,
            event: LogEvent::GameStarted,
        });
    };
    let body = caps.get(8).unwrap().as_str();
    let event = parse_body(body)?;
    let ts_ms = ts_from_captures(&caps)?;
    let uptime_ms = caps[7].parse::<i64>().ok();

    Some(LogLine {
        ts_ms,
        uptime_ms,
        event,
    })
}

fn parse_body(body: &str) -> Option<LogEvent> {
    if let Some(c) = GENERATING.captures(body) {
        return Some(LogEvent::AreaGenerating {
            area_level: c[1].parse().ok()?,
            client_id: c[2].to_string(),
            seed: c.get(3).and_then(|m| m.as_str().parse().ok()),
        });
    }
    if body.starts_with("Got Instance Details") {
        return Some(LogEvent::InstanceDetails);
    }
    if let Some(c) = ZONE.captures(body) {
        return Some(LogEvent::ZoneEntered {
            name: c[1].to_string(),
        });
    }
    if let Some(c) = LEVEL_UP.captures(body) {
        return Some(LogEvent::LevelUp {
            character: c[1].to_string(),
            class: c[2].to_string(),
            level: c[3].parse().ok()?,
        });
    }
    if let Some(c) = DEATH.captures(body) {
        return Some(LogEvent::Death {
            character: c[1].to_string(),
        });
    }
    if let Some(c) = AFK.captures(body) {
        return Some(LogEvent::AfkMode { on: &c[1] == "ON" });
    }
    if LOGIN_CONNECT.is_match(body) {
        return Some(LogEvent::LoginScreen);
    }
    if DISCONNECT.is_match(body) {
        return Some(LogEvent::Disconnected);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body_of(line: &str) -> Option<LogEvent> {
        parse_line(line).map(|l| l.event)
    }

    #[test]
    fn parses_zone_entry() {
        let e = body_of(
            "2026/07/10 20:31:43 12345678 abc123f [INFO Client 1234] : You have entered The Coast.",
        );
        assert_eq!(
            e,
            Some(LogEvent::ZoneEntered {
                name: "The Coast".into()
            })
        );
    }

    #[test]
    fn parses_generating_with_and_without_seed() {
        let e = body_of(
            r#"2026/07/10 20:31:40 12345401 9f1 [DEBUG Client 1234] Generating level 2 area "1_1_2" with seed 42"#,
        );
        assert_eq!(
            e,
            Some(LogEvent::AreaGenerating {
                area_level: 2,
                client_id: "1_1_2".into(),
                seed: Some(42)
            })
        );
        let e = body_of(
            r#"2026/07/10 20:31:40 12345401 9f1 [DEBUG Client 1234] Generating level 83 area "MapWorldsStrand""#,
        );
        assert!(matches!(
            e,
            Some(LogEvent::AreaGenerating {
                area_level: 83,
                seed: None,
                ..
            })
        ));
    }

    #[test]
    fn parses_level_death_afk_instance() {
        assert_eq!(
            body_of("2026/07/10 20:35:00 1000 a [INFO Client 1] : Exilena (Witch) is now level 12"),
            Some(LogEvent::LevelUp {
                character: "Exilena".into(),
                class: "Witch".into(),
                level: 12
            })
        );
        assert_eq!(
            body_of("2026/07/10 20:36:00 1000 a [INFO Client 1] : Exilena has been slain."),
            Some(LogEvent::Death {
                character: "Exilena".into()
            })
        );
        assert_eq!(
            body_of("2026/07/10 20:36:10 1000 a [INFO Client 1] : AFK mode is now ON. Autoreply \"afk\""),
            Some(LogEvent::AfkMode { on: true })
        );
        assert_eq!(
            body_of("2026/07/10 20:31:39 1000 a [DEBUG Client 1] Got Instance Details from login server"),
            Some(LogEvent::InstanceDetails)
        );
    }

    #[test]
    fn parses_session_boundary_lines() {
        // The log-open banner has no uptime/client prefix.
        let e = parse_line("2026/07/10 20:31:38 ***** LOG FILE OPENING *****").unwrap();
        assert_eq!(e.event, LogEvent::GameStarted);
        assert_eq!(e.uptime_ms, None);
        assert_eq!(
            body_of("2026/07/10 20:31:39 900 a [INFO Client 1] Async connecting to us.login.pathofexile.com:20481"),
            Some(LogEvent::LoginScreen)
        );
        assert_eq!(
            body_of("2026/07/10 21:40:00 4100900 a [INFO Client 1] Abnormal disconnect: An unexpected disconnection occurred."),
            Some(LogEvent::Disconnected)
        );
    }

    #[test]
    fn chat_text_containing_trigger_phrases_does_not_false_positive() {
        // A player typing the phrases in chat: body is `: Name: text`.
        for line in [
            "2026/07/10 20:31:43 1 a [INFO Client 1] : SomeGuy: You have entered The Void.",
            "2026/07/10 20:31:43 1 a [INFO Client 1] #GlobalGuy: You have entered The Void.",
            "2026/07/10 20:31:43 1 a [INFO Client 1] : SomeGuy: Bob (Witch) is now level 3",
            "2026/07/10 20:31:43 1 a [INFO Client 1] : SomeGuy: Bob has been slain.",
        ] {
            assert_eq!(body_of(line), None, "false positive on: {line}");
        }
    }

    #[test]
    fn malformed_and_foreign_lines_return_none() {
        assert_eq!(body_of(""), None);
        assert_eq!(body_of("not a log line at all"), None);
        assert_eq!(
            body_of("2026/07/10 20:31:43 1 a [INFO Client 1] Connecting to instance server at 1.2.3.4:6112"),
            None
        );
    }

    #[test]
    fn timestamps_are_ordered_and_uptime_captured() {
        let a =
            parse_line("2026/07/10 20:31:43 5000 a [INFO Client 1] : You have entered The Coast.")
                .unwrap();
        let b = parse_line(
            "2026/07/10 20:31:45 7000 a [INFO Client 1] : You have entered The Mud Flats.",
        )
        .unwrap();
        assert_eq!(b.ts_ms - a.ts_ms, 2000);
        assert_eq!(a.uptime_ms, Some(5000));
        assert_eq!(b.uptime_ms, Some(7000));
    }
}
