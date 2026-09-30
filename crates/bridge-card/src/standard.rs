//! The standard vocabulary: this repository's `spec/`, as its text.
//!
//! The crate still has no built-in vocabulary: nothing here is loaded unless
//! a caller asks. A program that depends on this repository at a tag gets the
//! spec of that tag, so the vocabulary it checks cards against is the one it
//! was built with. A program with its own rule set can still load a
//! different vocabulary ([`Vocabulary::parse`], [`Vocabulary::load_spec`]).

use crate::{Error, Skills, Vocabulary};

/// `spec/fields.toml`.
pub const FIELDS: &str = include_str!("../../../spec/fields.toml");
/// `spec/formats/bbsa-map.toml`.
pub const BBSA_MAP: &str = include_str!("../../../spec/formats/bbsa-map.toml");
/// `spec/conventions.json`: every convention and skill, generated from
/// `spec/conventions/` (one file per ID) by CI.
pub const CONVENTIONS_JSON: &str = include_str!("../../../spec/conventions.json");

/// The standard fields and `.bbsa` map.
pub fn vocabulary() -> Result<Vocabulary, Error> {
    Vocabulary::parse(FIELDS, BBSA_MAP)
}

/// The standard conventions and skills.
pub fn conventions() -> Result<Skills, Error> {
    Skills::from_json(CONVENTIONS_JSON)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_standard_spec_loads() {
        let vocab = super::vocabulary().unwrap();
        assert!(vocab.registry().fields().len() > 400);
        let conventions = super::conventions().unwrap();
        assert!(conventions.get("bidding_conventions/stayman").is_some());
        assert!(conventions.iter().count() > 170);
    }
}
