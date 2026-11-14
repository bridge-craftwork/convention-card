# ADR-0003 — Content Splits From Code

**Status:** Accepted 2026-11-13, when Rick Wilson accepted
`bridge-common-conventions`' `docs/CONTRACT.md`. Nothing in this repo changes
until the cut-over (decision 6 below).

**Amends:** ADR-0001 (D3, D5 and Amendment 1), ADR-0002 (decisions 1, 4 and
5) and DECISIONS.md decisions 16 and 17.

**Affects:** `spec/` (the field list, the conventions, levels, alerts and
migrations move out; the format maps stay), the JS library, the editor, the
`bridge-card` crate, saved cards, and every program that pins this repo for
its vocabulary.

## Context

A convention is defined in two places today, and both are code releases.
This repo holds the names: 177 conventions and 648 card fields in `spec/`.
`rusty-bidding-bot` holds the bidding rules, and compiles this repo's field
list in at a tag. So adding or renaming a convention is a tag here and a pin
bump in every consumer. In its first six weeks this repo cut 63 tags, most
of them for content.

The route ADR-0001 gave other people's conventions, a namespaced ID carried
in a card's `other_agreements`, exists only as a data type. The editor and
the bot do not honour it. The only working way to add a convention is to add
it to our repos, which makes us the authority on every convention: the role
ADR-0001 set out to avoid.

Measured at v0.44.0:

- The 83 `play` switches name only 70 convention IDs. Fifteen switches share
  six IDs (Texas shares Jacoby's; Michaels and four levels of Unusual
  notrump share one), and three switches have none.
- Nine treatments name a different convention from their group (Reverse
  Bergen, Reverse Drury, two-way Drury, Modified Jacoby 2NT, Puppet Stayman
  twice, the super-accepts twice, the Parrish relay).
- 67 of the 177 defined IDs have no card field at all, so a card can carry
  them only through `other_agreements`.

## Decision

1. **Content moves to `bridge-common-conventions`; this repo keeps the card
   tools and the card models.** Content is the convention definitions, the
   card settings, contexts, level bands, alert rules and migrations. It is
   read at run time from that repo's published snapshot and is never pinned.
   What stays here: the editor, the PDF, import and export code, the
   `bridge-card` crate, the card models (templates, fonts, layouts), and the
   maps from each card model's boxes onto the common names.

2. **A definition names no card.** It has an ID, a name, its contexts, its
   treatments, a summary, a level and its references. It has no card path
   and no print position. This replaces ADR-0002 decision 1's
   `<section>.<convention>.play` and completes its decision 4: where a
   convention prints is a card model's business, through a table from
   context to position kept here.

3. **A card has two parts (schema 3).** `conventions`, keyed by ID, each
   entry holding the treatment values and `play`, which is true when left
   out; and `settings`, the agreements that are not conventions, under their
   present names.

   ```json
   "schema_version": "3.0",
   "conventions": {
     "bidding_conventions/smolen": {},
     "bidding_conventions/texas":  { "two_under": true },
     "bidding_conventions/gerber": { "play": false }
   },
   "settings": { "notrump": { "one_nt": { "range_min": 15 } } }
   ```

   An `other_agreements` entry that carries an ID becomes an ordinary entry
   in `conventions`, keeping its text. This replaces ADR-0001 D5: a
   convention needs no fixed field to be a first-class part of a card.

4. **What gets its own entry.** The same calls in a different auction are
   one convention, with a yes/no treatment for each place (ADR-0002 decision
   1, now applied across sections: Lebensohl, Rubensohl, Unusual notrump).
   Otherwise, what can be played without the other gets its own ID, and what
   only modifies the other is a treatment. The 83 switches become 76
   conventions. Seven IDs are added and none is renamed: Texas,
   mini-splinters, Michaels, Unusual notrump, the 3NT raise, quantitative
   4NT and the 4NT opening.

5. **A variant keeps its ID and is a treatment on the card.** This amends
   DECISIONS.md decision 16 ("a variant played instead gets its own ID", so
   that a card carries either). The nine treatments above stay treatments.
   Each one's ID stays, for teaching and for finding it in text, and its
   definition points at the parent convention and the treatment value it
   stands for.

6. **One cut-over.** This repo, `rusty-bidding-bot` and the programs that
   pin them stay on their present tags until the new arrangement is
   complete, then move once. There is no period in which a tool reads two
   card shapes.

