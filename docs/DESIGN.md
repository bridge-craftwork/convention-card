# Design

How the convention card is put together, who uses it, and where each
responsibility lives. Decisions and open questions are tracked in
[DECISIONS.md](DECISIONS.md); the move from the old homes is in
[MIGRATION.md](MIGRATION.md).

## Why a repo of its own

The card began as a lobby tab in Bridge Classroom. It has since become a
general tool, and a cross-repo dependency:

- **The converters are general-purpose.** BBO, bridgeodex, BBA `.bbsa` and the
  ACBL PDFs are formats every bridge player meets, whether or not they use Bridge
  Classroom.
- **The card format already exists twice.** rusty-bidding-bot's `bridge-card`
  crate reads and writes "the nested JSON used by the Bridge-Classroom card
  editor", from its own field list (`conventions/card/fields.toml`). Bridge
  Classroom's `conventionCatalog.js` is a second, separate list. Bridge
  Classroom doesn't even agree with itself: its seed card and its editor catalog
  use different paths for some fields (RKCB is `slam.blackwood.*` in one and
  `other_conventions.blackwood.*` in the other). The crate picked one of each and
  carries the other as an alias.
- **The skill taxonomy exists three times**: in Bridge Classroom
  (`bakerBridgeTaxonomy.js`, `public/data/skillPaths.json`), in the bot
  (`conventions/card/skills.toml`, "a copy: change it there first"), and in
  lesson-studio's validation, whose Contract 4 already proposes a single
  versioned `taxonomy.json`.

One home, one definition, and each consumer depends on it.

## Who uses it

| Consumer | What it needs |
|---|---|
| **People** | The editor at `bridge-craftwork.com/card/`, with no account needed; import from BBO, bridgeodex and PDF; export to the same, plus the ACBL PDFs. |
| **Bridge Classroom** | The editor embedded as a lobby tab; saved cards per user; the "My proficiency" overlay; later, "practice our card". |
| **rusty-bidding-bot** | The Rust card model: read a card, resolve aliases and defaults, and switch rule modules on from its agreements. `.bbsa` import and export. |
| **lesson-studio** | The skill vocabulary, to validate lesson front matter. |
| **Lesson collections** (Baker-Bridge, Practice-Bidding-Scenarios, …) | The skill vocabulary, to tag boards with skills in their manifests. |
| **Better BBO Convention Card** (browser extension) | BBO import/export and the PDF renderer. |

## The four parts

### 1. The spec (`spec/`): data, not code

Language-neutral files that every other part reads:

- **Fields** (`fields.toml`): every setting a card can hold, declared once.
  Each field has a dotted path (`notrump.one_nt.range_min`), a kind
  (`bool | int | enum | text`), a label, options or bounds, a default, a
  description, **aliases** (older paths that still load) and the **skill(s)** it
  is taught under. This starts from the bot's `fields.toml`, which is already
  the more rigorous of the two lists, merged with the display text from
  `conventionCatalog.js`.
- **Format maps**: how each outside format lands on the fields. The first is the
  bot's `bbsa-map.toml`. BBO, bridgeodex and the ACBL PDF field maps are tables
  inside JavaScript today and move into data over time, not on day one.
