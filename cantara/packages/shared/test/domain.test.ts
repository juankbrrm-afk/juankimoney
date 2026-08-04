import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeProgress, GENERATION_STAGES, stageLabel } from '../src/jobs';
import { CREDIT_COSTS, songCost, pricePerCredit, CREDIT_PACKS } from '../src/credits';
import { MIN_USABLE_SCORE, scoreQuality } from '../src/audio';
import { defaultBpm, estimateDurationSeconds, GENRE_PROFILES, pitchShiftFor } from '../src/music';
import { createSongSchema, createVoiceSchema, registerSchema } from '../src/contracts';

describe('progreso de trabajos', () => {
  it('avanza de forma monótona a lo largo de las etapas', () => {
    let previous = -1;
    for (const stage of GENERATION_STAGES) {
      const value = computeProgress('song-generation', stage, 1);
      assert.ok(value > previous, `${stage} debería superar a la etapa anterior`);
      previous = value;
    }
    assert.equal(previous, 100);
  });

  it('interpola dentro de una etapa sin salirse de su tramo', () => {
    const start = computeProgress('song-generation', 'composition', 0);
    const mid = computeProgress('song-generation', 'composition', 0.5);
    const end = computeProgress('song-generation', 'composition', 1);

    assert.equal(start, 10); // fin de la etapa anterior
    assert.equal(end, 40);
    assert.ok(mid > start && mid < end);
  });

  it('acota valores de avance fuera de rango', () => {
    assert.equal(computeProgress('song-generation', 'lyrics', -5), 0);
    assert.equal(computeProgress('song-generation', 'lyrics', 99), 10);
  });

  it('devuelve 0 para una etapa desconocida en lugar de romper', () => {
    assert.equal(computeProgress('song-generation', 'inventada', 0.5), 0);
    assert.equal(stageLabel('song-generation', 'inventada'), 'Procesando');
  });
});

describe('créditos', () => {
  it('cobra menos por regenerar que por crear', () => {
    assert.ok(songCost({ isRegeneration: true }) < songCost({}));
  });

  it('no cobra extra por debajo de tres minutos', () => {
    assert.equal(songCost({ durationSeconds: 120 }), CREDIT_COSTS.songGeneration);
    assert.equal(songCost({ durationSeconds: 180 }), CREDIT_COSTS.songGeneration);
  });

  it('cobra por minuto extra a partir de tres minutos', () => {
    assert.equal(songCost({ durationSeconds: 240 }), CREDIT_COSTS.songGeneration + 5);
  });

  it('mejora el precio por crédito en los packs grandes', () => {
    const prices = CREDIT_PACKS.map(pricePerCredit);
    for (let i = 1; i < prices.length; i += 1) {
      assert.ok(prices[i]! < prices[i - 1]!, 'un pack mayor debe salir más barato por crédito');
    }
  });
});

describe('calidad de audio', () => {
  it('puntúa alto una grabación limpia', () => {
    const { score, issues } = scoreQuality({
      snrDb: 30,
      clippingRatio: 0,
      silenceRatio: 0.2,
      rmsDbfs: -18,
      durationSeconds: 60,
    });
    assert.equal(score, 100);
    assert.deepEqual(issues, []);
  });

  it('detecta saturación y ruido a la vez', () => {
    const { score, issues } = scoreQuality({
      snrDb: 6,
      clippingRatio: 0.08,
      silenceRatio: 0.1,
      rmsDbfs: -8,
      durationSeconds: 60,
    });
    assert.ok(issues.includes('clipping'));
    assert.ok(issues.includes('noisy'));
    assert.ok(score < MIN_USABLE_SCORE);
  });

  it('nunca baja de cero por muchos defectos que acumule', () => {
    const { score } = scoreQuality({
      snrDb: -20,
      clippingRatio: 1,
      silenceRatio: 1,
      rmsDbfs: -70,
      durationSeconds: 1,
    });
    assert.ok(score >= 0);
  });
});

describe('dominio musical', () => {
  it('el bpm por defecto cae dentro del rango del género', () => {
    for (const profile of Object.values(GENRE_PROFILES)) {
      const bpm = defaultBpm(profile.id);
      assert.ok(bpm >= profile.bpm[0] && bpm <= profile.bpm[1], profile.id);
    }
  });

  it('un tempo más lento alarga la duración estimada', () => {
    assert.ok(estimateDurationSeconds('standard', 70) > estimateDurationSeconds('standard', 140));
  });

  it('no transpone cuando el timbre ya coincide con el registro', () => {
    assert.equal(pitchShiftFor('masculine', true), 0);
    assert.equal(pitchShiftFor('feminine', false), 0);
    assert.equal(pitchShiftFor('natural', true), 0);
  });

  it('transpone solo cuando hace falta cambiar de registro', () => {
    assert.ok(pitchShiftFor('masculine', false) < 0);
    assert.ok(pitchShiftFor('feminine', true) > 0);
  });
});

describe('contratos', () => {
  it('rechaza una canción con voz sin modelo asignado', () => {
    const result = createSongSchema.safeParse({
      prompt: 'algo alegre',
      genre: 'pop',
      language: 'es',
      instrumental: false,
      voiceModelId: null,
    });
    assert.equal(result.success, false);
  });

  it('acepta una instrumental sin modelo de voz', () => {
    const result = createSongSchema.safeParse({
      prompt: 'algo alegre',
      genre: 'pop',
      language: 'es',
      instrumental: true,
      voiceModelId: null,
    });
    assert.equal(result.success, true);
  });

  it('exige el consentimiento para crear un modelo de voz', () => {
    const base = { name: 'Mi voz', uploadIds: ['u1'] };
    assert.equal(createVoiceSchema.safeParse(base).success, false);
    assert.equal(
      createVoiceSchema.safeParse({
        ...base,
        consent: { version: '2026-08-01', ownVoiceConfirmed: true },
      }).success,
      true,
    );
  });

  it('normaliza el email a minúsculas y sin espacios', () => {
    const result = registerSchema.parse({
      email: '  Juan@Example.COM ',
      password: 'una-contraseña-larga',
      displayName: 'Juan',
      acceptedTerms: true,
    });
    assert.equal(result.email, 'juan@example.com');
  });

  it('rechaza contraseñas cortas', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'corta',
      displayName: 'Juan',
      acceptedTerms: true,
    });
    assert.equal(result.success, false);
  });
});
