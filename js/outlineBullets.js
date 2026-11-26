// Shared by the notes page (js/notesPage.js) and the editor's outline keys
// (web/src/editor/outlineKeys.js); kept apart so the editor needn't load
// pdf-lib to read a bullet.

// The bullets a list may use: Markdown's "-" and "*", and the ones Pandoc's
// plain text and word processors write at each level ("•", "◦", "▪︎"...),
// with the text-or-emoji selector some carry ("▪︎" is "▪" and U+FE0E).
export const BULLET = '[-*\u2022\u25e6\u25aa\u25ab\u2023\u2043\u25cb\u25cf\u25a0\u25a1][\ufe0e\ufe0f]?'
