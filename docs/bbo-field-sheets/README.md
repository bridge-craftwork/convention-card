# BBO field sheet

Which card field each slot of BBO's ACBL convention card fills, as the BBO
import and export (`js/bbo.js`, `spec/formats/bbo-map.toml`) have it.

`bbo-acbl-fields.pdf`: page 1 is BBO's card, read from BBO's card editor,
with every slot outlined and numbered:

- green: the map covers it;
- grey: the map leaves it out on purpose (its `[left_out]` table says why);
- red: nothing does;
- amber: a lead circle that the round trip gets wrong (its holding is not in
  the spec, or the export writes it under another key).

The pages after it list the numbers: the slot (`E_` text, `C_` checkbox, `L_`
lead circle, as in BBO's XML), the section and words beside it on BBO's card,
the card field it fills, and the spec's label. The PDF is searchable.

Go by the words on BBO's card, not the slot's id: BBO's ids don't always say
what the box is (`C_druryFit` is the box printed "2-Way", and `C_drury2Way` the
one printed "Fit").

The slot list itself is `spec/formats/bbo-slots.toml`, and
`js/__tests__/bboSlots.test.js` holds the map to it.

Generated; don't edit. After changing the BBO map, or when BBO changes its
card, run

    node scripts/bbo-field-sheets.mjs
    python3 scripts/build_spec.py

The script opens BBO's editor page (no account needed) in headless Chromium,
so it needs network access and Playwright's browser (`npx playwright install
chromium-headless-shell`). The repo keeps no copy of BBO's page.
