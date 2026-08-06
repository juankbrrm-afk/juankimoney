"""Genera el informe de estado de VoicePilot AI."""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

OUT = "/home/user/juankimoney/voicepilot-ai/docs/VoicePilot-AI-Informe-de-Estado.pdf"

INK = colors.HexColor("#16181A")
INK2 = colors.HexColor("#5F676E")
INK3 = colors.HexColor("#8B9298")
LINE = colors.HexColor("#E3E6E8")
GOOD = colors.HexColor("#0E9F6E")
WARN = colors.HexColor("#B7791F")
CRIT = colors.HexColor("#D64545")
INFO = colors.HexColor("#2563EB")
BG = colors.HexColor("#F7F8F8")

ss = getSampleStyleSheet()


def S(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=14.5, textColor=INK,
                alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(name, **base)


BODY = S("body", spaceAfter=7)
LEDE = S("lede", fontSize=11, leading=17, textColor=INK2, spaceAfter=10)
H1 = S("h1", fontName="Helvetica-Bold", fontSize=19, leading=23, spaceAfter=9, spaceBefore=2)
H2 = S("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceAfter=6, spaceBefore=15)
H3 = S("h3", fontName="Helvetica-Bold", fontSize=10, leading=14, spaceAfter=4, spaceBefore=10)
EYEBROW = S("eyebrow", fontName="Helvetica-Bold", fontSize=7.5, textColor=INFO, spaceAfter=3)
SMALL = S("small", fontSize=8.5, leading=12.5, textColor=INK2, spaceAfter=5)
MONO = S("mono", fontName="Courier", fontSize=8.5, leading=12.5, textColor=INK)
CELL = S("cell", fontSize=8.5, leading=12)
CELLB = S("cellb", fontSize=8.5, leading=12, fontName="Helvetica-Bold")
CELLH = S("cellh", fontSize=7.5, leading=10, fontName="Helvetica-Bold", textColor=colors.white)

story = []


def h1(t): story.append(Paragraph(t, H1))
def h2(t): story.append(Paragraph(t, H2))
def h3(t): story.append(Paragraph(t, H3))
def p(t, st=BODY): story.append(Paragraph(t, st))
def sp(h=6): story.append(Spacer(1, h))


def rule(c=LINE, w=0.7):
    t = Table([[""]], colWidths=[168 * mm], rowHeights=[0.1])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), w, c)]))
    story.append(t)


def table(rows, widths, header=True, zebra=True):
    data = []
    for i, row in enumerate(rows):
        style = CELLH if (header and i == 0) else CELL
        data.append([Paragraph(c, style) if isinstance(c, str) else c for c in row])
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]
    if header:
        cmds += [("BACKGROUND", (0, 0), (-1, 0), INK), ("TOPPADDING", (0, 0), (-1, 0), 6),
                 ("BOTTOMPADDING", (0, 0), (-1, 0), 6)]
    if zebra:
        for i in range(1 + (1 if header else 0), len(rows), 2):
            cmds.append(("BACKGROUND", (0, i), (-1, i), BG))
    t.setStyle(TableStyle(cmds))
    story.append(t)


def callout(title, body, accent=INFO):
    inner = [[Paragraph(f"<b>{title}</b>", S("ct", fontSize=9, leading=13, textColor=accent))],
             [Paragraph(body, S("cb", fontSize=8.8, leading=13, textColor=INK))]]
    t = Table(inner, colWidths=[164 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("BOTTOMPADDING", (0, 1), (0, 1), 9),
        ("BOTTOMPADDING", (0, 0), (0, 0), 2),
        ("TOPPADDING", (0, 1), (0, 1), 0),
    ]))
    story.append(KeepTogether(t))
    sp(9)


def metric_row(items):
    """items: [(valor, etiqueta, color)]"""
    cells = []
    for val, lab, col in items:
        cells.append([
            Paragraph(f"<b>{val}</b>", S("mv", fontSize=17, leading=20, textColor=col)),
            Paragraph(lab, S("ml", fontSize=7.6, leading=10, textColor=INK2)),
        ])
    data = [[c[0] for c in cells], [c[1] for c in cells]]
    w = 168 * mm / len(items)
    t = Table(data, colWidths=[w] * len(items))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEABOVE", (0, 0), (-1, 0), 0.7, LINE),
        ("LINEBELOW", (0, 1), (-1, 1), 0.7, LINE),
    ]))
    story.append(t)
    sp(10)


