# Decisions

What's settled, and what's still open. Newest first within each list.

## Decided

**2026-09-30: difficulty levels** (Rick Wilson)

1. **One scale, 1 to 10,** for skills and conventions, bidding and cardplay.
   Advancing in Bridge moved from a compressed 1–6 to 1–10 as its lessons grew;
   four named tiers are too coarse to rate a card.
2. **Named bands are derived** from the number, for the editor's filter and
   lesson front matter, and never stored. About five of them (open question 7).
3. **A convention's level is the lowest level at which it is taught.** Later
   material (slam sequences, bidding after interference, responses with a void)
   is an extension of the same convention, with its own higher level. See
   DESIGN.md, "Difficulty levels".

**2026-09-30: the field vocabulary lives here** (Rick Wilson; open question 1)

The standard vocabulary (`spec/fields.toml`, `spec/formats/bbsa-map.toml`) lives
in this repo's `spec/`, and a new field is a pull request here. This reverses
rusty-bidding-bot's 2026-09-28 decision that the vocabulary belongs to the rules:
the editor, the converters and Bridge Classroom need the same list, and none of
them has anything to do with the bot's rules. Rule sets name the vocabulary
version they were checked against. The crate keeps loading its vocabulary at run
time, so a rule set can still add fields only a bot uses (such as
`general.style`) on top of the standard list.

**2026-09-30: the repo, and its terms** (Rick Wilson)

1. **Its own repo, `bridge-craftwork/convention-card`**, public.
2. **Licence: MIT OR Apache-2.0**, at the user's option. That's the usual choice
   for Rust, and it's how the `bridge-card` crate was already licensed in
   rusty-bidding-bot, so moving it keeps its terms.
3. **Served at `bridge-craftwork.com/card/`.** A path, not a subdomain, per the
   `bridge-craftwork-site` conventions.
4. **Distributed through GitHub only.** Other programs depend on the repository,
   pinned to a tag. There are no npm or crates.io packages.
5. **The Rust `bridge-card` crate moves here** from rusty-bidding-bot, with its
   history.
6. **Accounts: local first.** The standalone editor works without an account
   (browser storage plus file import/export). Saving to Bridge Classroom is an
   optional hand-off.
7. **Bridge Classroom remains where signed-in users save cards.** It keeps the
   `convention_cards` table and API, linking cards to users, and the proficiency
   overlay.
8. **The skill taxonomy splits.** The skill vocabulary lives here; which lessons
   teach each skill lives in each collection's manifest.

## Open

**1. Who owns the field vocabulary.** Decided 2026-09-30; see above.

**2. Reconciling the field lists.** There are two lists (the bot's
`fields.toml` and Bridge Classroom's `conventionCatalog.js`), and Bridge
Classroom's seed card and editor catalog already disagree on some paths (RKCB:
`slam.blackwood.*` vs `other_conventions.blackwood.*`; fourth-suit forcing:
`game_forcing` vs `game_force`). The bot's registry picked one path for each and
made the other an alias. Merging the lists means settling every such case: pick
one path, alias the other. Check against the cards actually saved in Bridge
Classroom's database before choosing, since the paths real cards use are the
ones that must not break.

**3. The taxonomy file.** Its format (the bot's `skills.toml`, lesson-studio's
proposed `taxonomy.json`, or both, generated from one), where each skill's level
lives, and how the bot's `[lessons]` and proposed tables fit in. lesson-studio's
Contract 4 (`documentation/contracts/taxonomy-and-front-matter.md`) is the
fullest thinking so far and should be the starting point.

**4. How "Save to Bridge Classroom" hands the card over.** The standalone editor
can't call Bridge Classroom's API with the user's session (third-party cookie;
see DESIGN.md). Options: open Bridge Classroom with the card in the URL fragment
(simple, but there's a size limit), or open it and pass the card with
`postMessage`.

**5. Can the ACBL convention card PDFs be redistributed?** The PDF export fills
ACBL's own fillable forms (`acbl-classic-2023.pdf`, `acbl-new.pdf`), which are
served from Bridge Classroom's `public/templates/` today. A public, MIT/Apache
repo is a different setting. Either confirm that ACBL permits redistribution, or
keep the templates out of the repo and fetch them at run time from ACBL or a
Bridge Classroom URL. (The substitute condensed font, Barlow Condensed, is SIL
OFL and fine to ship with its licence.)

**6. What `reference.txt` contains.** Per site issue #3, each tool publishes a
machine-readable reference. For this tool the natural content is the spec: every
field with its path, kind, options and description, generated at build time.

**7. The named level bands.** Five names over 1–10, for example Beginner 1–2,
Basic 3–4, Intermediate 5–6, Advanced 7–8, Expert 9–10. Bridge Classroom has four
(`basic` to `expert`) and lesson-studio's Contract 4 uses the same four, so a
fifth name, or a different split, changes both.

**8. What counts as a convention.** Named variants of a convention (Puppet
Stayman against Stayman, 0314 against 1430) could be extensions of it or
conventions of their own. Extensions share a convention id; a variant that
replaces the base convention may be better as its own, linked back.

