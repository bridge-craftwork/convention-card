//! Import and export of BBA `.bbsa` convention files.
//!
//! A `.bbsa` file is a list of `Key = value` lines: a `System type` integer
//! and on/off toggles, padded with `Not defined` lines. The mapping to card
//! fields is part of the rules' [`Vocabulary`] (`card/bbsa-map.toml` in the
//! rules directory), with the `[[derived]]` rules that expand a card's
//! system into the structural fields it implies; keys it does not cover are
//! kept on the card in [`Card::bba_passthrough`] so that export reproduces
//! them. BBA's file layout (`data/bbsa-layout.txt`) is the file format's,
//! not the vocabulary's, so it stays here.

use std::collections::HashMap;

use crate::registry::{Registry, Value};
use crate::{Card, Error, Vocabulary};

const LAYOUT: &str = include_str!("../data/bbsa-layout.txt");
const PADDING: &str = "Not defined";

/// How one `.bbsa` key maps onto the card.
#[derive(Debug, Clone, PartialEq)]
pub enum Mapping {
    /// On/off toggle for a bool field.
    Toggle(String),
    /// One member of a one-of group: when on, set these values.
    Set(Vec<(String, Value)>),
    /// Integer selecting an enum value by position.
    Index { path: String, values: Vec<String> },
}

/// A parsed `bbsa-map.toml` (held by a [`Vocabulary`]).
pub(crate) struct Map {
    pub(crate) keys: HashMap<String, Mapping>,
    pub(crate) implied: Vec<(String, Value)>,
    derived: Vec<Derived>,
}

/// Fields set from other fields once the keys are read (`[[derived]]`).
///
/// `set` always writes; `default` writes only where the card's own keys
/// left the field unset, so an explicit `.bbsa` key beats the derivation.
struct Derived {
    when: Vec<(String, Value)>,
    set: Vec<(String, Value)>,
    defaults: Vec<(String, Value)>,
}

impl Map {
    /// The `[[derived]]` rules as (the fields read, the fields written).
    pub(crate) fn derivations(&self) -> Vec<(Vec<String>, Vec<String>)> {
        self.derived
            .iter()
            .map(|d| {
                (
                    d.when.iter().map(|(p, _)| p.clone()).collect(),
                    d.set
                        .iter()
                        .chain(&d.defaults)
                        .map(|(p, _)| p.clone())
                        .collect(),
                )
            })
            .collect()
    }
}

/// Mapped keys that BBA's current layout does not have (see
/// [`Vocabulary::lint`]).
pub(crate) fn lint(map: &Map) -> Vec<String> {
    let layout: Vec<&str> = LAYOUT.lines().collect();
    let mut keys: Vec<&String> = map
        .keys
        .keys()
        .filter(|k| !layout.contains(&k.as_str()))
        .collect();
    keys.sort();
    keys.into_iter()
        .map(|k| format!("bbsa-map.toml: {k:?} is not a key of BBA's current .bbsa layout"))
        .collect()
}