# ===========================================================================
# PORTADA
# ===========================================================================
sp(38)
p("INFORME DE ESTADO · 6 DE AGOSTO DE 2026", EYEBROW)
story.append(Paragraph("VoicePilot AI", S("cover", fontName="Helvetica-Bold",
                                          fontSize=38, leading=42, spaceAfter=6)))
story.append(Paragraph(
    "Sistema operativo de IA para contact centers",
    S("sub", fontSize=15, leading=20, textColor=INK2, spaceAfter=16)))
rule(INK, 2)
sp(16)

p("Hablas tú. El cliente te oye en inglés americano perfecto.",
  S("hook", fontName="Helvetica-Bold", fontSize=13.5, leading=18, spaceAfter=8))
p("Hablas inglés con acento, o hablas español. El cliente oye lo mismo: inglés "
  "nativo, con tu entonación, en tiempo real, sin que aprietes nada. Encima de "
  "eso: el copilot que te sopla la respuesta correcta según el material de tu "
  "empresa, el vigilante de compliance, y el CRM que se escribe solo cuando "
  "cuelgas.", LEDE)
sp(6)

metric_row([
    ("292 ms", "Latencia añadida, Modo A<br/>medido, no estimado", GOOD),
    ("0 / 200", "Respuestas inventadas<br/>contra un modelo que miente", GOOD),
    ("201", "Tests automatizados<br/>en tres lenguajes", INFO),
    ("100 %", "Continuidad de audio<br/>con la GPU muerta", GOOD),
])

p("<b>Estado:</b> especificación completa y aprobada (14 documentos). Cuatro "
  "módulos de ingeniería construidos, probados y medidos. Un demo funcional. "
  "El resto, no empezado — por diseño.", BODY)

sp(14)
callout(
    "Lo que este informe intenta hacer",
    "Separar tres cosas que en la mayoría de los informes de producto van "
    "mezcladas: <b>lo que está construido y medido</b>, <b>lo que está "
    "especificado pero no existe</b>, y <b>lo que aprendimos construyendo que "
    "cambió el plan</b>. La tercera categoría es la más valiosa y la que casi "
    "nunca se escribe.", INK)

story.append(PageBreak())

# ===========================================================================
# 1. EL NEGOCIO
# ===========================================================================
p("01", EYEBROW)
h1("El negocio, en una frase")
rule()
sp(10)

p("Un agente en Medellín, Bogotá o La Habana habla con un cliente en Miami. El "
  "cliente cree que habla con alguien de Phoenix. No lo sospecha en ningún "
  "momento de la llamada.", LEDE)

p("Ese es el producto. Todo lo demás — el copilot, el compliance, el CRM, el "
  "dashboard — es lo que hace que valga una suscripción mensual en vez de una "
  "curiosidad técnica. Pero <b>el acento es el gancho</b>, y es lo que decide "
  "si alguien contesta el correo.")

h2("Por qué esto es un negocio y no un truco")

p("El mercado del BPO latinoamericano vende una cosa: minutos de agente más "
  "baratos que los de Estados Unidos. Compra ese descuento pagando una pena — "
  "tasas de conversión más bajas, porque una parte de los clientes cuelga en "
  "los primeros diez segundos al oír el acento. Nadie lo dice en voz alta y "
  "todo el mundo en la industria lo sabe.")

p("VoicePilot quita la pena sin quitar el descuento. El mismo agente, el mismo "
  "costo por hora, y una tasa de contacto de agente local. Eso no es una mejora "
  "de eficiencia del 5 %; es la eliminación del único defecto estructural del "
  "modelo de negocio del cliente.")

h2("Dos modos, y por qué el segundo es más difícil")

table([
    ["MODO", "QUÉ HACE", "LATENCIA AÑADIDA", "ESTADO"],
    ["<b>Modo A</b>", "El agente habla inglés con acento. El cliente oye inglés "
     "americano nativo, con la entonación del agente.",
     "<b>292 ms</b><br/>medido", "Núcleo probado"],
    ["<b>Modo B</b>", "El agente habla <b>español</b>. El cliente oye inglés. "
     "El agente nunca deja de hablar su idioma.",
     "<b>1.025 ms</b><br/>medido", "Núcleo probado"],
], [22 * mm, 82 * mm, 32 * mm, 32 * mm])
sp(10)

