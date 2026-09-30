# Decisions

What's settled, and what's still open. Newest first within each list.

## Decided

**2026-09-30: one file per convention** (Rick Wilson)

17. **Each standard convention or skill is its own file,**
    `spec/conventions/<category>/<name>.toml`, whose path is its ID, in the same
    format as a namespaced convention's `convention.toml` (ADR-0001 D4). Adding
    or changing a convention touches only its file. `spec/conventions.json`
    combines them for readers that cannot list a directory; CI regenerates and
    commits it on every push to `main` that changes the sources, as
    Practice-Bidding-Scenarios does for its manifest. This refines decision 14.

**2026-09-30: variants and extensions** (Rick Wilson; open question 8)

16. **A variant played instead of a convention gets its own ID; something
    played in addition to it is an extension.** You play Puppet Stayman or
    Stayman over 2NT, Reverse Drury or Drury, Modified or standard Jacoby 2NT:
    each has its own ID, and a card can carry either. Texas, Garbage Stayman or
    transfers after a double add to their convention: they share its ID, with
    their own higher levels (decision 13).

**2026-09-30: the standard list starts large** (Rick Wilson)

15. **Every BBA treatment and every PBS scenario's convention is on the
    standard list**, since rusty-bidding-bot is to support most of both. This
    amends ADR-0001's "deliberately small" (Amendment 1); its admission rule,
    "our tools support it together", stands.

**2026-09-30: the convention and skill list file** (Rick Wilson; open question 3)

14. **TOML is the source.** One entry per standard convention or skill, keyed
    by its ADR-0001 ID: name, level, names, summary and sources (DESIGN.md,
    "Describing a convention"). lesson-studio's Contract 4 `taxonomy.json` is
    generated from it and committed, with a test that the two agree, since a
    GitHub dependency gets no build step. Summaries are hand-written prose,
    which TOML's multi-line strings suit, and the rest of `spec/` is TOML.

**2026-09-30: difficulty levels** (Rick Wilson)

11. **One scale, 1 to 10,** for skills and conventions, bidding and cardplay.
    Advancing in Bridge moved from a compressed 1–6 to 1–10 as its lessons grew;
    four named tiers are too coarse to rate a card.
12. **Named bands are derived** from the number, for the editor's filter and
    lesson front matter, and never stored. For now, Bridge Classroom's four
    names: basic 1–3, intermediate 4–6, advanced 7–8, expert 9–10. "Basic" is not
    a recognised bridge level, so the names may change; since only the number is
    stored, that changes no data. Under this split DONT, Lebensohl, Drury, Jacoby
    2NT and splinters move from advanced to intermediate.
13. **A convention's level is the lowest level at which it is taught.** Later
    material (slam sequences, bidding after interference, responses with a void)
    is an extension of the same convention, with its own higher level. See
    DESIGN.md, "Difficulty levels".

**2026-09-30: how conventions are named** (Rick Wilson)

9. **A standard convention list, plus namespaced conventions anyone can
   publish.** See [ADR-0001](adr/0001-standard-and-namespaced-conventions.md).
   Standard IDs are the existing skill paths. Custom conventions take an ID under
   a domain the author owns. Cards carry them in an `other_agreements` list. This
   resolves what was open question 1.
10. **Host the ACBL PDF templates ourselves for now.** They ship with the editor
    as they do from Bridge Classroom today. Redistribution terms can be sorted
    out later if they ever need to be; that's easier to fix afterwards than to
    wait on now. This resolves what was open question 5.

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

**1. ~~Who owns the field vocabulary~~** Resolved by [ADR-0001](adr/0001-standard-and-namespaced-conventions.md).

**2. Reconciling the field lists.** Done for paths (PRs #5, #7–#13, 2026-09-30):
every path Bridge Classroom's editor catalog uses (180) and every literal path
its bridgeodex and BBO importers write resolves in `spec/fields.toml`, directly
or through an alias, and all 11 saved cards load with no unknown path and no
invalid value. Every convention field has a level and names its convention.
Choice groups done too (the `choice` attribute, 23 groups): no saved card sets
two alternatives of one group.

**3. The convention and skill list file.** Format decided (14). The bot's three
tables became each entry's `source` ("taxonomy", "lessons", "proposed"), and
every entry except the two `practice_deals` ones has a level. CI generates
Contract 4's `taxonomy.json`, leaving `practice_deals` out. Still open, for
lesson-studio: Contract 4's path pattern requires a name to start with a letter,
which the lesson tags `precision/1c_opener`, `1c_responder` and `1c_mixed` do
not; the pattern should allow a leading digit.

**4. How "Save to Bridge Classroom" hands the card over.** The standalone editor
can't call Bridge Classroom's API with the user's session (third-party cookie;
see DESIGN.md). Options: open Bridge Classroom with the card in the URL fragment
(simple, but there's a size limit), or open it and pass the card with
`postMessage`.

**5. ~~Can the ACBL PDF templates be redistributed?~~** Decided for now: host them ourselves (decision 10).

**6. What `reference.txt` contains.** Per site issue #3, each tool publishes a
machine-readable reference. For this tool the natural content is the spec: every
field with its path, kind, options and description, generated at build time.

**7. The named level bands.** Decided 2026-09-30; see above.

**8. What counts as a convention.** Decided 2026-09-30 (16).

