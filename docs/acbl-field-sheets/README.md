# ACBL field sheets

Which card field fills each box of the two ACBL templates, as the PDF export
(`js/acblClassicFillPdf.js`) has it.

`acbl-classic-fields.pdf`, `acbl-new-fields.pdf`: page 1 is the blank card
with every box outlined and numbered (green: the export fills it; red:
nothing does). The lead circles, which the export draws rather than fills,
are outlined in green too, one number per printed holding. The pages after
it list the numbers: the box's name in the template, its kind, the card
field that fills it, and the spec's label. The PDFs are searchable.

Generated; don't edit. After changing a field map or a template, run

    node scripts/acbl-field-sheets.mjs