p("La diferencia de latencia no es una deficiencia de ingeniería: es física del "
  "lenguaje. Convertir un acento no exige entender la frase — se puede empezar a "
  "convertir el tercer fonema mientras el sexto aún no existe. <b>Traducir exige "
  "entender, y entender exige esperar.</b> En español el verbo llega tarde; "
  "empezar a emitir en inglés antes de oírlo produce una frase que hay que "
  "retractar, y el audio ya emitido no se puede retractar.")

p("Por eso el Modo A es el producto del MVP y el Modo B es la Fase 2. Un segundo "
  "de retardo es notable en una conversación; 292 ms no lo es.")

callout(
    "El número que decide todo el proyecto",
    "<b>Prueba ciega en EE.UU., semana 8: ≥ 8 de 10 receptores no detectan que "
    "la voz es sintética.</b> Si sale 5–7, seis semanas más de I+D sin construir "
    "producto. Si sale menos de 5, alto total y se replantea la tesis. Esta "
    "puerta está escrita en frío, ahora, precisamente para que dentro de cuatro "
    "meses no se decida por optimismo.", WARN)

story.append(PageBreak())

# ===========================================================================
# 2. QUÉ ESTÁ CONSTRUIDO
# ===========================================================================
p("02", EYEBROW)
h1("Qué está construido")
rule()
sp(10)

p("Cuatro módulos completos, con tests, telemetría y criterio de salida "
  "verificado. Cero dependencias externas en los tres: el motor de audio no "
  "usa un solo crate, el núcleo de CRM no tiene <font face='Courier'>"
  "node_modules</font>, y el copilot no importa nada fuera de la biblioteca "
  "estándar de Python. Eso no es purismo — es lo que permite auditar cada línea "
  "y arrancar sin instalar nada.", LEDE)

table([
    ["MÓDULO", "QUÉ ES", "PARA QUÉ SIRVE", "TESTS"],
    ["<b>Voice Engine</b><br/><font size=7 color='#8B9298'>Rust · "
     "media/voice-engine</font>",
     "El motor de audio en tiempo real: planificador de salida, detector de "
     "actividad de voz, monitor de salud, cliente de inferencia remota.",
     "Es el corazón. Garantiza que sale un cuadro de audio al cliente cada 20 ms "
     "<b>siempre</b>, incluso con todo el plano de inteligencia caído. Y mide la "
     "latencia real de cualquier modelo que le pongas dentro — comprado o propio.",
     "<b>71</b>"],
    ["<b>Contrato remoto</b><br/><font size=7 color='#8B9298'>gRPC · "
     "shared/proto</font>",
     "El contrato entre el plano de medios (Rust) y el de inteligencia (Python), "
     "con semántica explícita de fallo.",
     "Permite que el modelo corra en otra máquina sin que la llamada se degrade. "
     "Probado contra un transporte simulado con inyección de fallos.",
     "incl."],
    ["<b>Núcleo de CRM</b><br/><font size=7 color='#8B9298'>TypeScript · "
     "shared/crm</font>",
     "Modelo canónico, contrato de adaptador, motor de mapeo, cola de sincronía "
     "idempotente, y el <b>nivel L1</b> que funciona con cualquier CRM.",
     "Es lo que hace cierto \"se integra con el CRM que ya usas\". Un solo modelo "
     "de datos; cada conector es un traductor. El L1 funciona incluso con un CRM "
     "casero sin API.",
     "<b>67</b>"],
    ["<b>Copilot anclado</b><br/><font size=7 color='#8B9298'>Python · "
     "ai-services/copilot-core</font>",
     "Recuperación híbrida, detección de disparadores, y las cuatro capas que "
     "impiden estructuralmente que el copilot invente.",
     "Es el segundo número del producto: <b>0 respuestas inventadas</b>. Si no "
     "está en el material de la empresa, el copilot calla.",
     "<b>63</b>"],
    ["<b>Demo funcional</b><br/><font size=7 color='#8B9298'>demo/index.html</font>",
     "Un archivo. Consola del agente con llamada guionizada, conversión de voz en "
     "vivo real, y comparador manual ANTES/DESPUÉS.",
     "Es la herramienta de venta. El comparador funciona en el teléfono, sin "
     "llave y sin internet, delante de un cliente.",
     "36<br/><font size=7>navegador</font>"],
], [30 * mm, 44 * mm, 72 * mm, 22 * mm])

