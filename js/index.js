// @bridge-craftwork/convention-card: read and write convention cards
// against the spec, convert BBO, bridgeodex and .bbsa cards, fill the ACBL
// PDFs and read them back. No framework and no network access; see
// docs/DESIGN.md, "The JavaScript library".

export { FIELDS, field, BBSA_MAP, CONVENTIONS } from './spec.js'
export { readPath, writePath } from './paths.js'
export { normalizeSuitShorthand } from './suits.js'
export { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from './assets.js'

export { isBboCard, importBboJson } from './bboImport.js'
export { importBridgeodexJson } from './bridgeodexImport.js'
export { NT_DEFENSE_BIDS, KNOWN_NT_DEFENSES, findKnownDefense } from './ntDefenses.js'

export {
  buildAcblPdf,
  buildAcblClassicPdf,
  renderAcblPdfBytes,
  extractCardDataFromPdf,
  downloadAcblPdf,
  downloadAcblClassicPdf,
  downloadAcblFieldDebugPdf,
} from './acblClassicFillPdf.js'
export { buildAcblCardPdf, downloadAcblCardPdf } from './acblCardPdf.js'
