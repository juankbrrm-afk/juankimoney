/**
 * Banco de palabras en castellano para sugerir rimas. No pretende ser un
 * diccionario: son finales de verso utiles, mezclando calle, sentimiento y
 * vocabulario general.
 *
 * Las tildes importan: la rima se calcula desde la silaba tonica, y sin acento
 * "cancion" se leeria como llana y rimaria con lo que no debe. Cualquier
 * palabra que añadas tiene que ir escrita bien.
 */

const CALLE = `
barrio bloque esquina acera calle avenida portal azotea semáforo asfalto
cemento hormigón andamio persiana escalera ascensor descampado polígono
metro vagón andén parada furgoneta moto coche llanta motor gasolina
humo ceniza chispa fuego llama brasa hoguera farola neón cristal
`;

const DINERO = `
dinero billete moneda cartera banco cuenta deuda crédito nómina sueldo
factura interés negocio empresa marca tienda mercado bolsa fondo
lujo joya cadena reloj diamante oro plata cobre piedra corona
inversión beneficio pérdida riesgo apuesta suerte fortuna herencia
`;

const CUERPO = `
sangre hueso piel pecho pulso vena nervio músculo espalda hombro
mano dedo puño rodilla pierna cintura garganta lengua diente labio
ojo mirada ceja pelo cabeza cara boca oído corazón aliento
`;

const EMOCION = `
amor odio miedo rabia calma pena celos dolor duelo llanto
risa fiesta euforia bajón vacío nudo ansia hambre sed ganas
orgullo vergüenza culpa perdón rencor cariño ternura respeto lealtad traición
`;

const TIEMPO = `
tiempo momento instante segundo minuto hora día noche madrugada amanecer
verano invierno otoño primavera lunes viernes domingo semana mes año
ayer mañana ahora siempre nunca antes después tarde temprano luego
`;

const NATURALEZA = `
cielo nube lluvia tormenta trueno rayo viento brisa niebla escarcha
mar ola playa arena marea río puente montaña valle bosque
sol luna estrella sombra luz oscuridad horizonte desierto tierra raíz
`;

const ACCION_AR = `
cantar bailar soñar volar mirar llorar gritar callar contar pensar
buscar encontrar dejar quedar ganar perder tirar cargar apretar aguantar
brillar quemar pintar firmar cerrar abrir saltar pisar rezar jurar
matar salvar cruzar bajar subir doblar romper sonar sudar
`;

const ACCION_ER_IR = `
querer perder tener saber caer creer vencer correr comer beber
morir vivir sentir subir salir venir seguir dormir mentir partir
sufrir latir herir abrir escribir decidir construir destruir resistir insistir
`;

const CUALIDAD = `
frío duro puro claro raro sucio limpio nuevo viejo lento
fuerte flojo suave áspero simple complejo alto bajo lleno seco
libre preso solo roto entero falso cierto vivo muerto
tranquilo nervioso sereno intenso eterno breve leve grave enorme diminuto
`;

const ABSTRACTO = `
verdad mentira duda razón camino destino promesa palabra silencio ruido
guerra paz batalla trinchera bandera frontera memoria historia leyenda futuro
sueño realidad espejo máscara papel proyecto plan trampa jaula condena
esperanza confianza distancia constancia ambición pasión canción misión visión decisión
`;

const GENTE = `
gente familia hermano madre padre hijo amigo enemigo vecino testigo
jefe socio equipo banda pandilla público rival colega compañero
niño hombre mujer alma cuerpo nombre apellido rostro figura fantasma
`;

const MUSICA = `
beat ritmo flow rima verso estrofa coro puente tema disco
micro estudio cabina cinta pista maqueta bombo caja compás tono
melodía armonía letra escenario gira concierto directo ensayo salón
`;

const REMATES = `
adelante atrás arriba abajo afuera adentro encima debajo alrededor enfrente
conmigo contigo consigo también quizá jamás además detrás
igual final total real leal fatal metal cristal caudal umbral
razón corazón canción pasión tensión prisión unión rincón montón talón
acción atención emoción reacción presión traición ilusión ocasión
`;

function words(block: string): string[] {
  return block.trim().split(/\s+/);
}

export const RHYME_BANK: readonly string[] = Array.from(
  new Set(
    [
      CALLE,
      DINERO,
      CUERPO,
      EMOCION,
      TIEMPO,
      NATURALEZA,
      ACCION_AR,
      ACCION_ER_IR,
      CUALIDAD,
      ABSTRACTO,
      GENTE,
      MUSICA,
      REMATES,
    ].flatMap(words)
  )
);

/**
 * Banco efectivo: el diccionario base mas las palabras que ya has usado tu en
 * la letra, para que las sugerencias suenen a tu vocabulario.
 */
export function buildBank(extra: readonly string[] = []): string[] {
  return Array.from(new Set([...RHYME_BANK, ...extra.map((w) => w.toLowerCase())]));
}