sp(12)
h2("Lo medido, y cómo verificarlo")

p("Ninguno de estos números es una estimación. Todos salen de un programa que "
  "cualquiera puede correr.")

table([
    ["QUÉ", "RESULTADO", "CÓMO SE COMPRUEBA"],
    ["Latencia boca-a-oído, Modo A",
     "<b>292 ms</b>, 99,9 % del audio convertido entregado",
     "<font face='Courier' size=7.5>cd media/voice-engine<br/>"
     "cargo run --release --bin latency-bench</font>"],
    ["Latencia boca-a-oído, Modo B", "<b>1.025 ms</b>, 97,5 % entregado", "ídem"],
    ["Continuidad de audio bajo fallo",
     "<b>100 %</b> con la GPU muerta, con 900 ms de stall, con 100 % de pérdida "
     "de paquetes, y con el enlace de inferencia caído a mitad de llamada",
     "ídem"],
    ["Inferencia remota, misma región", "<b>99,73 %</b> entregado — "
     "indistinguible de local",
     "<font face='Courier' size=7.5>cargo run --release --example "
     "remote-report</font>"],
    ["Inferencia remota, otra región", "<b>0,00 %</b> entregado", "ídem"],
    ["Alucinaciones del copilot",
     "<b>0 en 200 pruebas</b>, con un generador que miente en dos de cada tres "
     "llamadas. <b>0 citas cruzadas entre tenants.</b>",
     "<font face='Courier' size=7.5>cd ai-services/copilot-core<br/>"
     "python3 -m eval.run</font>"],
    ["Costo de las cuatro capas de defensa", "<b>0,5 ms</b> p95", "ídem"],
], [46 * mm, 58 * mm, 64 * mm])

story.append(PageBreak())

# ===========================================================================
# 3. HALLAZGOS
# ===========================================================================
p("03", EYEBROW)
h1("Lo que aprendimos construyendo")
rule()
sp(10)

p("Esta es la sección que justifica haber construido antes de vender. Cada uno "
  "de estos hallazgos habría costado semanas o un cliente si se descubre en "
  "producción. Todos salieron de escribir el código y medirlo.", LEDE)

h3("1 · La GPU en otra región no es una optimización pendiente. Es una llamada muerta.")
p("Con el modelo de inferencia en la misma región: 99,73 % del audio convertido "
  "llega a tiempo — indistinguible de tenerlo en la misma máquina. Con el modelo "
  "en otra región: <b>0,00 %</b>. No \"peor\": cero. Cada cuadro llega después de "
  "su turno de reproducción y se descarta.")
p("Esto convierte la colocación regional de GPU en un <b>requisito funcional del "
  "producto</b>, no en una decisión de infraestructura que se optimiza después. "
  "Cambia el modelo de costos y el plan de despliegue, y se descubrió en la "
  "semana 2 en vez de en el primer piloto.", SMALL)

h3("2 · Sin modelo de embeddings, el copilot es inútil aunque no invente.")
p("Recuperación solo léxica: <b>0 de 40 objeciones parafraseadas respondidas</b>. "
  "Cero. Con la mitad vectorial conectada: 12 de 40. Las frases que fallan son "
  "\"eso es más de lo que quería gastar\" y \"no me alcanza el presupuesto\" — que "
  "es exactamente como los clientes objetan. El manual dice \"es muy caro\"; "
  "nadie lo dice así en voz alta.")
p("La especificación listaba BM25 y búsqueda vectorial como si fueran pares. No "
  "lo son. <b>El modelo de embeddings es bloqueante del módulo, no una mejora "
  "de fase posterior.</b> El roadmap está corregido.", SMALL)

