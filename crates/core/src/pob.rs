//! Path of Building import-code decoding — fully offline.
//!
//! A PoB code is URL-safe base64 (`-`/`_`) over a zlib-compressed XML
//! document. Only the `<Build>` attributes the app surfaces (class,
//! ascendancy, character level) are extracted; full build parsing is out
//! of scope.

use crate::{Error, Result};
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use flate2::read::ZlibDecoder;
use std::io::Read;

/// Decompressed-XML ceiling; real builds are well under 1 MB.
const MAX_XML_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PobBuildInfo {
    pub class: Option<String>,
    pub ascendancy: Option<String>,
    pub level: Option<i64>,
}

pub fn decode_pob_code(code: &str) -> Result<PobBuildInfo> {
    let compact: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.is_empty() {
        return Err(Error::Other("empty PoB code".into()));
    }
    let bytes = decode_base64(&compact)?;
    let mut xml = String::new();
    ZlibDecoder::new(&bytes[..])
        .take(MAX_XML_BYTES)
        .read_to_string(&mut xml)
        .map_err(|_| Error::Other("not a Path of Building code (decompression failed)".into()))?;
    parse_build_attrs(&xml)
        .ok_or_else(|| Error::Other("decoded, but found no <Build> element".into()))
}

/// PoB emits padded URL-safe base64, but codes get relayed through sites
/// that strip padding or re-encode with the standard alphabet.
fn decode_base64(s: &str) -> Result<Vec<u8>> {
    URL_SAFE
        .decode(s)
        .or_else(|_| URL_SAFE_NO_PAD.decode(s))
        .or_else(|_| STANDARD.decode(s))
        .or_else(|_| STANDARD_NO_PAD.decode(s))
        .map_err(|_| Error::Other("not a Path of Building code (base64 decode failed)".into()))
}

fn parse_build_attrs(xml: &str) -> Option<PobBuildInfo> {
    // Locate the <Build ...> tag (not <BuildSomething>).
    let mut search = xml;
    let tag = loop {
        let i = search.find("<Build")?;
        let after = &search[i + "<Build".len()..];
        match after.chars().next() {
            Some(c) if c.is_whitespace() || c == '>' => {
                break &after[..after.find('>')?];
            }
            _ => search = after,
        }
    };
    // Attributes are space-separated; the leading space disambiguates
    // `className` from `ascendClassName`/`secondaryAscendClassName`.
    let attr = |name: &str| -> Option<String> {
        let pat = format!(" {name}=\"");
        let i = tag.find(&pat)? + pat.len();
        let j = tag[i..].find('"')? + i;
        Some(tag[i..j].to_string())
    };
    let non_empty = |v: String| (!v.is_empty() && v != "None").then_some(v);
    Some(PobBuildInfo {
        class: attr("className").and_then(non_empty),
        ascendancy: attr("ascendClassName").and_then(non_empty),
        level: attr("level").and_then(|v| v.parse().ok()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::ZlibEncoder;
    use flate2::Compression;
    use std::io::Write;

    const SAMPLE_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="92" targetVersion="3_0" bandit="None" className="Witch" ascendClassName="Occultist" secondaryAscendClassName="None" mainSocketGroup="2" viewMode="TREE">
    <PlayerStat stat="Life" value="4903"/>
  </Build>
  <Skills/>
</PathOfBuilding>"#;

    fn encode(xml: &str, engine: &impl Engine) -> String {
        let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
        e.write_all(xml.as_bytes()).unwrap();
        engine.encode(e.finish().unwrap())
    }

    #[test]
    fn decodes_url_safe_code() {
        let info = decode_pob_code(&encode(SAMPLE_XML, &URL_SAFE)).unwrap();
        assert_eq!(info.class.as_deref(), Some("Witch"));
        assert_eq!(info.ascendancy.as_deref(), Some("Occultist"));
        assert_eq!(info.level, Some(92));
    }

    #[test]
    fn decodes_standard_base64_and_whitespace() {
        // Standard alphabet + a line wrap in the middle, as pastes often arrive.
        let mut code = encode(SAMPLE_XML, &STANDARD);
        code.insert(code.len() / 2, '\n');
        let info = decode_pob_code(&code).unwrap();
        assert_eq!(info.class.as_deref(), Some("Witch"));
    }

    #[test]
    fn none_ascendancy_maps_to_absent() {
        let xml = SAMPLE_XML.replace("ascendClassName=\"Occultist\"", "ascendClassName=\"None\"");
        let info = decode_pob_code(&encode(&xml, &URL_SAFE)).unwrap();
        assert_eq!(info.class.as_deref(), Some("Witch"));
        assert_eq!(info.ascendancy, None);
    }

    #[test]
    fn garbage_input_is_a_clean_error() {
        assert!(decode_pob_code("not a code at all!!!").is_err());
        assert!(decode_pob_code("aGVsbG8gd29ybGQ=").is_err()); // valid b64, not zlib
        assert!(decode_pob_code("   ").is_err());
    }
}
