//! The standard conventions and skills (ADR-0001): the IDs
//! (`bidding_conventions/stayman`) that a card field (`skill = ...` in
//! `fields.toml`), a lesson's SkillPath tag and a `.bid` module (`skill`
//! header lines) name, with what the spec says about each.
//!
//! The list is `conventions/`, one file per ID ([`Skills::DIR`]). Nothing
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
    /// How an entry writes it (`source = "..."`).
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
    id: String,
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

/// The standard conventions and skills (`conventions/<category>/<name>.toml`).
#[derive(Debug, Clone, Default)]
pub struct Skills {
    skills: BTreeMap<String, Skill>,
}

impl Skills {
    /// Where the list lives, relative to the spec directory: one file per
    /// ID, `<category>/<name>.toml`.
    pub const DIR: &'static str = "conventions";

    /// Parse one entry, the file for `id`. Its `id` line must match.
    pub fn parse_entry(id: &str, text: &str) -> Result<Skill, Error> {
        if !is_skill_path(id) {
            return Err(Error::new(format!(
                "{id:?} is not a skill path (category/name, lower case)"
            )));
        }
        let e: Entry = toml::from_str(text).map_err(|e| Error::toml(&e, text))?;
        if e.id != id {
            return Err(Error::new(format!("id is {:?}, expected {id:?}", e.id)));
        }
        if e.level.is_some_and(|l| !(1..=10).contains(&l)) {
            return Err(Error::new(format!("{id}: level must be 1 to 10")));
        }
        Ok(Skill {
            path: e.id,
            name: e.name,
            source: e.source,
            level: e.level,
            names: e.names,
            summary: e.summary.map(|s| s.trim().to_string()),
            see: e.see,
        })
    }

    /// Collect parsed entries into a list.
    pub fn from_entries(entries: impl IntoIterator<Item = Skill>) -> Skills {
        Skills {
            skills: entries.into_iter().map(|s| (s.path.clone(), s)).collect(),
        }
    }

    /// Load `<spec_dir>/conventions/<category>/<name>.toml`; `None` when
    /// there is no such directory. Errors name the file.
    pub fn load(spec_dir: &Path) -> Result<Option<Skills>, Error> {
        let dir = spec_dir.join(Self::DIR);
        let io = |e: std::io::Error, p: &Path| {
            Error::new(e.to_string()).in_file(&p.display().to_string())
        };
        let categories = match std::fs::read_dir(&dir) {
            Ok(d) => d,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(io(e, &dir)),
        };
        let mut skills = Vec::new();
        for category in categories {
            let category = category.map_err(|e| io(e, &dir))?.path();
            if !category.is_dir() {
                continue;
            }
            for file in std::fs::read_dir(&category).map_err(|e| io(e, &category))? {
                let file = file.map_err(|e| io(e, &category))?.path();
                if file.extension().is_none_or(|x| x != "toml") {
                    continue;
                }
                let id = format!(
                    "{}/{}",
                    category.file_name().unwrap().to_string_lossy(),
                    file.file_stem().unwrap().to_string_lossy()
                );
                let text = std::fs::read_to_string(&file).map_err(|e| io(e, &file))?;
                skills.push(
                    Skills::parse_entry(&id, &text)
                        .map_err(|e| e.in_file(&file.display().to_string()))?,
                );
            }
        }
        Ok(Some(Skills::from_entries(skills)))
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
        let stayman =
            "id = \"bidding_conventions/stayman\"\nname = \"Stayman\"\nsource = \"taxonomy\"\n\
                       level = 3\nsee = [{ title = \"Stayman\", url = \"https://example.org\" }]\n";
        let s = Skills::parse_entry("bidding_conventions/stayman", stayman).unwrap();
        assert_eq!(s.source, SkillSource::Taxonomy);
        assert_eq!(s.level, Some(3));
        let entry = |id: &str, body: &str| {
            Skills::parse_entry(id, &format!("id = \"{id}\"\nname = \"x\"\n{body}"))
        };
        assert!(entry("a/b", "source = \"proposed\"\n").is_ok());
        assert!(entry("Stayman", "source = \"taxonomy\"\n").is_err());
        assert!(entry("a/b", "source = \"other\"\n").is_err());
        assert!(entry("a/b", "source = \"proposed\"\nlevel = 11\n").is_err());
        assert!(entry("a/b", "source = \"proposed\"\nlevl = 3\n").is_err());
        // The id line must match the file.
        assert!(
            Skills::parse_entry("a/c", "id = \"a/b\"\nname = \"x\"\nsource = \"proposed\"\n")
                .is_err()
        );
    }

    /// `spec/conventions/` loads, every `skill` a field of `fields.toml`
    /// names is in it, and a convention's level is the lowest level among
    /// the fields that belong to it (their first `skill`).
    #[test]
    fn the_spec_list_covers_the_fields() {
        let spec = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../spec");
        let skills = Skills::load(&spec)
            .expect("spec/conventions/ is valid")
            .expect("spec/conventions/ exists");
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
                    "{}: skill {s} is not in spec/conventions/",
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
