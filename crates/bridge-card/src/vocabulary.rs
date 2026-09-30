//! The card vocabulary: the fields a card can hold (`fields.toml`) and how
//! BBA's `.bbsa` keys map onto them (`bbsa-map.toml`).
//!
//! Both files belong to a rule set, not to this crate: they live in the
//! rules directory, at [`Vocabulary::FIELDS`] and [`Vocabulary::BBSA_MAP`]
//! (`conventions/card/` in this repository), next to the `.bid` modules
//! whose `card` and `param` lines name the fields. There is no built-in
//! vocabulary and no global one: whoever loads the rules loads their
//! vocabulary and passes it on. Every [`Card`] carries the vocabulary it
//! was made with, so reading a setting never consults another.

use std::fmt;
use std::path::Path;
use std::sync::Arc;

use crate::bbsa::{self, Mapping};
use crate::registry::{Registry, Value};
use crate::{Card, Error};

/// A parsed card vocabulary. Cloning is cheap (shared).
#[derive(Clone)]
pub struct Vocabulary(Arc<Inner>);

struct Inner {
    registry: Registry,
    bbsa: bbsa::Map,
    id: String,
}

impl Vocabulary {
    /// Where the fields live, relative to the rules directory.
    pub const FIELDS: &'static str = "card/fields.toml";
    /// Where the `.bbsa` mapping lives, relative to the rules directory.
    pub const BBSA_MAP: &'static str = "card/bbsa-map.toml";

    /// Parse the two files' text. Errors name the file (`fields.toml` or
    /// `bbsa-map.toml`) and, for a syntax error, the line.
    pub fn parse(fields: &str, bbsa_map: &str) -> Result<Vocabulary, Error> {
        let registry = Registry::parse(fields).map_err(|e| e.in_file("fields.toml"))?;
        let bbsa =
            bbsa::parse_mapping(bbsa_map, &registry).map_err(|e| e.in_file("bbsa-map.toml"))?;
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for text in [fields, "\0", bbsa_map] {
            for b in text.bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
        Ok(Vocabulary(Arc::new(Inner {
            registry,
            bbsa,
            id: format!("{h:016x}"),
        })))
    }

    /// Load the vocabulary of the rules in `rules_dir`
    /// (`<rules_dir>/card/fields.toml` and `<rules_dir>/card/bbsa-map.toml`).
    /// Errors name the file by its path.
    pub fn load(rules_dir: &Path) -> Result<Vocabulary, Error> {
        let read = |rel: &str| {
            let path = rules_dir.join(rel);
            std::fs::read_to_string(&path)
                .map_err(|e| Error::new(e.to_string()).in_file(&path.display().to_string()))
        };
        let (fields, map) = (read(Self::FIELDS)?, read(Self::BBSA_MAP)?);
        Vocabulary::parse(&fields, &map).map_err(|mut e| {
            let rel = match e.file.as_deref() {
                Some("bbsa-map.toml") => Self::BBSA_MAP,
                _ => Self::FIELDS,
            };
            e.file = Some(rules_dir.join(rel).display().to_string());
            e
        })
    }

    /// The fields.
    pub fn registry(&self) -> &Registry {
        &self.0.registry
    }

    /// Identifies the vocabulary: a hash of both files' text. Two
    /// vocabularies parsed from the same text have the same id and compare
    /// equal.
    pub fn id(&self) -> &str {
        &self.0.id
    }

    /// An empty card in this vocabulary.
    pub fn new_card(&self) -> Card {
        Card::new(self)
    }

    /// The mapping, by `.bbsa` key.
    pub fn bbsa_mapping(&self) -> &std::collections::HashMap<String, Mapping> {
        &self.0.bbsa.keys
    }

    /// Settings every imported card gets (`[implied]`): conventions BBA
    /// always plays, which have no `.bbsa` key.
    pub fn bbsa_implied(&self) -> &[(String, Value)] {
        &self.0.bbsa.implied
    }

    /// The `[[derived]]` rules as (the fields read, the fields written). A
    /// coverage report needs this: a field nothing reads directly may still
    /// matter, because a derivation turns it into one the rules do read.
    pub fn bbsa_derivations(&self) -> Vec<(Vec<String>, Vec<String>)> {
        self.0.bbsa.derivations()
    }

    pub(crate) fn bbsa(&self) -> &bbsa::Map {
        &self.0.bbsa
    }

    /// Doubtful but legal content, for `rbb bid check`: mapped `.bbsa` keys
    /// that are not in BBA's current file layout (a typo, or a key only
    /// older files have, which export then cannot write).
    pub fn lint(&self) -> Vec<String> {
        bbsa::lint(self.bbsa())
    }
}

impl PartialEq for Vocabulary {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0) || self.0.id == other.0.id
    }
}

impl fmt::Debug for Vocabulary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Vocabulary({}, {} fields, {} .bbsa keys)",
            self.0.id,
            self.0.registry.fields().len(),
            self.0.bbsa.keys.len()
        )
    }
}
