# Decisions

What's settled, and what's still open. Newest first within each list.

## Decided

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

**2. Reconciling the field lists.** There are two lists (the bot's
`fields.toml` and Bridge Classroom's `conventionCatalog.js`), and Bridge
Classroom's seed card and editor catalog already disagree on some paths (RKCB:
`slam.blackwood.*` vs `other_conventions.blackwood.*`; fourth-suit forcing:
`game_forcing` vs `game_force`). The bot's registry picked one path for each and
made the other an alias. Merging the lists means settling every such case: pick
one path, alias the other. Check against the cards actually saved in Bridge
Classroom's database before choosing, since the paths real cards use are the
ones that must not break.

**3. The convention and skill list file.** One entry per standard convention
or skill (ADR-0001: they share IDs): name, level (1–10), the names people write
it as, a summary and sources (DESIGN.md, "Describing a convention"). Still to
settle: the file format, either TOML as the source with lesson-studio's
Contract 4 `taxonomy.json` generated from it and committed (A), or JSON as the
source (B); and what becomes of the bot's `[lessons]` and `[proposed]` tables.
Summaries are hand-written prose, which favours TOML's multi-line strings, and
the rest of `spec/` is TOML: *recommendation* A.

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

**8. What counts as a convention.** Named variants of a convention (Puppet
Stayman against Stayman, 0314 against 1430) could be extensions of it or
conventions of their own. Extensions share a convention id; a variant that
replaces the base convention may be better as its own, linked back.

