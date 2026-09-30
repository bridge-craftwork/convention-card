# The standard conventions and skills

One file per ID (ADR-0001): `<category>/<name>.toml`, and the path is the ID.
`bidding_conventions/stayman.toml` is `bidding_conventions/stayman`.

A convention is a skill that can appear on a card (ADR-0001 D2), so both live
here under the same IDs. Card fields name their convention with `skill`
(`../fields.toml`); lessons, `.bid` modules and scenarios use the same ID. A
namespaced convention, published in its author's own repo, uses this same
format in its `convention.toml` (ADR-0001 D4), so promoting one to the standard
list (D7) is moving one file.

## Attributes

| Attribute | |
|---|---|
| `id` | The ID; must match the file's path. |
| `name` | Display name. |
| `source` | Where the ID came from: `"taxonomy"` (Bridge Classroom's list, `public/data/skillPaths.json`, as of 2026-09-28), `"lessons"` (a tag lesson files use that the taxonomy lacks) or `"proposed"` (ours). |
| `level` | 1–10, how hard it is to learn: the lowest level at which it is taught. Its extensions carry their own levels on their fields. Named bands are derived, never stored: basic 1–3, intermediate 4–6, advanced 7–8, expert 9–10 (DECISIONS.md, 11–13). |
| `names` | The ways people write it, for finding it in a card's free text. |
| `summary` | What it is, in a few lines of our own words, sized for a chat line; suits as ♣♦♥♠. |
| `see` | Citations only: where to read more, and what informed our treatment. Never another source's text, summaries or levels. Each `{ title, by?, site?, url?, kind? ("book"), chapter? }`. |

See `docs/DESIGN.md`, "Describing a convention" and "Difficulty levels".

`categories.toml` gives each category (an ID's first segment) its display name.

## The generated files

Never edit these by hand. `scripts/build_conventions.py` writes them, and CI
runs it on every push to `main` that changes a file here, committing the
result. To check locally: `python3 scripts/build_conventions.py --check`.

- `../conventions.json`: every entry in one file, for readers that cannot list
  a directory (the JS library in a browser). The Rust crate has it built in
  (`bridge_card::standard`).
- `../taxonomy.json`: lesson-studio's Contract 4 (`taxonomy/v1`): each skill's
  path, name, category and its level as a band (basic 1–3, intermediate 4–6,
  advanced 7–8, expert 9–10). Entries without a level (`practice_deals`, which
  is content rather than a skill) are left out. Its `version` is the repo's
  (`Cargo.toml`); its `generated` date changes only when its content does.
