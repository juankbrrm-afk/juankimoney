/**
 * Plantillas de letra para el proveedor local.
 *
 * `{}` marca dónde se inyectan palabras del prompt del usuario, para que
 * prompts distintos den letras distintas. No sustituye a un modelo de
 * lenguaje —para eso está `AnthropicLyricsProvider`— pero produce texto
 * coherente y con métrica, suficiente para desarrollar y probar el resto del
 * pipeline sin gastar tokens.
 */

export interface LyricBank {
  readonly verse: readonly string[];
  readonly chorus: readonly string[];
  readonly short: readonly string[];
}

export const LOCAL_LYRIC_BANK: Record<string, LyricBank> = {
  es: {
    verse: [
      'Camino solo entre {} y el ruido de la ciudad',
      'Guardo tu nombre donde nadie lo puede encontrar',
      'La noche me enseña que {} no vuelve igual',
      'Y aunque me pierda, sé volver a este lugar',
      'Todo lo que fuimos cabe en {} y nada más',
      'Me quedo despierto contando lo que va a pasar',
    ],
    chorus: [
      'Grito tu nombre en medio de {}',
      'No me sueltes todavía, quédate un poco más',
      'Si todo se apaga, {} me va a alumbrar',
      'Y bailo aunque el mundo se caiga detrás',
    ],
    short: ['Uh, {}', 'Y otra vez', 'Aquí estoy', 'Solo tú y {}'],
  },
  en: {
    verse: [
      'I walk alone through {} and the noise downtown',
      'I keep your name where nobody can find it now',
      'The night keeps teaching me that {} never stays',
      'And even lost, I know my way back anyway',
      'Everything we were still fits inside {}',
      'I stay awake and count the things I cannot change',
    ],
    chorus: [
      'I scream your name in the middle of {}',
      "Don't let go yet, just stay a little more",
      'If the lights go out, {} will light the way',
      'And I dance even if the world falls behind',
    ],
    short: ['Oh, {}', 'One more time', "I'm still here", 'Just you and {}'],
  },
  pt: {
    verse: [
      'Ando sozinho entre {} e o barulho da cidade',
      'Guardo teu nome onde ninguém vai encontrar',
      'A noite me ensina que {} não volta igual',
      'E mesmo perdido eu sei voltar pra cá',
    ],
    chorus: [
      'Grito teu nome no meio de {}',
      'Não me solta ainda, fica um pouco mais',
      'Se tudo apagar, {} vai me iluminar',
      'E eu danço mesmo se o mundo cair',
    ],
    short: ['Uh, {}', 'Mais uma vez', 'Estou aqui', 'Só você e {}'],
  },
};
