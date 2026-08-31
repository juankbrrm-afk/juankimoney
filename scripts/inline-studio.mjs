import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
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
<title>Estudio</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0a" />
<style>${styles}</style>
<div id="studio-root"></div>
<script type="module">${code}</script>
`

writeFileSync(join(dir, 'estudio.html'), html)
const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
console.log(`dist-studio/estudio.html · ${kb} kB · un solo archivo`)
