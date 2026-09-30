# convention-card

A bridge convention card: one shared definition of what a card can say, a
browser editor for it, and converters to and from the formats bridge players
already use.

> **Status: being assembled.** The code currently lives in
> [Bridge-Classroom](https://github.com/bridge-craftwork/Bridge-Classroom) and
> [rusty-bidding-bot](https://github.com/bridge-craftwork/rusty-bidding-bot) and
> is moving here in stages. See [docs/MIGRATION.md](docs/MIGRATION.md) for what has
> moved and what hasn't.

## What's here (when assembled)

| Part | What it is | Used by |
|---|---|---|
| **The card spec** (`spec/`) | Data files that define every field a card can hold (its type, label, allowed values, default, and the teaching skill it belongs to), how other formats map onto those fields, and the list of teaching skills. | Everything below |
| **JavaScript library** (`js/`) | Read and write cards; import and export BBO, bridgeodex and BBA `.bbsa` cards; fill the official ACBL convention card PDFs and read them back. | The editor, Bridge Classroom, the Better BBO Convention Card browser extension |
| **The editor** (`web/`) | A browser app for building and editing a card, at [bridge-craftwork.com/card](https://bridge-craftwork.com/card/). No account needed. | Anyone; also embedded in Bridge Classroom |
| **Rust crate** (`crates/bridge-card`) | The same card model for Rust programs: load, check and convert cards. | rusty-bidding-bot |

A card records a partnership's **agreements**: "we play Smolen", "our 1NT is
15–17". It does not define what the bids mean; that is up to whatever reads the
card (a bidding bot, a teaching app, a human partner).

## Using it from another project

There are no published packages. Depend on this repository directly from
GitHub, pinned to a tag:

```toml
# Cargo.toml
bridge-card = { git = "https://github.com/bridge-craftwork/convention-card", tag = "v0.1.0" }
```

```jsonc
// package.json
"@bridge-craftwork/convention-card": "github:bridge-craftwork/convention-card#v0.1.0"
```

The spec files in `spec/` are plain TOML/JSON, so a program in any language can
read them without either library.

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md) — how the pieces fit together, and why.
- [docs/DECISIONS.md](docs/DECISIONS.md) — what has been decided, and what is still open.
- [docs/MIGRATION.md](docs/MIGRATION.md) — moving the code here from its current homes.

## License

Dual-licensed under either of

- [MIT license](LICENSE-MIT)
- [Apache License, Version 2.0](LICENSE-APACHE)

at your option. Contributions are accepted under the same terms.