/// Parse `bbsa-map.toml` against the fields in `registry`.
pub(crate) fn parse_mapping(text: &str, registry: &Registry) -> Result<Map, Error> {
    let validate = |key: &str, mapping: &Mapping| validate(registry, key, mapping);
    let mut table: toml::Table = toml::from_str(text).map_err(|e| Error::toml(&e, text))?;
    let mut implied = Vec::new();
    if let Some(toml::Value::Table(t)) = table.remove("implied") {
        for (path, v) in t {
            let v = Value::from_toml(&v)
                .ok_or_else(|| Error::new(format!("[implied] {path}: unsupported value")))?;
            validate(&path, &Mapping::Set(vec![(path.clone(), v.clone())]))?;
            implied.push((path, v));
        }
    }
    let mut derived = Vec::new();
    if let Some(v) = table.remove("derived") {
        let entries = v
            .as_array()
            .ok_or_else(|| Error::new("[[derived]] must be an array of tables"))?;
        for (i, e) in entries.iter().enumerate() {
            let pairs = |name: &str| -> Result<Vec<(String, Value)>, Error> {
                let Some(t) = e.get(name) else {
                    return Ok(Vec::new());
                };
                let t = t.as_table().ok_or_else(|| {
                    Error::new(format!("[[derived]] #{}: `{name}` must be a table", i + 1))
                })?;
                t.iter()
                    .map(|(path, v)| {
                        let v = Value::from_toml(v).ok_or_else(|| {
                            Error::new(format!("[[derived]] #{}: {path}: unsupported value", i + 1))
                        })?;
                        validate(path, &Mapping::Set(vec![(path.clone(), v.clone())]))?;
                        Ok((path.clone(), v))
                    })
                    .collect()
            };
            let d = Derived {
                when: pairs("when")?,
                set: pairs("set")?,
                defaults: pairs("default")?,
            };
            if d.set.is_empty() && d.defaults.is_empty() {
                return Err(Error::new(format!(
                    "[[derived]] #{}: neither `set` nor `default` is given",
                    i + 1
                )));
            }
            if let Some((path, _)) = d
                .set
                .iter()
                .find(|(p, _)| d.defaults.iter().any(|(q, _)| q == p))
            {
                return Err(Error::new(format!(
                    "[[derived]] #{}: {path} is in both `set` and `default`",
                    i + 1
                )));
            }
            derived.push(d);
        }
    }
    let mut out = HashMap::new();
    for (key, spec) in table {
        let bad = |msg: &str| Error::new(format!("{key:?}: {msg}"));
        let mapping = match &spec {
            toml::Value::String(path) => Mapping::Toggle(path.clone()),
            toml::Value::Table(t) if t.contains_key("set") => {
                let set = t["set"]
                    .as_table()
                    .ok_or_else(|| bad("`set` must be a table"))?;
                let mut pairs = Vec::new();
                for (path, v) in set {
                    let v = Value::from_toml(v).ok_or_else(|| bad("unsupported value"))?;
                    pairs.push((path.clone(), v));
                }
                Mapping::Set(pairs)
            }
            toml::Value::Table(t) if t.contains_key("index") => {
                let path = t["index"]
                    .as_str()
                    .ok_or_else(|| bad("`index` must be a path"))?;
                let values = t
                    .get("values")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| bad("`values` must be a list"))?
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(str::to_string)
                            .ok_or_else(|| bad("values must be strings"))
                    })
                    .collect::<Result<_, _>>()?;
                Mapping::Index {
                    path: path.to_string(),
                    values,
                }
            }
            _ => return Err(bad("expected a path, {set = ...} or {index = ...}")),
        };
        validate(&key, &mapping)?;
        out.insert(key, mapping);
    }
    let map = Map {
        keys: out,
        implied,
        derived,
    };
    // Export writes a key from the fields it maps, so a field a derivation
    // writes must be one no key maps: otherwise importing and exporting a
    // file would switch on a key it never had.
    let written: Vec<&str> = map
        .keys
        .values()
        .flat_map(|m| match m {
            Mapping::Toggle(path) => vec![path.as_str()],
            Mapping::Set(pairs) => pairs.iter().map(|(p, _)| p.as_str()).collect(),
            Mapping::Index { path, .. } => vec![path.as_str()],
        })
        .collect();
    for (_, outputs) in map.derivations() {
        for path in outputs {
            let field = registry
                .get(&path)
                .map_or(path.as_str(), |f| f.path.as_str());
            if written
                .iter()
                .any(|w| registry.get(w).map_or(*w, |f| f.path.as_str()) == field)
            {
                return Err(Error::new(format!(
                    "[[derived]] writes {path}, which a .bbsa key also writes"
                )));
            }
        }
    }
    Ok(map)
}

