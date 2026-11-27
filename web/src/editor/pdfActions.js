// Print, preview and download a card's PDF, with the choices PdfDialog.vue
// asks for: which ACBL card, what goes on the second page, whether the
// card's entries print in green or black, and whether it is fillable. The editor and the card list both go through here, so they
// ask the same questions and remember the same answers.

/** The PDF module, loaded only when it is needed (it brings pdf-lib). */
const loadAcblPdf = () => import('../../../js/acblClassicFillPdf.js')

export const TEMPLATES = [
  { id: 'classic', name: 'ACBL Classic', desc: 'The familiar SS1 Rev. 4-12 card: what most clubs use.' },
  { id: 'new', name: 'ACBL New', desc: 'The redesigned ACBL card.' },
]

// The library's SECOND_PAGES, named for people
export const SECOND_PAGES = [
  { id: 'none', name: 'Nothing: the card only' },
  { id: 'notes', name: 'Notes: the card\'s notes and supplementary pages' },
  { id: 'acbl', name: 'ACBL scoresheet' },
]

// This browser's last answers (Rick Wilson, 2026-11-21: remember the
// template). A convenience: without storage the defaults stand.
const KEY = 'convention-card.pdf-options'
const DEFAULTS = { template: 'classic', secondPage: 'none', green: true, fillable: false }

export function savedPdfOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      template: TEMPLATES.some(t => t.id === saved.template) ? saved.template : DEFAULTS.template,
      secondPage: SECOND_PAGES.some(s => s.id === saved.secondPage) ? saved.secondPage : DEFAULTS.secondPage,
      green: saved.green !== false,
      fillable: saved.fillable === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePdfOptions(options) {
  try { localStorage.setItem(KEY, JSON.stringify(options)) } catch { /* private mode */ }
}

/** Whether the card has anything for a notes page. */
export async function cardHasNotes(card) {
  const { notesPageContent } = await import('../../../js/notesPage.js')
  return notesPageContent(card).blocks.length > 0
}

/** The PDF's bytes. */
export async function renderPdf(card, { template, secondPage, green = true, fillable }) {
  const { renderAcblPdfBytes } = await loadAcblPdf()
  return renderAcblPdfBytes(card, template, { secondPage, ink: green ? 'green' : 'black', flatten: !fillable })
}

export async function downloadPdf(card, options) {
  const { downloadAcblPdf } = await loadAcblPdf()
  return downloadAcblPdf(card, options.template, {
    secondPage: options.secondPage,
    ink: options.green === false ? 'black' : 'green',
    flatten: !options.fillable,
  })
}

/**
 * Open a tab for a preview. Call it in the click, before any await: a
 * browser blocks a tab opened later. Returns null when it was blocked.
 */
export function openPreviewTab() {
  const tab = window.open('', '_blank')
  if (!tab) return null
  tab.document.title = 'Preview'
  tab.document.body.textContent = 'Making the preview…'
  return tab
}

/** Show `bytes` in the tab openPreviewTab opened. */
export function showInTab(tab, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  // Shown where the browser saves a PDF instead of displaying it
  tab.document.body.textContent = 'Your browser saved the PDF as a download. You can close this tab.'
  tab.location.href = url
  // Long enough to read it and save it from the tab
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000)
}

// Safari and the iPad's browsers (all WebKit) print a PDF in a frame as a
// blank page, so there the PDF opens in a tab to print from.
export function printsInFrame() {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua)
  return !ios && !safari
}

/**
 * Print `bytes`: the browser's print dialog, from a hidden frame. Where
 * that doesn't work (printsInFrame), `tab` (opened in the click) shows the
 * PDF to print from.
 */
export function printBytes(bytes, tab = null) {
  if (tab) {
    showInTab(tab, bytes)
    return
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch {
      window.open(url, '_blank')
    }
  }
  document.body.appendChild(frame)
  // The print dialog holds the frame while it is open; tidy up well after
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 10 * 60_000)
}
