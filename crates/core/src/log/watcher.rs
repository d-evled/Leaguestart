//! Poll-based tail of Client.txt.
//!
//! The file is only ever opened read-only (std::fs::File::open uses full
//! share flags on Windows, so the game is never blocked — a ToS guardrail).
//! Polling every few hundred ms is the same strategy speedrun autosplitters
//! use; no inotify dependency needed for a single file.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct PollResult {
    pub lines: Vec<String>,
    /// The file shrank or was replaced since the last poll; the watcher
    /// resumed from the new end of file.
    pub truncated: bool,
    pub exists: bool,
}

pub struct LogWatcher {
    path: PathBuf,
    offset: u64,
    remainder: Vec<u8>,
}

impl LogWatcher {
    /// Watch `path`, starting from the current end of file (history is not
    /// replayed — use [`backscan_lines`] to warm context instead).
    pub fn start_at_end(path: &Path) -> std::io::Result<Self> {
        let offset = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        Ok(LogWatcher { path: path.to_path_buf(), offset, remainder: Vec::new() })
    }

    /// Resume from a persisted cursor. Falls back to end-of-file when the
    /// file is now smaller than the cursor (rotated/replaced).
    pub fn start_at(path: &Path, offset: u64) -> std::io::Result<Self> {
        let len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let offset = if offset <= len { offset } else { len };
        Ok(LogWatcher { path: path.to_path_buf(), offset, remainder: Vec::new() })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn offset(&self) -> u64 {
        self.offset
    }

    /// Read any newly appended complete lines.
    pub fn poll(&mut self) -> std::io::Result<PollResult> {
        let mut result = PollResult::default();
        let Ok(meta) = std::fs::metadata(&self.path) else {
            return Ok(result); // file missing right now (exists = false)
        };
        result.exists = true;
        let len = meta.len();

        if len < self.offset {
            // Truncated or replaced: resume from the new end. We lose at
            // most one poll window of lines, which is acceptable and simple.
            self.offset = len;
            self.remainder.clear();
            result.truncated = true;
            return Ok(result);
        }
        if len == self.offset {
            return Ok(result);
        }

        let mut f = File::open(&self.path)?;
        f.seek(SeekFrom::Start(self.offset))?;
        let mut buf = Vec::with_capacity((len - self.offset).min(4 * 1024 * 1024) as usize);
        let read = f.take(len - self.offset).read_to_end(&mut buf)? as u64;
        self.offset += read;

        self.remainder.extend_from_slice(&buf);
        // Split complete lines; hold a trailing partial line for next poll.
        while let Some(pos) = self.remainder.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.remainder.drain(..=pos).collect();
            let text = String::from_utf8_lossy(&line);
            let trimmed = text.trim_end_matches(['\r', '\n']);
            if !trimmed.is_empty() {
                result.lines.push(trimmed.to_string());
            }
        }
        Ok(result)
    }
}

/// Read up to `max_bytes` from the end of the file and return complete lines.
/// Used to warm tracker context (current zone, character levels) when the app
/// starts mid-session; these lines must not be replayed as live events.
pub fn backscan_lines(path: &Path, max_bytes: u64) -> std::io::Result<Vec<String>> {
    let Ok(meta) = std::fs::metadata(path) else {
        return Ok(Vec::new());
    };
    let len = meta.len();
    let start = len.saturating_sub(max_bytes);
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;
    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<String> = text
        .split('\n')
        .map(|l| l.trim_end_matches('\r').to_string())
        .filter(|l| !l.is_empty())
        .collect();
    // The first line is likely cut mid-line when we seeked into the file.
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn tails_appended_lines_and_handles_partials() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Client.txt");
        std::fs::write(&path, "old line 1\nold line 2\n").unwrap();

        let mut w = LogWatcher::start_at_end(&path).unwrap();
        assert_eq!(w.poll().unwrap().lines.len(), 0, "history is skipped");

        let mut f = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(b"new line A\nnew li").unwrap();
        f.flush().unwrap();
        let r = w.poll().unwrap();
        assert_eq!(r.lines, vec!["new line A".to_string()]);

        f.write_all(b"ne B\n").unwrap();
        f.flush().unwrap();
        let r = w.poll().unwrap();
        assert_eq!(r.lines, vec!["new line B".to_string()]);
    }

    #[test]
    fn recovers_from_truncation_and_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Client.txt");
        std::fs::write(&path, "aaa\nbbb\n").unwrap();
        let mut w = LogWatcher::start_at_end(&path).unwrap();

        // Truncate in place.
        std::fs::write(&path, "").unwrap();
        let r = w.poll().unwrap();
        assert!(r.truncated);
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"after truncate\n")
            .unwrap();
        assert_eq!(w.poll().unwrap().lines, vec!["after truncate".to_string()]);

        // Replace the file with a shorter one.
        std::fs::remove_file(&path).unwrap();
        let r = w.poll().unwrap();
        assert!(!r.exists);
        std::fs::write(&path, "x\n").unwrap();
        let r = w.poll().unwrap();
        assert!(r.truncated, "shorter replacement detected as truncation");
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"fresh\n")
            .unwrap();
        assert_eq!(w.poll().unwrap().lines, vec!["fresh".to_string()]);
    }

    #[test]
    fn backscan_returns_recent_complete_lines() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Client.txt");
        let mut content = String::new();
        for i in 0..100 {
            content.push_str(&format!("line number {i}\n"));
        }
        std::fs::write(&path, &content).unwrap();
        let lines = backscan_lines(&path, 200).unwrap();
        assert!(lines.len() > 2);
        assert_eq!(lines.last().unwrap(), "line number 99");
        // First (possibly partial) line was dropped.
        assert!(lines.first().unwrap().starts_with("line number"));
    }

    #[test]
    fn resume_from_cursor() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Client.txt");
        std::fs::write(&path, "one\ntwo\n").unwrap();
        let mut w = LogWatcher::start_at(&path, 4).unwrap(); // after "one\n"
        assert_eq!(w.poll().unwrap().lines, vec!["two".to_string()]);
        // Cursor beyond file length falls back to end.
        let mut w = LogWatcher::start_at(&path, 10_000).unwrap();
        assert_eq!(w.poll().unwrap().lines.len(), 0);
    }
}
