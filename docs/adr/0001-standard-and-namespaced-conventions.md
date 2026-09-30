# ADR-0001 — A Standard Convention List, Plus Namespaced Conventions Anyone Can Publish

**Status:** Accepted 2026-09-30 (Rick Wilson); D3 amended the same day (see
[Amendment 1](#amendment-1-2026-09-30-the-standard-list-starts-large)). Resolves open question 1 in
[DECISIONS.md](../DECISIONS.md) ("who owns the field vocabulary").

**Affects:** this repo's spec, the editor and PDF export; rusty-bidding-bot
(`.bid` modules, card loading); lesson-studio (front-matter validation); every
lesson collection that tags boards with skills (Baker-Bridge,
Practice-Bidding-Scenarios).

---

## 0. The one-paragraph version

Conventions are named the way the web names pages. A **standard list**, kept
in this repo (large from the start: Amendment 1), holds the conventions our tools support
together (card, lessons, bot). Their IDs are the **skill paths** already in use
(`bidding_conventions/stayman`). Anyone can define a new convention **without
asking anyone**, under a namespace they own: its ID starts with a domain, e.g.
`github.com/alice/bridge-ideas/relay-stayman`, and points at a small description
file in that repo. The same ID tags its lessons, names its `.bid` module and its
dealer3 script, and goes on a card. On the card, a custom convention goes in a
structured **"other agreements"** list, which keeps the ID for machines and
prints the text in the free-text lines of its section. If a custom convention
catches on, it can join the standard list, with its old ID kept as an alias. We
maintain the list of what *our* tools support; we don't referee the world's
conventions.

---

## 1. Context

**A convention is named in four places**, and today each names it separately:

- the **convention card**: a field such as `notrump.smolen.play`;
- **lessons**: a `[SkillPath "bidding_conventions/smolen"]` tag;
- **rusty-bidding-bot**: a `.bid` module that implements the bids;
- **dealer3**: a script that generates hands where the convention matters.

Card fields already carry a `skill` attribute pointing at the skill path, so
card and lessons are linked. The bot's `fields.toml` and `skills.toml` are
copies of Bridge Classroom's lists.

**The world's conventions are open-ended.** Any partnership can invent one. The
workflow we want to support is one where someone:
1. writes a dealer3 script for the situations the idea affects,
2. writes a `.bid` module so rusty can bid it,
3. runs A/B tests against the standard treatment and gets a net IMP result,
4. adds the convention to their card, and perhaps writes a lesson for it.

None of that should need our permission.

**A convention card has a fixed number of spots.** The printed ACBL card, and
our structured fields, cover the common conventions. Anything else goes in a
section's free-text lines: that's what those lines are for on a paper card.

**The bot's design decided on 2026-09-28** that the card vocabulary belongs to
the rules, so a rule author can add a field without an engine release. The
editor, the converters, the PDF and Bridge Classroom need the same list, and
none of them has anything to do with the bot's rules. This ADR keeps what that
decision was protecting (anyone can add a convention without a release of
anything) by a different route: namespaced IDs rather than rule-local fields.

---

## 2. Decision

### D1 — Two kinds of convention ID, told apart by their first segment

- **Standard IDs are skill paths**: `<category>/<name>`, lower case, digits and
  underscores (`bidding_conventions/stayman`). Reusing the skill paths means no
  lesson anywhere has to be retagged.
- **Namespaced IDs start with a domain the author controls**:
  `<domain>/<path>`, e.g. `github.com/alice/bridge-ideas/relay-stayman`. The
  domain is what makes the first segment unmistakable: it contains a dot, and no
  skill path does (checked 2026-09-30 against Bridge Classroom's 50 paths and the
  bot's `skills.toml`). The author owns everything under their namespace, so two
  people can't collide and nobody has to approve anything.

Rule for every tool: **an ID whose first segment contains a `.` is namespaced;
otherwise it's standard.**

### D2 — One vocabulary: a convention is a skill that can appear on a card

Convention IDs and skill IDs are the same namespace. Most skills are
conventions (Stayman). Some aren't (`declarer_play/holdup`); they just never
appear on a card. Lessons, cards, `.bid` modules and dealer scripts all use the
same ID for the same thing.

### D3 — The standard list lives here, and stays small *(amended: see Amendment 1)*

The standard list lives in this repo's `spec/` and replaces the copies in
Bridge Classroom and the bot. Its admission rule is **"our tools support it
together"**, not "it's a real convention". A convention joins when we commit to
supporting it across the card and at least one of lessons and the bot. The list
records which tools cover each entry. Changes come by pull request here.

The fixed card fields (`notrump.smolen.play`, …) stay as they are, and each
names its standard convention through its `skill` attribute.

### D4 — A namespaced ID points at a description file

A namespaced ID resolves to a `convention.toml` at the path it names:

- `github.com/<owner>/<repo>/<path>` →
  `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>/convention.toml`
- any other domain: `https://<id>/convention.toml`

The file says what the convention is and where its pieces are:

```toml
id = "github.com/alice/bridge-ideas/relay-stayman"
name = "Relay Stayman"
summary = "2♣ asks; 2♦ denies a major and relays to a size ask."
section = "notrump"        # which part of the card it belongs to

[links]
bid = "relay-stayman.bid"                       # rusty-bidding-bot module
dealer = "relay-stayman.dlr"                    # dealer3 script
lessons = ["lessons/relay-stayman.pbn"]

[[results]]                                     # optional A/B evidence
baseline = "bidding_conventions/stayman"
deals = 2000
imps_per_board = 0.41
tool = "rusty-bidding-bot 0.4 / dealer3"
```

The exact schema is settled in `spec/` when the first real one is written. What
this ADR fixes is the resolution rule and the principle that the file lives with
its author.

### D5 — On the card: a structured "other agreements" list

`card_data` gains a list for conventions without a fixed spot:

```json
"other_agreements": [
  { "id": "github.com/alice/bridge-ideas/relay-stayman",
    "section": "notrump",
    "text": "Relay Stayman (2♦ = no major, relay)" }
]
```

- `text` is what a person reads, and the PDF prints it in that section's
  free-text lines.
- `id` is optional: plain free text is still allowed, as on paper.
- Tools keep and write back entries they don't understand.
- The editor resolves `id` to show the name, summary and links, and lets the
  user add an entry by pasting an ID.

The bot switches on a `.bid` module when a card names its ID, whether in a fixed
field (through its `skill`) or in `other_agreements`.

### D6 — A card never depends on a description file being reachable

Resolving an ID adds names, links and results. It is never needed to load,
check, print or bid a card. If Alice's repo disappears, her card still carries
the ID and the text, prints the same and reads the same. Only the enrichment is
lost.

Tools never fetch and run a namespaced convention's `.bid` module on their own.
Using someone else's module is an explicit choice by whoever runs the bot.

### D7 — A custom convention can become standard

When a namespaced convention catches on and our tools support it together, it
joins the standard list with a skill-path ID, and its namespaced ID becomes an
**alias**. Every card, lesson and module that used the old ID keeps working.

---

## 3. Consequences

- **We maintain a list, not a registry.** The standard list is the scope of our
  own tools. Everything else belongs to whoever publishes it.
- **The bot's rule authors keep their freedom.** A new convention needs a
  namespaced ID and a `.bid` module, and no change to this repo. The standard
  vocabulary still comes from here, so the fixed fields mean the same thing to
  every tool.
- **lesson-studio** validates standard IDs against the list and accepts
  namespaced IDs by their syntax, optionally checking that they resolve.
- **Collections** can tag boards with namespaced IDs, so a lesson for a custom
  convention works like any other lesson, and "practice our card" can find it.
- **The PDF export** gains a job: printing `other_agreements` text into each
  section's free-text lines, in the space the legibility work is already
  fitting text into.
- **Open, but not blocking:** the full `convention.toml` schema; how a `.bid`
  module declares its ID (rusty-bidding-bot's side); whether A/B results get a
  common format across tools.

## 4. Alternatives considered

- **One central registry that we curate.** Makes us the referee for every
  convention in the world, and makes every new idea wait on us. Rejected: that's
  the role this ADR exists to avoid.
- **Free text only for anything non-standard.** People can read it but no tool
  can: the bot can't switch a module on from a sentence, and lessons can't be
  matched to it. Rejected.
- **Flat global names, first come first served** (`relay_stayman`). Invites
  collisions ("my Relay Stayman isn't yours") and squatting, and needs a referee
  to settle them. Rejected.
- **Random IDs (UUIDs).** No collisions, but unreadable, and they say nothing
  about who owns the convention or where to find it. Rejected.
- **Keeping the vocabulary with the bot's rules** (its 2026-09-28 decision).
  Leaves the editor, the converters and Bridge Classroom depending on the bot's
  rule set for a list that has nothing to do with bidding logic. Rejected in
  favour of D1–D3, which keep that decision's goal of adding conventions without
  a release.

## Amendment 1 (2026-09-30): the standard list starts large

*Rick Wilson.* D3's admission rule stands: a convention is standard when our
tools support it together. What changes is the expectation that the list stays
small. rusty-bidding-bot is to support most of BBA's treatments and most of the
Practice-Bidding-Scenarios scenarios, so by that same rule the list starts large:

- every treatment BBA's `.bbsa` cards can switch (about 170 keys);
- the convention behind every PBS scenario (350 scenarios);
- the conventions Bridge Classroom's editor, the lesson collections and the
  books and articles we cite already cover.

A first cross-reference (2026-09-30) finds about 130 conventions with a card
field today and about 40 more with none yet, before splitting grouped entries.
Scenarios that practise natural bidding, judgment rules (Rule of 16, the Law of
Total Tricks, misfits) or cardplay tag skills rather than card conventions; D2
already covers that, since a skill need not appear on a card.

Namespaced IDs are unchanged: they remain the way to add anything beyond the
standard list without asking anyone.

## 5. References

- [DESIGN.md](../DESIGN.md): the spec, and the skill-taxonomy split.
- rusty-bidding-bot `docs/DESIGN.md`, "The convention card" (the 2026-09-28
  vocabulary decision).
- lesson-studio `documentation/contracts/taxonomy-and-front-matter.md`
  (Contract 4: one versioned taxonomy).
- Bridge-Classroom `public/data/skillPaths.json` and
  `src/utils/bakerBridgeTaxonomy.js`: today's skill vocabulary.
