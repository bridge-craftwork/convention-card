# ADR-0002 — A Convention Is a Group With a `play` Switch

**Status:** Accepted 2026-10-30 (Rick Wilson).

**Affects:** `spec/fields.toml` and the generated JSON, the format maps
(`spec/formats/`), the JS library (imports, PDF fill and import, compare,
checks), the editor, the `bridge-card` crate, rusty-bidding-bot's `.bid`
modules, and saved cards (Bridge Classroom's database, exported `.json`
files and PDFs).

## Context

The field tree grew from the printed ACBL card: Puppet Stayman over 2NT
sits in the 2NT opening's box (`notrump.two_nt.puppet`), Jacoby and Texas
and the minor-suit transfers share one `transfers` group, Multi lives inside
the 2♦ opening's description, and some switches are not called `play`
(`two_over_one.game_force`, `lebensohl.over_interference`). A tool cannot
tell from a path which convention a treatment belongs to, so it cannot hide
a treatment until its convention is on, ignore it when it is off, or leave
it out of a comparison where it does not apply.

The card's vocabulary is also becoming a shared standard (Brill, 2026-10-30),
and nothing outside our own tools depends on the names yet.

## Decision

1. **A convention is a group with a `play` switch.** `<section>.<convention>.play`
   turns it on; every other field of that group is one of its treatments, and
   means nothing while `play` is off. A convention used from several places is
   one group, with a treatment for each place (`stayman.puppet_2nt`,
   `jacoby_transfers.over_2nt`).
2. **Every other group describes agreements and switches no convention:** an
   opening (`notrump.one_nt`, `two_level.two_hearts`), carding, leads, or a
   shared agreement such as the king ask. It may hold agreements that are not
   named conventions (`notrump.two_nt.neg_dbl`); a field whose skill is a named
   convention belongs in that convention's group.
3. **A choice between conventions is a `choice` group of their `play`
   switches** (Blackwood or RKCB); a choice between versions of one
   convention is an enum treatment of it (`rkcb.style`: `1430`, `0314`).
4. **Paths follow conventions, not any printed card.** Where a field prints
   (card face, notes page, or not at all) is the format map's business and,
   later, a field attribute; it never decides the path.
5. **Renames migrate cards by schema version, not by aliases.** Before any
   stability contract (none is agreed yet) a rename needs no alias in the
   vocabulary. A card records `schema_version`; cards written from this change
   on say `2.0`. Reading a 1.x card from any source (Bridge Classroom's
   database, a `.json` file, the card embedded in an exported PDF) applies
   `spec/migrations/1-to-2.toml` once: renames, plus the few value changes
   below. The map is kept, so cards and PDFs already in people's hands keep
   loading. Existing `aliases` on renamed fields are folded into the map.

## The renames (schema 1 → 2)

Paths are full paths. `→` is a plain rename; "value" rows change the value too.

### notrump

| From | To |
|---|---|
| `notrump.transfers.jacoby` | `notrump.jacoby_transfers.play` |
| `notrump.transfers.super_accept` | `notrump.jacoby_transfers.super_accept` |
| `notrump.transfers.super_accept_doubleton` | `notrump.jacoby_transfers.super_accept_doubleton` |
| `notrump.transfers.vs_double` | `notrump.jacoby_transfers.vs_double` |
| `notrump.transfers.vs_2c` | `notrump.jacoby_transfers.vs_2c` |
| `notrump.two_nt.transfers_3level` | `notrump.jacoby_transfers.over_2nt` |
| `notrump.transfers.texas` | `notrump.texas.play` |
| `notrump.transfers.texas_2_under` | `notrump.texas.two_under` |
| `notrump.transfers.texas_4c` / `_4d` / `_4h` / `_4s` | `notrump.texas.bid_4c` / `bid_4d` / `bid_4h` / `bid_4s` |
| `notrump.two_nt.transfers_4level` | `notrump.texas.over_2nt` |
| `notrump.minor_transfers` (enum) | value: `none` → `notrump.minor_transfers.play = false`; any other option → `play = true` and `notrump.minor_transfers.style = <option>` (options without `none`) |
| `notrump.transfers.spades_relay` | `notrump.minor_transfers.two_s` |
| `notrump.transfers.two_s_clubs` | `notrump.minor_transfers.two_s_clubs` |
| `notrump.transfers.two_nt` | `notrump.minor_transfers.two_nt` |
| `notrump.transfers.two_nt_clubs` | `notrump.minor_transfers.two_nt_clubs` |
| `notrump.transfers.two_nt_diamonds` | `notrump.minor_transfers.two_nt_diamonds` |
| `notrump.transfers.three_c_diamonds` | `notrump.minor_transfers.three_c_diamonds` |
| `notrump.two_nt.minor_transfers` | `notrump.minor_transfers.over_2nt` |
| `notrump.two_nt.transfer_3s_clubs` | `notrump.minor_transfers.over_2nt_3s_clubs` |
| `notrump.two_nt.transfer_4c_diamonds` | `notrump.minor_transfers.over_2nt_4c_diamonds` |
| `notrump.two_nt.puppet` | `notrump.stayman.puppet_2nt` |
| `notrump.two_nt.three_c_3nt_both_majors` | `notrump.stayman.over_2nt_both_majors` |
| `notrump.two_nt.minor_stayman` | `notrump.minor_suit_stayman.over_2nt` |
| `notrump.lebensohl.over_interference` | `notrump.lebensohl.play` |
| `notrump.rubensohl.over_interference` | `notrump.rubensohl.play` |
| `notrump.three_nt.one_suit` | `notrump.gambling_3nt.play` |
| `notrump.three_nt.one_suit_desc` | `notrump.gambling_3nt.description` |

