import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Mete el JS y el CSS del build dentro del propio HTML. El resultado es un
 * unico archivo sin dependencias externas: se puede subir a cualquier sitio o
 * abrir tal cual.
 */
const dir = 'dist-studio'
const assets = readdirSync(join(dir, 'assets'))
const js = assets.find((f) => f.endsWith('.js'))
const css = assets.find((f) => f.endsWith('.css'))
if (!js) throw new Error('No se encontro el bundle de JavaScript')

const code = readFileSync(join(dir, 'assets', js), 'utf8')
const styles = css ? readFileSync(join(dir, 'assets', css), 'utf8') : ''

// El charset va el primero: sin el, un navegador que sirva el archivo suelto
// interpreta los bytes UTF-8 como latin-1 y el bundle deja de parsear.
const html = `<meta charset="utf-8" />
<title>Estudio de Flow</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0a" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Estudio" />
<link rel="apple-touch-icon" href="./icono-180.png" />
<link rel="manifest" href="./manifest.webmanifest" />
<style>${styles}</style>
<div id="studio-root"></div>
<script type="module">${code}</script>
<script>
  // Los archivos de la aplicacion instalable solo existen en el sitio publicado;
  // servido desde otro sitio esto no encuentra nada y no pasa nada.
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
</script>
`

writeFileSync(join(dir, 'estudio.html'), html)

// Sitio instalable: el mismo HTML mas los archivos que lo convierten en app.
const sitio = join(dir, 'sitio')
mkdirSync(sitio, { recursive: true })
writeFileSync(join(sitio, 'index.html'), html)
for (const archivo of ['manifest.webmanifest', 'sw.js', 'icono-180.png', 'icono-192.png', 'icono-512.png']) {
  copyFileSync(join('pwa', archivo), join(sitio, archivo))
}
const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
console.log(`dist-studio/estudio.html · ${kb} kB · un solo archivo`)
console.log('dist-studio/sitio/ · el mismo estudio como aplicacion instalable')
