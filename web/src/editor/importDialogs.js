// The import merge's questions and notices, in a ChoiceDialog
// (ChoiceDialog.vue) rather than the browser's confirm and alert.

/** `ask` for mergeImported: keep the card already here, or use the imported one. */
// The file matched a card already here (importMerge.js). Name that card by
// the name the person knows it by now, not the one the file's copy carries:
// a copy exported before a rename otherwise reads as some other card, and
// replacing it overwrites the renamed one (Tomasz, 2026-10-31). Esc keeps it.
export const askInDialog = dialog => ({ name, importedName, ours, theirs }) => dialog.show({
  title: `This file holds ${theirs !== 'no date' && ours !== 'no date' ? 'an older copy' : 'a copy'} of “${name}”.`,
  dated: [
    { when: ours, what: `“${name}”, last saved` },
    { when: theirs, what: importedName && importedName !== name ? `the file's copy, then called “${importedName}”` : "the file's copy" },
  ],
  lines: [`Replacing keeps the name “${name}” and uses the file's settings.`],
  buttons: [
    { label: `Keep “${name}”`, value: 'keep', primary: true },
    { label: 'Add as a new card', value: 'add' },
    { label: `Replace “${name}”`, value: 'replace' },
  ],
  cancel: 'keep',
})

/** What an import did to cards already here, when there is something to say. */
export function tellMatched(dialog, merged) {
  if (!merged.matchedGroups?.length) return Promise.resolve()
  return dialog.show({ title: 'Imported', groups: merged.matchedGroups, buttons: [{ label: 'OK', value: true, primary: true }] })
}