`notrump.minor_transfers.play` is set by the migration when the 1.x card had
the enum, or (if it had no enum) when any of the moved minor-transfer boxes is
on.

### major_openings

| From | To |
|---|---|
| `major_openings.two_over_one.game_force` | `major_openings.two_over_one.play` |

### two_level

| From | To |
|---|---|
| `two_level.two_clubs.kokish` | `two_level.kokish.play` |
| `two_level.two_clubs.parrish_bust` | `two_level.parrish_bust.play` |
| `two_level.two_diamonds.multi` | `two_level.multi.play` |
| `two_level.two_diamonds.multi_strong` | `two_level.multi.strong_option` |
| `two_level.two_diamonds.mini_roman` | `two_level.mini_roman.play` |
| `two_level.two_diamonds.mini_roman_maxi` | `two_level.mini_roman.maxi` |
| `two_level.two_diamonds.reverse_flannery` | `two_level.reverse_flannery.two_d` |
| (new) | `two_level.reverse_flannery.play`: set by the migration when any of `two_d`, `two_h`, `two_s` is on |

### slam

| From | To |
|---|---|
| `slam.blackwood.standard` | `slam.blackwood.play` |
| `slam.blackwood.rkcb_1430` | value: on → `slam.rkcb.play = true`, `slam.rkcb.style = "1430"` |
| `slam.blackwood.rkcb_0314` | value: on → `slam.rkcb.play = true`, `slam.rkcb.style = "0314"` |
| `slam.blackwood.minor_0314` | `slam.rkcb.minor_0314` |
| `slam.blackwood.queen_ask` | `slam.rkcb.queen_ask` |

`slam.blackwood.play` and `slam.rkcb.play` form the choice group
`slam.ace_ask`. `slam.blackwood.notes` (the 4NT box's text) and
`slam.king_ask.*` (shared by every ace or keycard ask) stay as they are.

### general

| From | To |
|---|---|
| `general.jump_shifts.soloway` | `general.soloway.play` |
| `general.jump_shifts.soloway_extended` | `general.soloway.extended` |

The jump-shift style choice (`general.jump_shifts.strong_2` … `invitational`,
including the weak jump shifts) is a description of responder's jump shifts,
not a convention switch, and stays.

### Left alone on purpose

`notrump.two_nt.three_s`, `.neg_dbl`, `.minor_slam_try` (unnamed agreements of
the 2NT opening), `other_conventions.reverse_bids.forcing`, `vs_to_double.redouble.*`,
carding and leads.

## Consequences

- An editor can show a convention's treatments only once its `play` is on,
  and a comparison can tell "different", "not discussed" and "not applicable"
  apart, both from the path alone.
- Every consumer moves to the new paths at once, through a new tag here and a
  pin bump there; rusty-bidding-bot's `.bid` modules change in its own PR.
- `spec/migrations/1-to-2.toml` is permanent: it is how old PDFs and files are
  read.