h3("3 · Tres defectos estaban en mi propia especificación, no en el código.")
p("El banco de latencia encontró que el límite de backpressure especificado "
  "descartaba el 46 % de las llamadas sanas — porque un modelo en streaming "
  "retiene cuadros por construcción y el límite estaba escrito como si no. El "
  "monitor de salud no podía salir nunca del modo de emergencia, porque se "
  "alimentaba de cuadros que en emergencia dejan de existir. Y el presupuesto "
  "de latencia del Modo B omitía el margen de reproducción: 1.025 ms reales "
  "contra 930 ms estimados.")
p("Se corrigió el documento, no el número.", SMALL)

h3("4 · \"Anclado\" no es lo mismo que \"relevante\", y hay que decirlo.")
p("El 16 % de lo que entrega la configuración híbrida del copilot está respaldado "
  "por sus citas <b>y no responde a la pregunta</b> — un párrafo de garantías ante "
  "una pregunta sobre reventa. La garantía del módulo es sobre el respaldo y se "
  "cumple entera: 0 de 200. La relevancia es trabajo del reranker, que aún no "
  "existe, y ese 16 % es el tamaño honesto del hueco.")

h3("5 · ReadyMode es dueño del audio, y eso decide un trimestre.")
p("ReadyMode coloca la llamada. Si acepta un troncal SIP del cliente, nuestro "
  "plano de medios se inserta y todo lo construido sirve tal cual: un fin de "
  "semana de trabajo. Si no lo acepta, hace falta un driver de audio firmado en "
  "cada estación de trabajo: un trimestre, más revisión de seguridad corporativa "
  "en cada cliente.")
p("Es la pregunta abierta más cara del proyecto, y se responde con una llamada a "
  "su equipo técnico. Está escrita como pregunta concreta en el documento 13.", SMALL)

sp(4)
callout(
    "El patrón",
    "Cuatro de los cinco hallazgos son defectos de <b>especificación</b>, no de "
    "implementación. Una arquitectura no se valida leyéndola; se valida "
    "midiéndola. Por eso el orden fue construir el banco de latencia antes que "
    "el producto: para que los errores de diseño aparezcan cuando cuestan un día "
    "y no cuando cuestan un cliente.", GOOD)

story.append(PageBreak())

# ===========================================================================
# 4. CUALQUIER CRM
# ===========================================================================
p("04", EYEBROW)
h1("Cómo se integra con cualquier CRM")
rule()
sp(10)

p("La promesa comercial es \"se monta encima del CRM que ya usas, cero "
  "migración\". Esa frase es fácil de decir y cara de cumplir: hay ocho CRMs "
  "grandes y un número indeterminado de sistemas caseros sin API.", LEDE)

p("La solución es no tratarlos igual. Tres niveles, con criterio explícito de "
  "cuál merece cuál.")

table([
    ["NIVEL", "QUÉ HACE", "ESFUERZO", "PARA QUIÉN"],
    ["<b>L1<br/>Superposición</b>",
     "La extensión de Chrome pinta VoicePilot encima. Lee qué registro está "
     "abierto leyendo la página. Escribe en los propios campos del CRM. "
     "<b>Sin API.</b>",
     "1 semana<br/>por CRM",
     "<b>Cualquier CRM web</b>, incluidos los caseros. El 100 % del mercado."],
    ["<b>L2<br/>Escritura</b>",
     "API oficial. Escribe llamadas, notas y disposiciones. Lectura bajo demanda.",
     "2–3 semanas", "Zoho, Pipedrive, la mayoría"],
    ["<b>L3<br/>Bidireccional</b>",
     "Sincronía completa en ambos sentidos, webhooks entrantes, mapeo de campos "
     "personalizado, resolución de conflictos.",
     "6–8 semanas", "Salesforce, HubSpot"],
], [26 * mm, 76 * mm, 22 * mm, 44 * mm])
sp(10)

p("<b>L3 en ocho CRMs es un equipo entero manteniendo APIs ajenas para siempre. "
  "L1 cubre todo el mercado con el 5 % del esfuerzo.</b> Por eso el L1 es lo que "
  "está construido, y es lo que permite responder \"sí\" en vez de \"está en el "
  "roadmap\" cuando un cliente pregunta si funciona con el suyo.")

h2("Las dos preguntas difíciles del L1, y cómo se resolvieron")

h3("¿Qué registro está mirando el agente?")
p("Sin API hay que deducirlo de una página que no es nuestra. La cascada va de "
  "más a menos fiable: patrón de URL, atributos <font face='Courier'>data-*</font>, "
  "selectores CSS servidos desde el servidor, y preguntar al agente.")
