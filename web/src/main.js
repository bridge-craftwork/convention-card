import { createApp } from 'vue'
import { setAssetLoader, TEMPLATE_FILES } from '../../js/assets.js'
import classicUrl from '../../assets/templates/acbl-classic-2023.pdf?url'
import newUrl from '../../assets/templates/acbl-new.pdf?url'
import fontUrl from '../../assets/fonts/BarlowCondensed-Regular.ttf?url'
import App from './App.vue'
import './tokens.css'

// The PDF export's template and font, served beside the app.
const TEMPLATE_URLS = { classic: classicUrl, new: newUrl }
async function bytes(url, what) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${what} (${res.status})`)
  return res.arrayBuffer()
}
setAssetLoader({
  template: name => bytes(TEMPLATE_URLS[name], `the ACBL ${TEMPLATE_FILES[name]} template`),
  font: () => bytes(fontUrl, 'the condensed field font'),
})

createApp(App).mount('#app')
