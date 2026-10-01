//! Golden files for the JavaScript `.bbsa` converter (DECISIONS.md, 19):
//! for each test card, the card JSON this crate's import makes of it and the
//! `.bbsa` its export writes back. The JS tests (js/__tests__/bbsa.test.js)
//! must produce the same, so a change in either converter that the other
//! lacks fails a test.
//!
//! The files are in `tests/golden/bbsa/` at the repository root. This test
//! fails when the crate's output differs from them; after an intended
//! change, rewrite them with `BLESS=1 cargo test --test golden` and make the
//! JS converter match.

use std::fs;
use std::path::Path;

use bridge_card::{bbsa, standard};

#[test]
fn bbsa_goldens_match_the_crate() {
    let here = Path::new(env!("CARGO_MANIFEST_DIR"));
    let cards = here.join("tests/fixtures/bbsa");
    let golden = here.join("../../tests/golden/bbsa");
    let bless = std::env::var_os("BLESS").is_some();
    if bless {
        fs::create_dir_all(&golden).unwrap();
    }
    let vocab = standard::vocabulary().unwrap();
    let mut names: Vec<_> = fs::read_dir(&cards)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "bbsa"))
        .collect();
    names.sort();
    assert!(names.len() >= 18);
    let mut stale = Vec::new();
    for path in names {
        let stem = path.file_stem().unwrap().to_string_lossy().to_string();
        let (card, _) = bbsa::import(&vocab, &fs::read_to_string(&path).unwrap(), Some(&stem))
            .unwrap_or_else(|e| panic!("{stem}: {e}"));
        let (exported, _) = bbsa::export(&card);
        for (file, text) in [
            (format!("{stem}.card.json"), card.to_json_string() + "\n"),
            (format!("{stem}.export.bbsa"), exported),
        ] {
            let target = golden.join(&file);
            if bless {
                fs::write(&target, &text).unwrap();
            } else if fs::read_to_string(&target).ok().as_deref() != Some(text.as_str()) {
                stale.push(file);
            }
        }
    }
    assert!(
        stale.is_empty(),
        "golden files out of date (BLESS=1 cargo test --test golden): {stale:?}"
    );
}
