# Migration

Moving the convention card here from Bridge-Classroom and rusty-bidding-bot.
Each phase leaves every consumer working; nothing is switched off before its
replacement is running.

**Keep the history.** Move files with `git filter-repo --path …` on a fresh
clone of the source repo, then merge that history in here
(`git merge --allow-unrelated-histories`), so `git log` and `git blame` still
explain why each line is the way it is.

## What moves

### From Bridge-Classroom (≈ 11,000 lines)

| Source | Lines | Goes to | Notes |
|---|---:|---|---|
| `src/utils/conventionCatalog.js` | 929 | `spec/` + `js/` | Field list → merged into `spec/fields.toml`; display/section layout stays with the editor |
| `src/utils/acblClassicFillPdf.js` | 2,389 | `js/` | Includes the unfinished legibility work; see Phase 0 |
| `src/utils/acblCardPdf.js` | 873 | `js/` | |
| `src/utils/bridgeodexImport.js` | 725 | `js/` | |
| `src/utils/bboImport.js` | 441 | `js/` | |
| `src/utils/ntDefenses.js` | 136 | `js/` | Used only by the card |
| `src/utils/__tests__/bboImport.test.js`, `bridgeodexImport.test.js` | | `js/` tests | |
| `src/composables/useConventionCard.js` | 481 | `web/` | Split: editing state moves; the Bridge Classroom API calls become BC's storage adapter and stay |
| `src/views/ConventionCardView.vue` | 844 | `web/` | |
| `src/components/conventionCard/*.vue` (13 files) | 2,787 | `web/` | |
| `public/templates/acbl-*.pdf` | | `web/public/templates/` | Hosted here (DECISIONS decision 10) |
| `public/fonts/BarlowCondensed-Regular.ttf` + `OFL.txt` | | `web/public/fonts/` | Uncommitted in BC today; arrives with the PDF work |

**Copied, not moved:** `src/utils/cardFormatting.js` (289 lines). Bridge
Classroom uses it everywhere; the card needs a few suit-symbol helpers from it.
Copy those helpers and leave the file where it is.

**Stays in Bridge Classroom:**
- `bridge-classroom-api/src/routes/convention_cards.rs` and the
  `convention_cards` table (saved cards, linking cards to users).
- The proficiency overlay's data (lesson mastery), handed to the editor through
  the overlay adapter.
- `src/utils/bakerBridgeTaxonomy.js`: its skill vocabulary moves to `spec/`,
  but its Baker-Bridge lesson data (`pbn`, `dealCount`) moves to Baker-Bridge's
  manifest (Phase 5).
- `src/utils/cardToTaxonomyMapping.js`, `cardSkills.js`, `studentProgressData.js`
  and `ExerciseEditorModal.vue`. These are Bridge Classroom features that *read*
  the taxonomy; they switch to reading it from this repo.

### From rusty-bidding-bot

| Source | Lines | Goes to |
|---|---:|---|
| `crates/bridge-card/` | 1,872 | `crates/bridge-card/` |
| `conventions/card/fields.toml` | 529 | `spec/fields.toml` (the starting point for the merged list) |
| `conventions/card/bbsa-map.toml` | 296 | `spec/formats/bbsa-map.toml` |
| `conventions/card/skills.toml` | 99 | `spec/conventions/` (DECISIONS decisions 14, 17) |

The bot's other crates (`engine`, `bidspec`, `cli`, `compare`, `wasm`) switch
from the path dependency to a git dependency on this repo.

## Phases

### Phase 0: land the unfinished work where it is *(in Bridge-Classroom)*