/// Every mapped path must exist and every value must fit its field.
fn validate(registry: &Registry, key: &str, mapping: &Mapping) -> Result<(), Error> {
    let check = |path: &str, v: Value| {
        let field = registry
            .get(path)
            .ok_or_else(|| Error::new(format!("{key:?}: unknown field {path}")))?;
        field
            .normalize(v)
            .map(|_| ())
            .map_err(|e| Error::new(format!("{key:?}: {path}: {e}")))
    };
    match mapping {
        Mapping::Toggle(path) => check(path, Value::Bool(true)),
        Mapping::Set(pairs) => pairs.iter().try_for_each(|(p, v)| check(p, v.clone())),
        Mapping::Index { path, values } => values
            .iter()
            .try_for_each(|v| check(path, Value::Text(v.clone()))),
    }
}

/// Parse `.bbsa` text into `(key, value)` pairs, in file order.
pub fn parse(text: &str) -> Result<Vec<(String, i64)>, Error> {
    let mut entries = Vec::new();
    for (n, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let (key, value) = line
            .rsplit_once('=')
            .ok_or_else(|| Error::new(format!("line {}: expected `Key = value`", n + 1)))?;
        let value = value.trim().parse().map_err(|_| {
            Error::new(format!(
                "line {}: {:?} is not an integer",
                n + 1,
                value.trim()
            ))
        })?;
        entries.push((key.trim().to_string(), value));
    }
    Ok(entries)
}

/// What an import did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportReport {
    /// Keys applied to card fields.
    pub mapped: usize,
    /// Keys with no card field, kept in `bba_passthrough`, with their values.
    pub passthrough: Vec<(String, i64)>,
    /// Problems (unexpected values, conflicting one-of keys).
    pub warnings: Vec<String>,
}

/// Convert `.bbsa` text to a card in `vocab`.
pub fn import(
    vocab: &Vocabulary,
    text: &str,
    name: Option<&str>,
) -> Result<(Card, ImportReport), Error> {
    let map = vocab.bbsa();
    let mut card = Card::new(vocab);
    card.metadata.name = name.map(str::to_string);
    for (path, v) in &map.implied {
        card.set(path, v.clone())?;
    }
    let mut report = ImportReport::default();
    for (key, value) in parse(text)? {
        if key == PADDING {
            continue;
        }
        let Some(mapping) = map.keys.get(&key) else {
            report.passthrough.push((key.clone(), value));
            card.bba_passthrough.insert(key, value);
            continue;
        };
        report.mapped += 1;
        match mapping {
            Mapping::Toggle(path) => {
                if value != 0 && value != 1 {
                    report
                        .warnings
                        .push(format!("{key} = {value}: expected 0 or 1"));
                }
                card.set(path, Value::Bool(value != 0))?;
            }
            Mapping::Set(pairs) => {
                if value == 0 {
                    continue;
                }
                for (path, v) in pairs {
                    if let Some(old) = card.get(path).filter(|old| *old != v) {
                        report
                            .warnings
                            .push(format!("{key} overrides {path} = {old}"));
                    }
                    card.set(path, v.clone())?;
                }
            }
            Mapping::Index { path, values } => {
                match usize::try_from(value).ok().and_then(|i| values.get(i)) {
                    Some(v) => card.set(path, Value::Text(v.clone()))?,
                    None => report
                        .warnings
                        .push(format!("{key} = {value}: no such option")),
                }
            }
        }
    }
    apply_derived(&mut card, &map.derived)?;
    Ok((card, report))
}

