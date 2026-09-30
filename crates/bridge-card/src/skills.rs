//! Teaching skills: the SkillPath strings Bridge-Classroom tags its lessons
//! with (`bidding_conventions/stayman`), which a card field (`skill = ...`
//! in `fields.toml`) and a `.bid` module (`skill` header lines) may name.
//!
//! The known paths are the rules directory's `card/skills.toml`
//! ([`Skills::FILE`]): Bridge-Classroom's taxonomy, the tags its lessons
//! use beyond it, and the paths we propose. Nothing refuses to load over an
//! unknown path; `rbb bid check` warns and `rbb bid skills` lists it.

use std::collections::BTreeMap;
use std::path::Path;

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

/// Where a known skill path comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SkillSource {
    /// Bridge-Classroom's taxonomy (`public/data/skillPaths.json`).
    Taxonomy,
    /// A SkillPath tag its lesson files use that the taxonomy lacks.
    Lessons,
    /// Proposed by us for a convention the taxonomy has no skill for; not
    /// in Bridge-Classroom yet.
    Proposed,
}

impl SkillSource {
    /// The table in `skills.toml` that lists it.
    pub fn table(self) -> &'static str {
        match self {
            SkillSource::Taxonomy => "taxonomy",
            SkillSource::Lessons => "lessons",
            SkillSource::Proposed => "proposed",
        }
    }
}

/// One known skill path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skill {
    pub path: String,
    pub name: String,
    pub source: SkillSource,
}

/// The known skill paths (`card/skills.toml`).
#[derive(Debug, Clone, Default)]
pub struct Skills {
    skills: BTreeMap<String, Skill>,
}

impl Skills {
    /// Where the list lives, relative to the rules directory.
    pub const FILE: &'static str = "card/skills.toml";

    /// Parse the `skills.toml` format: tables `[taxonomy]`, `[lessons]` and
    /// `[proposed]`, each mapping a skill path to its display name.
    pub fn parse(text: &str) -> Result<Skills, Error> {
        let table: toml::Table = toml::from_str(text).map_err(|e| Error::toml(&e, text))?;
        let mut skills = BTreeMap::new();
        for (key, entries) in table {
            let source = match key.as_str() {
                "taxonomy" => SkillSource::Taxonomy,
                "lessons" => SkillSource::Lessons,
                "proposed" => SkillSource::Proposed,
                _ => {
                    return Err(Error::new(format!(
                        "unknown table [{key}]: expected [taxonomy], [lessons] or [proposed]"
                    )))
                }
            };
            let entries = entries
                .as_table()
                .ok_or_else(|| Error::new(format!("[{key}] is not a table")))?;
            for (path, name) in entries {
                if !is_skill_path(path) {
                    return Err(Error::new(format!(
                        "[{key}] {path:?} is not a skill path (category/name, lower case)"
                    )));
                }
                let name = name
                    .as_str()
                    .ok_or_else(|| Error::new(format!("[{key}] {path}: expected a name")))?;
                let skill = Skill {
                    path: path.clone(),
                    name: name.to_string(),
                    source,
                };
                if let Some(old) = skills.insert(path.clone(), skill) {
                    return Err(Error::new(format!(
                        "{path} is listed in [{}] and [{key}]",
                        old.source.table()
                    )));
                }
            }
        }
        Ok(Skills { skills })
    }

    /// Load `<rules_dir>/card/skills.toml`; `None` when the rules have none.
    pub fn load(rules_dir: &Path) -> Result<Option<Skills>, Error> {
        let path = rules_dir.join(Self::FILE);
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
    fn parses_the_three_tables() {
        let s = Skills::parse(
            "[taxonomy]\n\"bidding_conventions/stayman\" = \"Stayman\"\n\
             [proposed]\n\"bidding_conventions/smolen\" = \"Smolen\"\n",
        )
        .unwrap();
        assert_eq!(
            s.get("bidding_conventions/smolen").unwrap().source,
            SkillSource::Proposed
        );
        assert!(Skills::parse("[other]\n").is_err());
        assert!(Skills::parse("[taxonomy]\n\"Stayman\" = \"x\"\n").is_err());
        let twice = "[taxonomy]\n\"a/b\" = \"x\"\n[proposed]\n\"a/b\" = \"x\"\n";
        assert!(Skills::parse(twice).is_err());
    }

    /// `spec/skills.toml` loads, and every `skill` a field of
    /// `fields.toml` names is in it.
    #[test]
    fn the_rules_skill_list_covers_the_fields() {
        let skills = Skills::parse(include_str!("../../../spec/skills.toml"))
            .expect("spec/skills.toml is valid");
        assert!(
            skills
                .iter()
                .filter(|s| s.source == SkillSource::Taxonomy)
                .count()
                >= 50
        );
        let mut tagged = 0;
        for f in crate::test_vocabulary().registry().fields() {
            for s in &f.skill {
                tagged += 1;
                assert!(
                    skills.get(s).is_some(),
                    "{}: skill {s} is not in skills.toml",
                    f.path
                );
            }
        }
        assert!(tagged > 20);
    }
}
