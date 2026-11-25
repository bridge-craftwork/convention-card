// The PDF export's binary assets: the ACBL template PDFs and the condensed
// field font (assets/ in this repository). The library does no network
// access (DESIGN.md), so it never fetches them itself: the caller says how,
// once, with setAssetLoader. A page or extension fetches the files from
// wherever it serves them; Node reads them from disk.
//
//   setAssetLoader({
//     template: name => fetch(`/templates/${TEMPLATE_FILES[name]}`).then(r => r.arrayBuffer()),
//     font:     ()   => fetch('/fonts/BarlowCondensed-Regular.ttf').then(r => r.arrayBuffer()),
//     boldFont: ()   => fetch('/fonts/BarlowCondensed-SemiBold.ttf').then(r => r.arrayBuffer()),
//   })
//
// `boldFont` is optional: without it the names and general approach lines
// are set in the regular weight, as before.

/** The template PDF for each template name, as named under assets/templates/. */
export const TEMPLATE_FILES = {
  classic: 'acbl-classic-2023.pdf',
  new: 'acbl-new.pdf',
}

/** The condensed field font, under assets/fonts/ (SIL OFL; see OFL.txt beside it). */
export const FONT_FILE = 'BarlowCondensed-Regular.ttf'

/** Its semibold, for the card's names and general approach (same licence). */
export const BOLD_FONT_FILE = 'BarlowCondensed-SemiBold.ttf'

let loader = null

/**
 * Tell the library how to get its assets. `template(name)`, `font()` and
 * (optional) `boldFont()` return (a promise of) an ArrayBuffer or Uint8Array.
 */
export function setAssetLoader({ template, font, boldFont = null }) {
  loader = { template, font, boldFont }
}

function need(what) {
  if (!loader) {
    throw new Error(
      `convention-card: no asset loader for the ${what}; call setAssetLoader({ template, font }) first`
    )
  }
  return loader
}

/** The template PDF called `name` ('classic' or 'new'). */
export async function loadTemplate(name) {
  if (!TEMPLATE_FILES[name]) throw new Error(`Unknown ACBL template "${name}"`)
  return need(`"${name}" template`).template(name)
}

/** The condensed field font. */
export async function loadFont() {
  return need('condensed font').font()
}

/** The semibold font, or null when the caller gives no way to get it. */
export async function loadBoldFont() {
  const { boldFont } = need('condensed font')
  return boldFont ? boldFont() : null
}