/// Apply the `[[derived]]` rules to a card whose keys have been read.
///
/// The first entry that holds decides each field; later entries may decide
/// other fields (so a fallback for one field does not block another). A
/// `default` field is left alone when the card already has a value of its
/// own, so a `.bbsa` key always beats the derived value.
fn apply_derived(card: &mut Card, derived: &[Derived]) -> Result<(), Error> {
    let mut done: Vec<&str> = Vec::new();
    for d in derived {
        let holds = d
            .when
            .iter()
            .all(|(path, v)| card.effective(path).unwrap_or(&Value::Bool(false)) == v);
        if !holds {
            continue;
        }
        for (path, v) in &d.set {
            if !done.contains(&path.as_str()) {
                card.set(path, v.clone())?;
                done.push(path);
            }
        }
        for (path, v) in &d.defaults {
            if !done.contains(&path.as_str()) {
                if card.get(path).is_none() {
                    card.set(path, v.clone())?;
                }
                done.push(path);
            }
        }
    }
    Ok(())
}

/// What an export did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ExportReport {
    /// Passthrough keys that are not in the current `.bbsa` layout (older
    /// files) and so were not written.
    pub dropped: Vec<String>,
}

/// Convert a card to `.bbsa` text in BBA's current 258-line layout (CRLF),
/// through the mapping of the card's own vocabulary.
pub fn export(card: &Card) -> (String, ExportReport) {
    let vocab = card.vocabulary();
    let mut report = ExportReport::default();
    let layout: Vec<&str> = LAYOUT.lines().collect();
    let mut out = String::new();
    for key in &layout {
        let value = if *key == PADDING {
            0
        } else if let Some(mapping) = vocab.bbsa_mapping().get(*key) {
            export_value(card, mapping)
        } else {
            card.bba_passthrough.get(*key).copied().unwrap_or(0)
        };
        out.push_str(&format!("{key} = {value}\r\n"));
    }
    for key in card.bba_passthrough.keys() {
        if !layout.contains(&key.as_str()) {
            report.dropped.push(key.clone());
        }
    }
    (out, report)
}