p("Lo importante no es la cascada, es <b>qué pasa cuando dos escalones se "
  "contradicen: no se vota</b>. Una respuesta equivocada aquí no es una función "
  "que falta — es una nota de llamada escrita sobre el registro de otro cliente, "
  "y nadie se entera en semanas. Evidencia en conflicto produce un rechazo y una "
  "pregunta de un clic al agente, que sí está viendo la pantalla.")
p("Además la confianza separa <b>mostrar</b> de <b>escribir</b>. Un selector CSS "
  "que lee texto renderizado basta para apuntar el copilot a un registro y no "
  "basta para escribir sin confirmación. Una sugerencia equivocada desperdicia "
  "una sugerencia; una escritura equivocada corrompe un pipeline.", SMALL)

h3("¿La escritura entró de verdad?")
p("Se verifica leyendo de vuelta antes de declarar éxito, porque el formulario "
  "ajeno hace cosas con el valor:")

table([
    ["LO QUE PASA", "POR QUÉ IMPORTA"],
    ["React ignora un <font face='Courier'>.value=</font> programático sin evento "
     "de input", "El campo parece lleno, el estado del framework está vacío, el "
     "agente guarda y <b>no se guarda nada</b>. Es el fallo L1 más común."],
    ["El CRM reformatea <font face='Courier'>3055550142</font> como "
     "<font face='Courier'>(305) 555-0142</font>",
     "Una comparación ingenua declara fallida una escritura que funcionó, y la "
     "cola reintenta para siempre."],
    ["El CRM trunca un resumen de 900 caracteres a 500",
     "Corta <b>el final</b>, que es donde vive el compromiso de seguimiento: "
     "\"llamar el viernes\", \"el crédito vence el 31\"."],
    ["El campo es de solo lectura, o no existe",
     "Son problemas distintos para personas distintas: uno es del administrador "
     "del cliente, el otro es nuestra configuración obsoleta."],
], [56 * mm, 112 * mm])
sp(8)
p("Cada campo lleva veredicto propio y solo \"escrito y verificado\" cuenta como "
  "éxito. Un campo malo nunca tumba el resto de la escritura.", SMALL)

story.append(PageBreak())

# ===========================================================================
# 5. QUÉ NO ESTÁ
# ===========================================================================
p("05", EYEBROW)
h1("Qué NO está construido")
rule()
sp(10)

p("Enumerarlo con precisión vale más que cualquier lista de logros. Un informe "
  "que solo dice lo que existe no sirve para decidir nada.", LEDE)

table([
    ["PIEZA", "ESTADO", "QUÉ HACE FALTA"],
    ["Puente SIP y SFU (LiveKit)",
     "<font color='#D64545'><b>Bloqueado por entorno</b></font>",
     "Requiere descargar dependencias de Rust que este entorno no alcanza. El "
     "contrato y el cliente están hechos y probados contra un simulador con "
     "inyección de fallos: <b>falta cableado, no diseño</b>."],
    ["Modelo de conversión de voz propio",
     "<font color='#B7791F'><b>Se compra, no se construye</b></font>",
     "Corrección de estrategia deliberada. La conversión ya existe como servicio "
     "y el demo la usa de verdad. Para el MVP se compra: sale esta semana en vez "
     "de en seis meses. El modelo propio llega cuando el volumen justifique el "
     "costo por minuto."],
    ["Modelo de embeddings y reranker",
     "<font color='#D64545'><b>Bloqueante de Fase 1</b></font>",
     "Los protocolos de inyección están listos y probados. Falta el modelo. Sin "
     "él el copilot no responde a objeciones parafraseadas."],
    ["ASR y transcripción en vivo", "No empezado", "Fase 1, módulo 1.4."],
    ["Ingesta de conocimiento (PDF, DOCX, URL)", "No empezado",
     "Fase 1, módulo 1.5. Debe entregar embeddings reales desde el primer día."],
    ["Motor de compliance", "Especificado, no construido",
     "Fase 1, módulo 1.7. El diseño de dos capas está escrito."],
    ["Consola del agente, dashboard, CRM nativo", "No empezado",
     "Fase 1. El sistema de diseño está definido (documento 12)."],
    ["Extensión de Chrome", "Especificada, no construida",
     "La lógica difícil — detección de registro y escritura verificada — ya está "
     "construida y probada en <font face='Courier' size=7.5>shared/crm</font>. "
     "Falta el envoltorio MV3."],
    ["Tenancy, auth, RBAC, auditoría", "No empezado", "Fase 1, módulo 1.1."],
], [46 * mm, 34 * mm, 88 * mm])