- **Skills**: the teaching-skill vocabulary (path, display name, level). See
  [The skill taxonomy](#the-skill-taxonomy). A convention is a skill that can
  appear on a card, and this is the **standard list** of them. Conventions
  outside it are named under their author's own namespace and carried in the
  card's `other_agreements` list: see
  [ADR-0001](adr/0001-standard-and-namespaced-conventions.md).

**The interchange format is Bridge Classroom's existing nested `card_data`
JSON.** Cards already saved in Bridge Classroom must keep loading unchanged. A
field is never renamed without adding the old path as an alias, and fields a
reader does not know are kept and written back untouched, as the Rust crate
already does.

### 2. The JavaScript library (repo root + `js/`)

Reads and writes cards against the spec, and holds the converters: BBO,
bridgeodex, `.bbsa` (later), the ACBL fillable-PDF export
(`acblClassicFillPdf.js`), the drawn PDF (`acblCardPdf.js`), and PDF re-import
(the source card is embedded in the PDF's Info dictionary). No framework and no
network: it runs in a page, a browser extension or Node.

The library's `package.json` sits at the **repository root**, because npm can
install a GitHub dependency only from a repo's root. The editor in `web/` is a
separate app with its own `package.json`.

### 3. The editor (`web/`)

The Vue 3 editor that Bridge Classroom has today: a section tree, a detail
panel, purpose-built panels (carding, leads, defense to notrump, …), skill-level
filters and overlays. It builds twice:

- **As a component** that Bridge Classroom embeds, handing it two adapters (see
  below).
- **As a standalone app**, deployed at `bridge-craftwork.com/card/`.

It never talks to a server itself. Everything outside the card goes through
adapters:

```js
// storage: where cards live
{ list(), load(id), save(card), remove(id) }

// overlays (optional): extra per-field information to show beside each field
{ proficiency(fieldPaths) }   // e.g. Bridge Classroom's lesson mastery
```

### 4. The Rust crate (`crates/bridge-card`)

rusty-bidding-bot's crate, moved here with its history: the field registry,
`Card` (load, resolve aliases and defaults, write back), JSON Schema generation,
and `.bbsa` import/export. It has **no built-in vocabulary**: a caller loads one
at run time, and the crate refuses a card from a different vocabulary. That
stays. What changes is where the standard vocabulary comes from (this repo's
`spec/`), with namespaced conventions covering anything a rule author adds
([ADR-0001](adr/0001-standard-and-namespaced-conventions.md)).

## Accounts and storage: local first

**The standalone editor needs no account.** Cards live in the browser
(IndexedDB) and in files the user imports and exports. Nothing is lost if the
browser is cleared, as long as the user exported, and the editor says so plainly.

**Bridge Classroom keeps what it has**: the `convention_cards` table and API,
linking cards to users, and the proficiency overlay. Embedded in Bridge
Classroom, the editor's storage adapter is the Bridge Classroom API.

**"Save to Bridge Classroom" from the standalone editor is a hand-off, not an
API call.** Bridge Classroom's durable session is a cookie on
`api.bridge-classroom.com`. From a page on `bridge-craftwork.com`, sending that
cookie is a third-party cookie, which Safari blocks outright and other browsers
are phasing out. So the standalone editor sends the card *to* Bridge Classroom
(by opening it with the card attached), and Bridge Classroom saves it under its
own signed-in session. The exact mechanism is open (DECISIONS.md).

## The skill taxonomy

The taxonomy splits in two:

- **The skill vocabulary** (which skills exist: path, display name, level
  `basic | intermediate | advanced | expert`) lives **here**, in `spec/`. Card
  fields name skills; lesson-studio validates against it; collections tag
  boards with it; the bot's `.bid` modules name it.
- **Which lessons teach each skill** lives **with each lesson collection**, in
  its collection manifest. Baker-Bridge's `pbn` and `dealCount` per skill, which
  sit in Bridge Classroom's `bakerBridgeTaxonomy.js` today, belong to
  Baker-Bridge.

That split is what makes **"practice our card"** possible without Bridge
Classroom knowing the inside of any collection:

```
card → the fields it switches on → their skills → each collection's manifest
     → boards tagged with those skills → a practice set
```

## Deployment

The editor follows the site conventions in `bridge-craftwork-site`:

- **Its own Cloudflare Pages project** (`convention-card`), deployed by this
  repo's CI. The site's router proxies `bridge-craftwork.com/card/` to it. No
  subdomain: *subdomains are machines, paths are pages*.
- **Relative asset URLs** (`base: './'` in Vite), so the build works at any path
  depth, and `/card` redirects to `/card/`.
- **Machine-readable reference** (site issue #3): `/card/reference.txt`,
  generated from the spec by the same build (so the two can't drift), and a
  `window.card` JavaScript API.
- **Human docs** at `bridge-craftwork.com/docs/card/`, in the site repo.

## Versioning

Tags `vX.Y.Z`; consumers pin a tag. The spec's compatibility promise is the
important one: **a card that loaded under an older version loads under a newer
one**, through aliases. Removing a field or changing its kind is a major
version.
