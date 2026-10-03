// The import merge's questions and notices, in a ChoiceDialog
// (ChoiceDialog.vue) rather than the browser's confirm and alert.

/** `ask` for mergeImported: keep the card already here, or use the imported one. */
export const askInDialog = dialog => ({ name, ours, theirs }) => dialog.show({
  title: `“${name}” is already here.`,
  dated: [
    { when: ours, what: 'last saved' },
    { when: theirs, what: 'from the import file' },
  ],
  buttons: [
    { label: 'Keep yours', value: true, primary: true },
    { label: 'Use the imported one', value: false },
  ],
})

/** What an import did to cards already here, when there is something to say. */
export function tellMatched(dialog, merged) {
  if (!merged.matchedGroups?.length) return Promise.resolve()
  return dialog.show({ title: 'Imported', groups: merged.matchedGroups, buttons: [{ label: 'OK', value: true, primary: true }] })
}
