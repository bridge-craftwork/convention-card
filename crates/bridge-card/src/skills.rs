//! The standard conventions and skills (ADR-0001): the IDs
//! (`bidding_conventions/stayman`) that a card field (`skill = ...` in
//! `fields.toml`), a lesson's SkillPath tag and a `.bid` module (`skill`
//! header lines) name, with what the spec says about each.
//!
//! The list is `conventions.toml` ([`Skills::FILE`]): one table per ID. Nothing
//! refuses to load over an unknown ID; `rbb bid check` warns and
//! `rbb bid skills` lists it.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Deserialize;

use crate::Error;

/// Whether `s` has the form of a skill path: `category/name`, lower-case
/// letters, digits and underscores on both sides (`precision/1c_opener`).
pub fn is_skill_path(s: &str) -> bool {
    let part = |p: &str| {
        !p.is_empty()
            && p.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    };
    match s.split_once('/') {
        Some((cat, name)) => part(cat) && part(name),
        None => false,
    }
}

/// Where an ID comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    /// Bridge-Classroom's taxonomy (`public/data/skillPaths.json`).
    Taxonomy,
    /// A SkillPath tag its lesson files use that the taxonomy lacks.
    Lessons,
    /// Proposed by us; not in Bridge-Classroom yet.
    Proposed,
}

impl SkillSource {
    /// How `conventions.toml` writes it (`source = "..."`).
    pub fn table(self) -> &'static str {
        match self {
            SkillSource::Taxonomy => "taxonomy",
            SkillSource::Lessons => "lessons",
            SkillSource::Proposed => "proposed",
        }
    }
}

/// A citation: where to read more about a convention. Never another
/// source's text.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Citation {
    pub title: String,
    #[serde(default)]
    pub by: Option<String>,
    #[serde(default)]
    pub site: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    /// `"book"` for a book; unset for a page.
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub chapter: Option<u32>,
}

/// One standard convention or skill.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skill {
    pub path: String,
    pub name: String,
    pub source: SkillSource,
    /// 1-10: the lowest level at which it is taught.
    pub level: Option<u8>,
    /// The ways people write it, for finding it in free text.
    pub names: Vec<String>,
    /// What it is, in a few lines of plain text.
    pub summary: Option<String>,
    pub see: Vec<Citation>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    name: String,
    source: SkillSource,
    #[serde(default)]
    level: Option<u8>,
    #[serde(default)]
    names: Vec<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    see: Vec<Citation>,
}

/// The standard conventions and skills (`conventions.toml`).
#[derive(Debug, Clone, Default)]
pub struct Skills {
    skills: BTreeMap<String, Skill>,
}

impl Skills {
    /// Where the list lives, relative to the spec directory.
    pub const FILE: &'static str = "conventions.toml";

    /// Parse the `conventions.toml` format: one table per ID.
    pub fn parse(text: &str) -> Result<Skills, Error> {
        let table: toml::Table = toml::from_str(text).map_err(|e| Error::toml(&e, text))?;
        let mut skills = BTreeMap::new();
        for (path, entry) in table {
            if !is_skill_path(&path) {
                return Err(Error::new(format!(
                    "{path:?} is not a skill path (category/name, lower case)"
                )));
            }
            let e: Entry = entry
                .try_into()
                .map_err(|e| Error::new(format!("{path}: {e}")))?;
            if e.level.is_some_and(|l| !(1..=10).contains(&l)) {
                return Err(Error::new(format!("{path}: level must be 1 to 10")));
            }
            let summary = e.summary.map(|s| s.trim().to_string());
            skills.insert(
                path.clone(),
                Skill {
                    path,
                    name: e.name,
                    source: e.source,
                    level: e.level,
                    names: e.names,
                    summary,
                    see: e.see,
                },
            );
        }
        Ok(Skills { skills })
    }

    /// Load `<dir>/conventions.toml`; `None` when there is none.
    pub fn load(dir: &Path) -> Result<Option<Skills>, Error> {
        let path = dir.join(Self::FILE);
        match std::fs::read_to_string(&path) {
            Ok(text) => Skills::parse(&text)
                .map(Some)
                .map_err(|e| e.in_file(&path.display().to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(Error::new(e.to_string()).in_file(&path.display().to_string())),
        }
    }

    pub fn get(&self, path: &str) -> Option<&Skill> {
        self.skills.get(path)
    }

    /// Every known skill, by path.
    pub fn iter(&self) -> impl Iterator<Item = &Skill> {
        self.skills.values()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skill_paths_have_a_category_and_a_name() {
        assert!(is_skill_path("bidding_conventions/stayman"));
        assert!(is_skill_path("precision/1c_opener"));
        assert!(!is_skill_path("Stayman"));
        assert!(!is_skill_path("bidding_conventions/Stayman"));
        assert!(!is_skill_path("a/b/c"));
        assert!(!is_skill_path("/stayman"));
    }

    #[test]
    fn parses_entries() {
        let s = Skills::parse(
            "[\"bidding_conventions/stayman\"]\nname = \"Stayman\"\nsource = \"taxonomy\"\nlevel = 3\n\
             see = [{ title = \"Stayman\", url = \"https://example.org\" }]\n\
             [\"bidding_conventions/smolen\"]\nname = \"Smolen\"\nsource = \"proposed\"\n",
        )
        .unwrap();
        assert_eq!(
            s.get("bidding_conventions/smolen").unwrap().source,
            SkillSource::Proposed
        );
        assert_eq!(s.get("bidding_conventions/stayman").unwrap().level, Some(3));
        assert!(Skills::parse("[\"Stayman\"]\nname = \"x\"\nsource = \"taxonomy\"\n").is_err());
        assert!(Skills::parse("[\"a/b\"]\nname = \"x\"\nsource = \"other\"\n").is_err());
        assert!(
            Skills::parse("[\"a/b\"]\nname = \"x\"\nsource = \"proposed\"\nlevel = 11\n").is_err()
        );
        assert!(
            Skills::parse("[\"a/b\"]\nname = \"x\"\nsource = \"proposed\"\nlevl = 3\n").is_err()
        );
    }

    /// `spec/conventions.toml` loads, every `skill` a field of
    /// `fields.toml` names is in it, and a convention's level is the lowest
    /// level among the fields that belong to it (their first `skill`).
    #[test]
    fn the_spec_list_covers_the_fields() {
        let skills = Skills::parse(include_str!("../../../spec/conventions.toml"))
            .expect("spec/conventions.toml is valid");
        assert!(
            skills
                .iter()
                .filter(|s| s.source == SkillSource::Taxonomy)
                .count()
                >= 50
        );
        let mut tagged = 0;
        let mut lowest: BTreeMap<&str, u8> = BTreeMap::new();
        for f in crate::test_vocabulary().registry().fields() {
            for s in &f.skill {
                tagged += 1;
                assert!(
                    skills.get(s).is_some(),
                    "{}: skill {s} is not in conventions.toml",
                    f.path
                );
            }
            if let (Some(s), Some(l)) = (f.skill.first(), f.level) {
                let e = lowest.entry(s).or_insert(l);
                *e = (*e).min(l);
            }
        }
        assert!(tagged > 20);
        for (s, l) in lowest {
            if let Some(level) = skills.get(s).unwrap().level {
                assert_eq!(level, l, "{s}: level {level}, but its lowest field is {l}");
            }
        }
    }
}
