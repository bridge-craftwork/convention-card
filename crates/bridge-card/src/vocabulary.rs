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
    /// The pack this vocabulary came from, when it came from one: its
    /// fields are then named by address and its cards are schema 3.
    pack: Option<crate::Pack>,
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
            pack: None,
        })))
    }

    /// The vocabulary of a pack: its conventions, treatments, settings and
    /// functions, named by address, with card schema 2's paths as aliases.
    /// `bbsa_map` is a `.bbsa` mapping in either naming. `id` should
    /// identify the pack's content (a hash of its files).
    pub fn from_pack(pack: crate::Pack, bbsa_map: &str, id: &str) -> Result<Vocabulary, Error> {
        let registry = pack.registry().clone();
        let bbsa =
            bbsa::parse_mapping(bbsa_map, &registry).map_err(|e| e.in_file("bbsa-map.toml"))?;
        Ok(Vocabulary(Arc::new(Inner {
            registry,
            bbsa,
            id: format!("pack:{id}"),
            pack: Some(pack),
        })))
    }

    /// Load the pack in `dir` as a vocabulary. Its id is a hash of the
    /// pack's files.
    pub fn load_pack(dir: &Path, bbsa_map: &str) -> Result<Vocabulary, Error> {
        let pack = crate::Pack::load(dir)?;
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        let mut files: Vec<std::path::PathBuf> = Vec::new();
        fn walk(d: &Path, out: &mut Vec<std::path::PathBuf>) {
            if let Ok(entries) = std::fs::read_dir(d) {
                for e in entries.flatten() {
                    let p = e.path();
                    if p.is_dir() {
                        walk(&p, out);
                    } else if p.extension().is_some_and(|x| x == "toml") {
                        out.push(p);
                    }
                }
            }
        }
        for sub in ["conventions", "settings", "migrations"] {
            walk(&dir.join(sub), &mut files);
        }
        files.push(dir.join("functions.toml"));
        files.push(dir.join("bridge-pack.toml"));
        files.sort();
        for f in files {
            for b in std::fs::read(&f).unwrap_or_default() {
                h ^= b as u64;
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
        for b in bbsa_map.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        Vocabulary::from_pack(pack, bbsa_map, &format!("{h:016x}"))
    }

    /// The pack this vocabulary came from, if it came from one.
    pub fn pack(&self) -> Option<&crate::Pack> {
        self.0.pack.as_ref()
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

    /// Load the vocabulary of a spec directory laid out as this
    /// repository's `spec/`: `fields.toml` and `formats/bbsa-map.toml`.
    /// [`crate::standard`] has the standard one built in.
    pub fn load_spec(spec_dir: &Path) -> Result<Vocabulary, Error> {
        let read = |rel: &str| {
            let path = spec_dir.join(rel);
            std::fs::read_to_string(&path)
                .map_err(|e| Error::new(e.to_string()).in_file(&path.display().to_string()))
        };
        let (fields, map) = (read("fields.toml")?, read("formats/bbsa-map.toml")?);
        Vocabulary::parse(&fields, &map).map_err(|mut e| {
            let rel = match e.file.as_deref() {
                Some("bbsa-map.toml") => "formats/bbsa-map.toml",
                _ => "fields.toml",
            };
            e.file = Some(spec_dir.join(rel).display().to_string());
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
