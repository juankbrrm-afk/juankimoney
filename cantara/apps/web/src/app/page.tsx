import Link from 'next/link';
import { GENRE_PROFILES, GENRES, SIGNUP_CREDITS } from '@cantara/shared';
import { Button } from '@/components/ui';

/**
 * Landing.
 *
 * Un Server Component sin estado: se sirve estático y no descarga JavaScript
 * de la aplicación. La primera pantalla debe pintar rápido incluso en móvil
 * con conexión pobre, que es donde se pierde a la mayoría de visitantes.
 */
export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-gradient">Cantara</span>
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Entrar
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Crear cuenta</Button>
          </Link>
        </nav>
      </header>

      <main id="contenido">
        <section className="aurora relative overflow-hidden px-5 pb-20 pt-12 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="animate-in text-sm font-medium uppercase tracking-widest text-accent-300">
              Tu voz, tus canciones
            </p>

            <h1 className="animate-in mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Canciones completas
              <br />
              cantadas <span className="text-gradient">por ti</span>
            </h1>

            <p className="animate-in mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-400">
              Graba entre dos y diez minutos de tu voz una sola vez. A partir de ahí, escribe una
              idea y recibe una canción producida y masterizada, cantada con tu propio timbre.
            </p>

            <div className="animate-in mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register">
                <Button size="lg">Empezar gratis</Button>
              </Link>
              <span className="text-sm text-ink-600">
                {SIGNUP_CREDITS} créditos de regalo · sin tarjeta
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Cómo funciona</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-ink-400">
            Ningún generador de música canta con tu voz de una sola pasada. Se compone la canción,
            se separa la voz guía y se sustituye por la tuya.
          </p>

          <ol className="mt-12 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="surface p-6">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-600/15 text-sm font-semibold text-accent-300">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-16">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">
            {GENRES.length} géneros, {8} idiomas
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-ink-400">
            Cada género trae su tempo, su instrumentación y su objetivo de masterización. Un
            reguetón se produce como un reguetón.
          </p>

          <ul className="mt-10 flex flex-wrap justify-center gap-2.5">
            {GENRES.map((genre) => (
              <li
                key={genre}
                className="flex items-center gap-2 rounded-full border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-300"
              >
                <span aria-hidden>{GENRE_PROFILES[genre].icon}</span>
                {GENRE_PROFILES[genre].label}
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
          <div className="surface p-10">
            <h2 className="text-2xl font-semibold">Tu voz es tuya</h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed text-ink-400">
              Solo puedes entrenar modelos con tu propia voz o con permiso escrito de su titular.
              Al borrar un modelo se elimina de verdad: las grabaciones, el modelo entrenado en el
              proveedor y su registro.
            </p>
            <Link href="/register" className="mt-8 inline-block">
              <Button size="lg">Crear mi voz</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-900 px-5 py-8">
        <p className="mx-auto max-w-6xl text-center text-sm text-ink-700">
          Cantara · Música generada con IA
        </p>
      </footer>
    </div>
  );
}

const STEPS = [
  {
    title: 'Graba tu voz',
    description:
      'De 2 a 10 minutos, hablando o cantando. Analizamos la calidad antes de entrenar y te decimos qué mejorar si hace falta.',
  },
  {
    title: 'Describe la canción',
    description:
      'Elige género, idioma y estructura. Escribe tú la letra o deja que la IA la escriba a partir de tu idea.',
  },
  {
    title: 'Descarga y comparte',
    description:
      'Recibes la canción mezclada y masterizada, en MP3 y en WAV. ¿No te convence? Regenera y compara las tomas.',
  },
] as const;