**Done 2026-09-30** (Bridge-Classroom #434).

Don't move code that's mid-change.

- Fix the two bugs found in the Classic PDF export on 2026-09-30, then land the
  legibility work:
  1. **Descenders are clipped** in the new condensed font (g, j, p, y): "Strong"
     renders as "Strona", "major" as "maior".
  2. **Enlarged boxes cover the card's printed text**: they strike through the
     headings "DEFENSE VS NOTRUMP", "NOTRUMP OPENING BIDS" and
     "RESPONSES/REBIDS". Growth checks for room only against other form
     fields, not against the page's printed text.
- Land the bridgeodex `14+` fix with it. Only the new PDF code reads the
  `<path>_plus` fields it writes.

**Done when:** a sample export of a full card is legible with no clipped
letters and no struck-through printed text, and the work is merged in
Bridge-Classroom.

### Phase 1: the spec and the Rust crate

**Done 2026-09-30** (tag `v0.1.0`). The crate and the vocabulary moved here with history
(`spec/fields.toml`, `spec/formats/bbsa-map.toml`, `spec/conventions/`),
building and passing its tests against `spec/`. The field lists are merged
section by section (PRs #5, #7–#13): every convention field has a level and
names its convention, `spec/conventions/` has 173 entries with summaries and
citations, every editor-catalog and importer path resolves, and all 11 saved
Bridge Classroom cards (2026-09-30 backup) load with no unknown path or invalid
value and write back without loss. Then (PR #15): choice groups; CI generates
`conventions.json` and Contract 4's `taxonomy.json`; typed `other_agreements`
(ADR-0001 D5) and `Card::names_convention`; the standard vocabulary built into
the crate (`bridge_card::standard`) and `Vocabulary::load_spec`. Tagged
`v0.1.0`; rusty-bidding-bot depends on it (its `bf7811b`), with
`conventions/card/` and `crates/bridge-card` removed there and its tests
passing.

- Move `crates/bridge-card` and `conventions/card/*.toml` here with history.
- Settle DECISIONS open questions 2–3 (reconciling the field lists, the
  taxonomy file). Question 1 is settled by ADR-0001.
- Add `other_agreements` to the spec (ADR-0001 D5).
- Merge `conventionCatalog.js`'s fields into `spec/fields.toml`. Every path any
  saved Bridge Classroom card uses must load, directly or through an alias.
- Point rusty-bidding-bot at this repo (git dependency, pinned tag).

**Done when:** the crate's tests pass here; the bot builds and passes its tests
against the tag; and every card in Bridge Classroom's `convention_cards` table
loads through the crate without error.

### Phase 2: the JavaScript library

**Done 2026-09-30** (tags `v0.2.0`, `v0.2.1`; Bridge-Classroom #437). The converters, the PDF code, their tests,
the template PDFs and the font moved here with history (`js/`, `assets/`);
the library reads the spec as generated JSON and takes its assets from the
caller; a test checks every card path the converters name against the spec
(it found 52 Classic-PDF boxes the spec lacked, now fields); the JS `.bbsa`
converter matches the crate's golden files; the Puppet path is fixed in the
spec (below). Bridge Classroom depends on `v0.2.1` and has deleted its copies;
its tests and build pass, and in its built app both PDFs render and re-import
to the same card.

- Move the converters, the PDF code and their tests here with history.
- The library reads its field list from `spec/`.
- Bridge Classroom depends on the tag and deletes its copies.
- Generate `spec/fields.json` and `spec/formats/bbsa-map.json` in CI, as for
  `conventions.json`, for readers with no TOML parser.
- A JS `.bbsa` converter in parallel with the crate's (decision 19), with
  golden files the crate writes (card JSON and `.bbsa` for each test card)
  that the JS tests must match; "Import .bbsa" and "Export .bbsa" in the
  editor in Phase 3.
- ~~Fix the bridgeodex importer's Puppet Stayman path.~~ Done, in the spec
  rather than the importer: the editor, both PDFs and the BBO and bridgeodex
  importers all mean **1NT** Puppet by `notrump.stayman.puppet`, so that path
  is now an alias of `notrump.stayman.puppet_1nt`, not of 2NT Puppet. No saved
  card used it.

**Done when:** Bridge Classroom's Convention Card tab behaves exactly as before
(import each format, export each PDF, re-import a PDF), its test suite
passes, and the JS `.bbsa` converter matches the crate's golden files.

### Phase 3: the editor

**Under way.** Done here: the view, components, editing state and catalog
moved with history (`web/src/editor/`), split from Bridge Classroom's API and
user store into storage and overlay adapters; the standalone app (`web/`)
with IndexedDB storage, `.bbsa` import and export, and the hand-off to Bridge
Classroom (decision 20); checked in a browser (duplicate, edit, save, reload,
export a PDF and read it back, import and re-export a `.bbsa` byte for byte).
Still to do: tag, and switch Bridge Classroom to embed the editor (with its
adapters and the hand-off's receiving end).

- Move the view and components here; split `useConventionCard.js` into editor
  state (moves) and Bridge Classroom's storage and overlay adapters (stay).
- Bridge Classroom embeds the editor component from the tag.
- Add the standalone build: IndexedDB storage, file import/export, and the
  "Save to Bridge Classroom" hand-off (DECISIONS open question 4).

**Done when:** the lobby tab works as before, including saving and the
proficiency overlay; and the standalone build runs locally with no account.

### Phase 4: publish at `bridge-craftwork.com/card/`

**Live 2026-10-02** (tags `v0.4.0`, `v0.4.1`; bridge-craftwork-site #6). The
Pages project `convention-card`, deployed by `pages.yml`; `reference.txt` and
`llms.txt` from the spec; `window.card`; real 404s; the site's `/card` route,
tile, `/docs/card/` and apex `/llms.txt`. Exercised on the live
`bridge-craftwork.com/card/`: duplicate, edit, save, export the Classic PDF,
import it back to the same card, and the Save to Bridge Classroom link
carries the card. Still to do: see the hand-off saved inside Bridge
Classroom, which needs a signed-in account (Rick's Phase 3 test).

- A Cloudflare Pages project `convention-card`, deployed by CI (copy
  `pbn-to-pdf`'s `pages.yml`).
- `/card/reference.txt` generated from the spec, plus `window.card` (site issue
  #3).
- In `bridge-craftwork-site`: add `/card` to the router's `TOOLS`, a tile, and
  docs at `/docs/card/`.

**Done when:** `bridge-craftwork.com/card/` loads, and a card can be built,
exported to PDF, re-imported, and handed to Bridge Classroom. That means
actually exercised, not just loaded.

### Phase 5: every consumer on the one spec

- rusty-bidding-bot deletes `conventions/card/skills.toml` and reads skills from
  here.
- lesson-studio validates against the taxonomy here (its Contract 4).
- Baker-Bridge carries its skill-to-lesson data in its manifest; Bridge
  Classroom's `bakerBridgeTaxonomy.js` reduces to reading it.
- Better BBO Convention Card uses the library for BBO import/export and PDF,
  and gets an **Open in the convention card editor** button on BBO's card
  pages: it converts the card with the library's BBO importer (its JSON
  export, `source: "bbo-acbl"`, is the format that importer reads) and opens
  `bridge-craftwork.com/card/#import=v1.…` (decision 20), where the
  standalone editor adds it to the browser's cards. Writing a card back to
  BBO waits on BBO's save endpoint, still unknown (the extension's
  docs/architecture.md, open question 1).

**Done when:** no repo keeps its own copy of the field list or the skill
vocabulary.

### Later: card templates of your own

Upload a card PDF with a mapping file, and export to it and import from it
like the built-in ACBL cards. First move the built-in fill maps into
`spec/formats/` as data. See DESIGN.md, "Card templates of your own".

### Later: a card wizard for newer players

A short question list (`spec/wizard.toml`) and a wizard in the editor that
writes a card to finish in the regular editor. Not started until the migration
is done. See DESIGN.md, "A card wizard for newer players".

### Later: "practice our card" *(a Bridge Classroom feature)*

card → its fields → their skills → collection manifests → a practice set. See
DESIGN.md, "The skill taxonomy".