fn export_value(card: &Card, mapping: &Mapping) -> i64 {
    match mapping {
        Mapping::Toggle(path) => card.is_on(path) as i64,
        Mapping::Set(pairs) => pairs.iter().all(|(p, v)| card.get(p) == Some(v)) as i64,
        Mapping::Index { path, values } => match card.effective(path) {
            Some(Value::Text(v)) => values.iter().position(|o| o == v).unwrap_or(0) as i64,
            _ => 0,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vocab() -> &'static Vocabulary {
        crate::test_vocabulary()
    }

    fn import(text: &str, name: Option<&str>) -> Result<(Card, ImportReport), Error> {
        super::import(vocab(), text, name)
    }

    #[test]
    fn mapping_is_valid() {
        assert!(vocab().bbsa_mapping().len() > 130);
    }

    #[test]
    fn layout_keys_are_mapped_or_passed_through() {
        // Every mapped key is in the layout; the rest round-trip through
        // passthrough. This guards against typos in the map file.
        assert_eq!(vocab().lint(), Vec::<String>::new());
        let typo = parse_mapping(
            r#""Smolen typo" = "notrump.smolen.play""#,
            vocab().registry(),
        );
        assert_eq!(lint(&typo.unwrap()).len(), 1);
    }

    /// A `default` derivation fills a field the keys left unset, and leaves
    /// alone one the card already has. (No `.bbsa` key writes a derived
    /// field today — see `derived_fields_are_not_written_by_a_key` — so the
    /// precedence is exercised on a mapping of its own.)
    #[test]
    fn derived_default_yields_to_a_value_the_card_has() {
        let m = parse_mapping(
            r#"
[[derived]]
when    = { "general.system_category" = "acol" }
default = { "major_openings.five_card_majors" = false }
"#,
            vocab().registry(),
        )
        .unwrap();
        let acol = || {
            let mut card = Card::new(vocab());
            card.set("general.system_category", Value::Text("acol".into()))
                .unwrap();
            card
        };

        let mut derived_only = acol();
        apply_derived(&mut derived_only, &m.derived).unwrap();
        assert_eq!(
            derived_only.get("major_openings.five_card_majors"),
            Some(&Value::Bool(false))
        );

        let mut set_by_the_card = acol();
        set_by_the_card
            .set("major_openings.five_card_majors", Value::Bool(true))
            .unwrap();
        apply_derived(&mut set_by_the_card, &m.derived).unwrap();
        assert_eq!(
            set_by_the_card.get("major_openings.five_card_majors"),
            Some(&Value::Bool(true)),
            "the card's own value must beat the derived default"
        );

        // A different system leaves the field alone altogether.
        let mut precision = Card::new(vocab());
        precision
            .set("general.system_category", Value::Text("precision".into()))
            .unwrap();
        apply_derived(&mut precision, &m.derived).unwrap();
        assert_eq!(precision.get("major_openings.five_card_majors"), None);
    }

    /// Export writes a key from the fields it maps, so a field a derivation
    /// writes must be one no key maps: otherwise importing and exporting a
    /// file would switch on a key it never had.
    /// (`parse_mapping` refuses such a map; the real one parses.)
    #[test]
    fn derived_fields_are_not_written_by_a_key() {
        let err = parse_mapping(
            r#"
"SMOLEN" = "notrump.smolen.play"
[[derived]]
set = { "notrump.smolen.play" = true }
"#,
            vocab().registry(),
        )
        .err()
        .expect("a derived field a key writes is refused");
        assert!(err.message.contains("notrump.smolen.play"), "{err}");
    }

    /// The system preset expands into the structural fields it implies.
    #[test]
    fn system_category_expands_into_structural_fields() {
        let card = |system: i64| {
            import(&format!("System type = {system}\r\n"), None)
                .unwrap()
                .0
        };

        let two_over_one = card(0);
        assert!(two_over_one.is_on("major_openings.five_card_majors"));
        assert_eq!(
            two_over_one.get("major_openings.min_length_1st_2nd"),
            Some(&Value::Text("5".into()))
        );
        assert!(two_over_one.is_on("major_openings.two_over_one.game_force"));
        assert!(!two_over_one.is_on("general.forcing_opening_1c"));

        let sayc = card(1);
        assert!(sayc.is_on("major_openings.five_card_majors"));
        assert_eq!(
            sayc.get("major_openings.two_over_one.game_force"),
            Some(&Value::Bool(false))
        );

        // Polish club: nothing is derived, so every structural field is
        // left at the registry default.
        let polish = card(2);
        for path in [
            "major_openings.five_card_majors",
            "major_openings.min_length_1st_2nd",
            "minor_openings.one_club.art_forcing",
            "general.forcing_opening_1c",
            "general.forcing_opening_2c",
        ] {
            assert_eq!(polish.get(path), None, "{path} was derived for polish_club");
        }

        let precision = card(3);
        assert!(precision.is_on("general.forcing_opening_1c"));
        assert!(precision.is_on("minor_openings.one_club.art_forcing"));
        assert_eq!(
            precision.get("general.forcing_opening_2c"),
            Some(&Value::Bool(false))
        );
        assert!(precision.is_on("major_openings.five_card_majors"));
        // The Precision 1C is any shape; the field cannot say that.
        assert_eq!(precision.get("minor_openings.one_club.min_length"), None);

        let acol = card(4);
        assert_eq!(
            acol.get("major_openings.five_card_majors"),
            Some(&Value::Bool(false))
        );
        for seat in ["min_length_1st_2nd", "min_length_3rd_4th"] {
            assert_eq!(
                acol.get(&format!("major_openings.{seat}")),
                Some(&Value::Text("4".into()))
            );
        }
        assert!(acol.is_on("general.forcing_opening_2c"));
    }

    #[test]
    fn one_of_group_sets_range() {
        let (card, _) = import("1NT opening range 12-14 = 1\r\n", None).unwrap();
        assert_eq!(card.get("notrump.one_nt.range_min"), Some(&Value::Int(12)));
        assert_eq!(card.get("notrump.one_nt.range_max"), Some(&Value::Int(14)));
    }
}
