# Claude Code Notes — convention-card

## What this repo is

The bridge convention card: the **spec** (every field a card can hold, format
maps, the skill vocabulary), a **JavaScript library** (converters, PDF), the
**editor** (Vue 3, served at `bridge-craftwork.com/card/`), and the **Rust
`bridge-card` crate**.

**Read [docs/DESIGN.md](docs/DESIGN.md) first**, then
[docs/DECISIONS.md](docs/DECISIONS.md) for what's settled and what's open, and
the ADRs in [docs/adr/](docs/adr/). ADR-0001 (standard vs namespaced convention
IDs) shapes every tool that names a convention.
[docs/MIGRATION.md](docs/MIGRATION.md) tracks the move from Bridge-Classroom and
rusty-bidding-bot. **As of 2026-10-02**, Phases 0–4 are done: the editor is live at
`bridge-craftwork.com/card/` and embedded in Bridge Classroom.
rusty-bidding-bot depends on `v0.1.0` and Bridge Classroom on `v0.5.0`. Next
is the editor's level filter (decision 12), then Phase 5. A change here reaches a
consumer by a new tag here and a pin bump there.

## Ground rules

- **Saved cards must keep loading.** The interchange format is Bridge
  Classroom's nested `card_data` JSON, and real cards live in its database. Never
  rename a field without keeping the old path as an alias. Keep and write back
  fields you don't recognise.
- **The spec is the single source.** Don't add a field list, an enum, or a skill
  list to JS or Rust code; add it to `spec/` and read it from there.
- **The card records agreements, not bid meanings.** "We play Smolen" belongs
  here; what Smolen's bids mean belongs to whatever reads the card (e.g. the
  bot's rules).
- **The library does no network access and uses no framework.** It must run in a
  page, a browser extension and Node.
- **The editor never talks to a server itself.** Storage and overlays go through
  the adapters (DESIGN.md), so the same component works standalone and inside
  Bridge Classroom.
- **Local first.** The standalone editor needs no account.

## Deployment conventions (from `bridge-craftwork-site`)

- **Paths, not subdomains.** The editor is `bridge-craftwork.com/card/`, served
  by its own Cloudflare Pages project and proxied by the site's router. Never
  `card.bridge-craftwork.com`: subdomains are machines, paths are pages.
- **Relative asset URLs.** `base: './'` in Vite, so the build works at any path
  depth.
- **Machine-readable reference.** Publish `/card/reference.txt`, generated from
  the spec at build time, and a `window.card` API (site issue #3).
- Human docs go in the site repo at `/docs/card/`, not here.

## Distribution

No npm or crates.io packages. Consumers depend on this GitHub repo, pinned to a
tag. The JS library's `package.json` sits at the **repo root**, because npm
can't install a GitHub dependency from a subfolder.

## Licence

MIT OR Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`). This differs from the
Unlicense tool repos on purpose: it matches the Rust crate's existing terms.
Watch what gets bundled. The ACBL PDF templates are hosted here by decision
(DECISIONS.md, decision 10), with their terms to be revisited later. Barlow Condensed is SIL OFL; ship its `OFL.txt`
alongside it.

## Git

- SSH, not HTTPS. Remote: `git@github.com:bridge-craftwork/convention-card.git`
- Org repo, no forks: branch, PR, merge to `main`.
- When moving files in from another repo, keep their history (`git filter-repo`;
  see MIGRATION.md).

## Sibling checkouts

`/Users/rick/Development/GitHub/`:
- `Bridge-Classroom` — the code's current home; keeps saved cards and the API.
- `rusty-bidding-bot` — the Rust crate's current home; a consumer.
- `lesson-studio` — validates against the taxonomy (its Contract 4).
- `Baker-Bridge`, `Practice-Bidding-Scenarios` — lesson collections that tag
  boards with skills.
- `Better-BBO-Convention-Card` — browser extension; will use the library.
- `bridge-craftwork-site` — the site and router for `bridge-craftwork.com`.
- `pbn-to-pdf` — reference for the Pages deploy setup (`pages.yml`).
