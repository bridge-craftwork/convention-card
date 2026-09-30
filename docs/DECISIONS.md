# Decisions

What's settled, and what's still open. Newest first within each list.

## Decided

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

**5. ~~Can the ACBL PDF templates be redistributed?~~** Decided for now: host them ourselves (decision 10).

**6. What `reference.txt` contains.** Per site issue #3, each tool publishes a
machine-readable reference. For this tool the natural content is the spec: every
field with its path, kind, options and description, generated at build time.
