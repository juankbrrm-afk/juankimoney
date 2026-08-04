# Canciones con tu voz — uso personal

Sin cuentas, sin base de datos, sin navegador. Una carpeta con tus
grabaciones, un comando, tu canción.

Si lo que quieres es la aplicación web completa (registro, panel, historial,
créditos), esa también está: mira el [README](README.md). Esta guía es el
camino corto.

---

## 1. Instalar (una vez)

Necesitas [Node.js 22 o superior](https://nodejs.org).

```bash
git clone <url-del-repo>
cd cantara
npm install
```

Ya está. No hace falta Docker, ni Postgres, ni Redis: el CLI no los usa.

## 2. Graba tu voz

```bash
mkdir mi-voz
```

Mete ahí entre **2 y 10 minutos** de grabaciones tuyas. Sirve cualquier
formato normal: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.webm`, `.flac`. Las notas de
voz del móvil valen.

Lo que de verdad cambia el resultado:

- **Sitio silencioso.** El modelo aprende lo que le des, incluida la nevera de
  fondo.
- **No satures.** Aléjate un palmo del micrófono. El recorte es el único
  defecto irreversible: una vez la onda está cortada, no se recupera.
- **Varias tomas cortas** funcionan mejor que una larga de diez minutos.
- **Canta un poco** en alguna toma, aunque desafines. Ayuda más que solo
  hablar.

El programa analiza cada archivo antes de entrenar y te dice qué tal está.

## 3. Haz tu canción

```bash
npm run cancion -- --prompt "reguetón de verano sobre volver al barrio"
```

La primera vez entrena tu voz (unos minutos) y guarda el modelo. A partir de
ahí, cada canción tarda segundos.

Los archivos aparecen en `./canciones/`: el **MP3**, el **WAV** y la **letra**.

### Ejemplos

```bash
# Balada en inglés
npm run cancion -- --prompt "sad ballad about missing home" \
                   --genero ballad --idioma en

# Con tu propia letra
npm run cancion -- --prompt "trap oscuro, 808 pesados" \
                   --genero trap --letra mi-letra.txt --titulo "Sin Salida"

# Más corta y con otro registro
npm run cancion -- --prompt "cumbia alegre de fin de año" \
                   --genero cumbia --duracion 90 --timbre feminine
```

Todas las opciones:

```bash
npm run cancion -- --ayuda
```

### Si escribes tú la letra

Un `.txt` normal. Los marcadores son opcionales:

```
[Verso]
Camino solo entre las luces de agosto
Y el pueblo sigue donde lo dejé

[Estribillo]
Vuelvo a casa, vuelvo a casa
Aunque ya no sea la misma
```

Entiende `[Verso]`, `[Estribillo]`, `[Coro]`, `[Puente]`, `[Intro]`, `[Outro]`
y sus equivalentes en inglés.

---

## 4. Que sea tu voz de verdad

**Esto es lo importante y no te lo puedo maquillar.**

Tal cual lo acabas de instalar, el programa funciona de principio a fin pero
**la voz que sale no es la tuya**: es un sintetizador que existe para que todo
se pueda probar sin pagar nada. Verás este aviso al ejecutarlo.

Clonar una voz cantada necesita una GPU. No hay forma de evitarlo — ni aquí ni
en ninguna otra herramienta. Tienes dos opciones:

### Opción A — Replicate (recomendada, ~5 $)

1. Crea una cuenta en [replicate.com](https://replicate.com) y añade unos
   pocos dólares de saldo.
2. Copia tu token desde [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens).
3. Busca en [replicate.com/explore](https://replicate.com/explore) un modelo de
   *voice conversion* (busca `rvc` o `seed-vc`) y otro de *stem separation*
   (busca `demucs`). Copia sus nombres en formato `owner/nombre`, tal cual
   aparecen en el título de su página.
4. Crea un archivo `.env` en la raíz del proyecto:

```bash
VOICE_PROVIDER=seedvc
STEMS_PROVIDER=demucs
REPLICATE_API_TOKEN=r8_tu_token_aqui

SEEDVC_MODEL=owner/nombre-del-modelo
DEMUCS_MODEL=owner/nombre-del-modelo
```

`seedvc` no necesita entrenamiento: usa tus grabaciones como referencia
directa y va en segundos. Si prefieres máxima fidelidad, usa `VOICE_PROVIDER=rvc`
con `RVC_TRAIN_MODEL` y `RVC_INFER_MODEL`; entrena de verdad y tarda unos
minutos, pero clava mejor el timbre.

Coste aproximado por canción: **entre 5 y 30 céntimos**.

### Opción B — tu propio ordenador

Si tienes una GPU NVIDIA decente, puedes instalar
[seed-vc](https://github.com/Plachtaa/seed-vc) o
[RVC](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI) en
local y escribir un adaptador para el mismo puerto
(`packages/ai/src/ports.ts`, interfaz `VoiceConverter`). Son unas 40 líneas.
No hay que tocar nada más del pipeline.

### Y la música

Con lo anterior ya cantas tú, pero la base la sigue haciendo el sintetizador
interno. Para música de calidad real, añade también:

```bash
MUSIC_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=tu_clave

LYRICS_PROVIDER=anthropic
ANTHROPIC_API_KEY=tu_clave
```

Ninguna es obligatoria. Puedes activarlas de una en una y oír la diferencia en
cada paso.

---

## Problemas frecuentes

**«No encuentro la carpeta ./mi-voz»**
Créala y mete tus grabaciones dentro, o apunta a otra con `--voz /ruta/a/tus/audios`.

**«Necesitamos al menos 2 minutos de grabación»**
Suma más tomas. El programa te dice cuánto tiene contado de cada archivo.

**«Hay demasiado ruido de fondo» / «El audio está saturado»**
Es el análisis de calidad haciendo su trabajo: con ese material el modelo
saldría mal. Regraba más cerca del silencio y con menos volumen de entrada.

**Quiero rehacer el modelo de voz**
```bash
npm run cancion -- --reentrenar --prompt "..."
```

**Quiero borrar mi voz del todo**
Borra la carpeta `mi-voz/` (incluido `mi-voz/.modelo.json`). No hay nada en
ningún otro sitio: el CLI no sube nada a ninguna parte salvo que actives un
proveedor externo.

---

## Una nota sobre la voz de otras personas

Esto está pensado para que cantes **tú**. Usar la voz de otra persona sin su
permiso escrito no es un detalle legal menor, y en muchos sitios es
directamente ilegal. Tu voz es tuya; la de los demás, de ellos.
