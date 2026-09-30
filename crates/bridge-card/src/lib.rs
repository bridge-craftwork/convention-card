//! Convention card schema and `.bbsa` import.
//!
//! The card records partnership agreements ("we play Smolen", "1NT is 15-17"),
//! addressed by dotted paths such as `notrump.transfers.jacoby`. It does not
//! define what bids mean; that lives in the `conventions/` rule files.
//!
//! The fields a card can hold, and how BBA's `.bbsa` keys map onto them, are
//! the rules' [`Vocabulary`]: `card/fields.toml` and `card/bbsa-map.toml` in
//! the rules directory (`conventions/card/` here), loaded at run time. A
//! [`Card`] is a set of `path = value` pairs in one vocabulary, read from and
//! written to the nested JSON used by the Bridge-Classroom card editor.
//! See docs/DESIGN.md, "The convention card".

pub mod bbsa;
mod card;
mod error;
mod registry;
pub mod schema;
pub mod skills;
pub mod standard;
mod vocabulary;

pub use card::{Card, CardMetadata, LoadReport, OtherAgreement, EXPORT_SCHEMA};
pub use error::Error;
pub use registry::{FieldDef, FieldKind, Registry, Value};
pub use skills::{Skill, SkillSource, Skills};
pub use vocabulary::Vocabulary;

/// This repository's vocabulary (`spec/`), for the unit tests
/// only: the crate itself has no built-in vocabulary.
#[cfg(test)]
pub(crate) fn test_vocabulary() -> &'static Vocabulary {
    static V: std::sync::OnceLock<Vocabulary> = std::sync::OnceLock::new();
    V.get_or_init(|| {
        Vocabulary::parse(
            include_str!("../../../spec/fields.toml"),
            include_str!("../../../spec/formats/bbsa-map.toml"),
        )
        .expect("spec/ is valid")
    })
}
