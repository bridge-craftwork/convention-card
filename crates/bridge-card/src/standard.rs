//! The standard vocabulary: this repository's copy of the convention pack
//! (`spec/pack.json`, bridge-common-conventions' published snapshot) and its
//! own `.bbsa` map, as their text.
//!
//! The crate still has no built-in vocabulary: nothing here is loaded unless
//! a caller asks. A program that depends on this repository at a tag gets the
//! pack of that tag, so the vocabulary it checks cards against is the one it
//! was built with. A program handed a newer snapshot, or with its own rule
//! set, loads that instead ([`Vocabulary::from_snapshot`],
//! [`Vocabulary::load_pack`], [`Vocabulary::parse`]).

use crate::{Error, Skills, Vocabulary};

/// `spec/pack.json`: the convention pack's snapshot, without its rule files.
pub const PACK: &str = include_str!("../../../spec/pack.json");
/// `spec/formats/bbsa-map.toml`.
pub const BBSA_MAP: &str = include_str!("../../../spec/formats/bbsa-map.toml");

/// The pack's conventions, treatments and settings, and the `.bbsa` map.
pub fn vocabulary() -> Result<Vocabulary, Error> {
    Vocabulary::from_snapshot(PACK, BBSA_MAP)
}

/// The pack's definitions: every convention and skill.
pub fn conventions() -> Result<Skills, Error> {
    Skills::from_snapshot(PACK)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_standard_pack_loads() {
        let vocab = super::vocabulary().unwrap();
        assert!(vocab.registry().fields().len() > 400);
        let conventions = super::conventions().unwrap();
        assert!(conventions.get("bidding_conventions/stayman").is_some());
        assert!(conventions.iter().count() > 170);
    }
}