7. **Renames still migrate cards by schema version** (ADR-0002 decision 5).
   The migrations move to `bridge-common-conventions` and are permanent
   there. A 2-to-3 migration is generated from a reviewed inventory of every
   field. Cards, files and PDFs written in schema 1 or 2 keep loading.

8. **Names are additive-only once published.** An ID, a treatment, a
   setting, an enum option or a context key is never renamed or removed
   without a migration. This replaces ADR-0002 decision 5's "before any
   stability contract (none is agreed yet)": the contract is
   `bridge-common-conventions`' `docs/CONTRACT.md`.

## What happens to the earlier decisions

| Earlier decision | Now |
|---|---|
| ADR-0001 D1, D2: two kinds of ID, one namespace for conventions and skills | Unchanged |
| ADR-0001 D3 and Amendment 1: the standard list lives in this repo's `spec/` | The list lives in `bridge-common-conventions`. Its admission rule is unchanged |
| ADR-0001 D4: a namespaced ID points at a `convention.toml` | Unchanged; the file's format is the contract's definition format |
| ADR-0001 D5: `other_agreements` | Entries with an ID move into `conventions`. Text with no ID stays |
| ADR-0001 D6: a card never depends on a description file being reachable | Unchanged, and extended to the whole pack |
| ADR-0001 D7: a custom convention can become standard | Unchanged |
| ADR-0002 decision 1: a convention is a group with a `play` switch | A convention is a definition; a card's entry holds `play` |
| ADR-0002 decisions 2 and 3: other groups, and choices | Unchanged in meaning. A choice between conventions is no longer a list: each definition says which function it implements (the defence to 1NT, ace asking, a two-level opening), and the editor finds conflicts from those |
| ADR-0002 decision 4: paths follow conventions, not a printed card | Completed: a definition has no path at all |
| ADR-0002 decision 5: renames migrate by schema version | Unchanged, with the additive-only promise added |
| DECISIONS.md 16: variants and extensions | Amended by decision 5 above |
| DECISIONS.md 17: one file per convention, `conventions.json` committed by CI | One directory per convention, in the other repo. Its CI publishes a snapshot to a separate branch and commits nothing back to `main` |

## Consequences

- **A new convention needs no tag here.** It is a definition in a pack, ours
  or anyone's, and a card can carry it by ID at once.
- **This repo's tags move only when behaviour changes.** It declares which
  card schema and pack format it reads.
- **Every map here is re-keyed.** The `.bbsa`, BBO and Bridgodex maps name
  92, 44 and 41 of the 178 fields inside convention groups; the ACBL PDF
  maps and the editor's catalog name more. They take the contract's
  addresses: an ID, `<id>:<treatment>`, or a setting's dotted name.
- **Each card model gains a table from context to print position**, for
  conventions that have no box of their own.
- **The editor draws a convention's row and treatments from its
  definition**, in place of the hand-written catalog.
- **The restructure and the corrections stay apart.** The move must show no
  difference in any export or in the bot's bidding. Corrections follow, each
  with a reviewed list of differences: among them, that Reverse Bergen and
  Reverse Drury can be on today while their convention is off.
- **The 72 yes/no fields that name a convention but belong to no group**
  stay settings through the move and are placed afterwards.

## Alternatives considered

- **Keep the content here and publish it without tags.** It removes the pin
  bumps but leaves the rules in the bot's repo, so a convention is still
  defined in two places, and this repo's history stays mostly content.
- **Give every `play` switch its own ID.** Mechanical, but it makes
  Lebensohl over 1NT interference and Lebensohl after doubling a weak two
  two conventions, against ADR-0002 decision 1.
- **Let presence in `conventions` mean "played".** It loses the difference
  between "not discussed" and "agreed not to play", which comparing cards
  relies on, and drops treatment values when a convention is switched off.

## References

- `bridge-common-conventions`: `docs/PLAN.md` (the phases), `docs/CONTRACT.md`
  (the formats), `docs/WORKED-EXAMPLES.md` (three conventions in the new
  shape), and its issues #2 to #6 (the decisions, 2026-11-13).
- [ADR-0001](0001-standard-and-namespaced-conventions.md),
  [ADR-0002](0002-conventions-are-groups.md), [DECISIONS.md](../DECISIONS.md).