sp(12)
h2("Riesgos reales")

table([
    ["RIESGO", "IMPACTO", "QUÉ HACER"],
    ["<b>ReadyMode no acepta troncal SIP propio</b>",
     "Un trimestre en vez de un fin de semana, más revisión de seguridad "
     "corporativa en cada cliente.",
     "Una llamada a su equipo técnico. <b>Es la acción de mayor valor por minuto "
     "de todo el proyecto.</b>"],
    ["<b>La prueba ciega sale por debajo de 8/10</b>",
     "El producto no existe tal como está planteado.",
     "La puerta de decisión de la semana 8 ya está escrita. No se negocia después."],
    ["<b>Consentimiento y divulgación de voz IA</b>",
     "Riesgo legal real. Varios estados de EE.UU. regulan la voz sintética en "
     "ventas, y la regulación se está endureciendo.",
     "Documento 09. Hace falta opinión legal <b>antes</b> del primer piloto, no "
     "después."],
    ["<b>Dependencia de un proveedor de conversión</b>",
     "El costo por minuto y la latencia quedan en manos ajenas; un cambio de "
     "precios cambia el margen.",
     "El motor mide cualquier modelo que se le ponga dentro. El cambio de "
     "proveedor — o a modelo propio — es una sustitución, no una reescritura."],
], [44 * mm, 60 * mm, 64 * mm])

story.append(PageBreak())

# ===========================================================================
# 6. PRÓXIMOS PASOS
# ===========================================================================
p("06", EYEBROW)
h1("Próximos pasos, en orden")
rule()
sp(10)

p("Ordenados por lo que desbloquea, no por lo que es agradable de construir.", LEDE)

table([
    ["#", "ACCIÓN", "POR QUÉ AHORA", "CRITERIO DE SALIDA"],
    ["1", "<b>Llamar al equipo técnico de ReadyMode</b> y preguntar si aceptan "
     "un troncal SIP del cliente.",
     "Decide entre dos arquitecturas cuya diferencia es un trimestre. Cuesta una "
     "llamada. Todo lo demás se planifica peor sin esa respuesta.",
     "Respuesta por escrito, sí o no."],
    ["2", "<b>Grabar el ANTES/DESPUÉS</b> con tu voz y cargarlo en el comparador "
     "del demo.",
     "Es la herramienta de venta. Hasta que un cliente no lo <b>oiga</b>, todo "
     "esto es una descripción.",
     "Dos audios en el teléfono, listos para reproducir."],
    ["3", "<b>Conectar un modelo de embeddings real</b> al copilot.",
     "Es bloqueante: sin él el copilot no responde a objeciones parafraseadas, "
     "que son la mayoría.",
     "≥ 30 de 40 paráfrasis respondidas en <font face='Courier' size=7>"
     "eval.run</font>."],
    ["4", "<b>Cablear LiveKit y el puente SIP</b> en un entorno con acceso a "
     "dependencias.",
     "Es lo único que separa el motor probado de una llamada telefónica real.",
     "Una llamada PSTN real convertida extremo a extremo."],
    ["5", "<b>Prueba ciega en EE.UU.</b> con 10 receptores.",
     "La puerta de decisión. Nada de Fase 1 debe empezar antes de pasarla.",
     "≥ 8 de 10 no detectan síntesis."],
    ["6", "<b>Opinión legal</b> sobre divulgación y consentimiento de voz "
     "sintética.",
     "Un piloto que hay que apagar por una carta de un fiscal general cuesta más "
     "que el piloto.",
     "Guion de divulgación aprobado por abogado."],
    ["7", "<b>Fundamentos de plataforma</b>: tenancy, auth, RBAC, auditoría.",
     "Es la base de todo lo demás y no se puede retrofitear.",
     "Suite de aislamiento entre tenants al 100 %."],
], [8 * mm, 46 * mm, 62 * mm, 52 * mm])

sp(12)
h2("El calendario, sin optimismo")

table([
    ["FASE", "QUÉ ENTREGA", "CUÁNDO", "PUERTA"],
    ["<b>Fase 0</b><br/>Prueba de latencia",
     "La respuesta a una sola pregunta: ¿se puede convertir voz en tiempo real "
     "con calidad de venta y latencia invisible? <b>No se construye producto.</b>",
     "Semanas 1–12<br/><font size=7 color='#0E9F6E'>parcialmente cumplida</font>",
     "Prueba ciega ≥ 8/10, semana 8"],
    ["<b>Fase 1</b><br/>MVP vendible",
     "Un call center piloto operando de verdad, todos los días.",
     "Semanas 13–32",
     "500+ llamadas/semana durante 4 semanas · 0 alucinaciones · −60 % de trabajo "
     "post-llamada"],
    ["<b>Fase 2</b><br/>Producto",
     "De un piloto a 20 clientes que renuevan. Modo B en producción, Salesforce, "
     "SOC 2 Tipo I.",
     "Meses 9–14",
     "20 clientes activos · retención > 90 % · NPS > 40"],
    ["<b>Fase 3</b><br/>Enterprise",
     "Contratos de seis cifras.", "Meses 15–24", "—"],
], [28 * mm, 60 * mm, 34 * mm, 46 * mm])

sp(12)
callout(
    "Principio de ejecución",
    "<b>Un módulo no se abandona a medias.</b> Se termina — con tests, "
    "telemetría, documentación y criterio de salida verificado — antes de empezar "
    "el siguiente. Diez módulos al 80 % valen cero; seis al 100 % son un producto. "
    "Esa es la razón de que este informe tenga una lista corta de cosas "
    "construidas y una lista larga de cosas explícitamente no empezadas.", INFO)

sp(6)
h2("Cómo verificar todo esto por tu cuenta")

story.append(Paragraph(
    "cd voicepilot-ai/media/voice-engine<br/>"
    "cargo test                              <font color='#8B9298'># 71 tests</font><br/>"
    "cargo run --release --bin latency-bench <font color='#8B9298'># la tabla de latencia</font><br/><br/>"
    "cd ../../shared/crm<br/>"
    "npm test                                <font color='#8B9298'># 67 tests</font><br/><br/>"
    "cd ../../ai-services/copilot-core<br/>"
    "python3 -m unittest discover -s . -p \"test_*.py\" -t .   <font color='#8B9298'># 63 tests</font><br/>"
    "python3 -m eval.run                     <font color='#8B9298'># 0 alucinaciones / 200</font>",
    S("code", fontName="Courier", fontSize=8, leading=13, textColor=INK)))

sp(14)
rule()
sp(6)
p("VoicePilot AI · Informe de estado · 6 de agosto de 2026 · "
  "Rama <font face='Courier'>claude/voicepilot-ai-architecture-k02lj7</font>",
  S("foot", fontSize=7.5, textColor=INK3))


# ===========================================================================
# BUILD
# ===========================================================================
class Doc(BaseDocTemplate):
    def afterPage(self):
        c = self.canv
        if self.page > 1:
            c.saveState()
            c.setStrokeColor(LINE)
            c.setLineWidth(0.5)
            c.line(21 * mm, A4[1] - 15 * mm, A4[0] - 21 * mm, A4[1] - 15 * mm)
            c.setFont("Helvetica", 7.5)
            c.setFillColor(INK3)
            c.drawString(21 * mm, A4[1] - 12.5 * mm, "VoicePilot AI · Informe de estado")
            c.drawRightString(A4[0] - 21 * mm, A4[1] - 12.5 * mm, "6 de agosto de 2026")
            c.drawRightString(A4[0] - 21 * mm, 12 * mm, str(self.page))
            c.restoreState()


doc = Doc(OUT, pagesize=A4, leftMargin=21 * mm, rightMargin=21 * mm,
          topMargin=22 * mm, bottomMargin=20 * mm,
          title="VoicePilot AI — Informe de estado",
          author="VoicePilot AI", subject="Estado del proyecto, hallazgos y próximos pasos")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame])])
doc.build(story)
print("written:", OUT)
