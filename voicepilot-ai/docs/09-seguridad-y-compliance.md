# 09 — Seguridad y compliance

## 1. Modelo de amenazas

Antes de los controles, hay que nombrar qué estamos defendiendo y de quién.

| Activo | Amenaza | Impacto |
|---|---|---|
| Grabaciones y transcripciones | Fuga; contienen datos personales, a veces tarjetas | Existencial |
| Base de leads del tenant | Exfiltración por competidor o ex-empleado | Pérdida del cliente |
| Aislamiento entre tenants | Un tenant ve datos de otro | Existencial |
| Corpus de conocimiento | Fuga de scripts y precios (secreto comercial) | Pérdida del cliente |
| Perfiles y modelos de voz | Uso indebido para suplantación | Legal + reputacional |
| Credenciales de CRM del cliente | Acceso completo a su Salesforce | Catastrófico |
| Camino del audio en vivo | Interceptación / inyección | Legal |

**El actor más probable no es un atacante externo sofisticado.** Es un
empleado del call center que exporta la base de leads antes de renunciar, o
un agente que graba con el celular la pantalla del copilot. Los controles
deben reflejar eso.

---

## 2. Autenticación

| Mecanismo | Uso | Detalle |
|---|---|---|
| **Email + contraseña** | Tenants pequeños | Argon2id, política de longitud mínima, verificación contra listas de contraseñas filtradas |
| **MFA (TOTP)** | Obligatorio para admin, supervisor, QA | Códigos de recuperación; WebAuthn en v2 |
| **SSO (SAML 2.0 / OIDC)** | Enterprise | Just-in-time provisioning, mapeo de grupos a roles |
| **SCIM 2.0** | Enterprise | Alta y **baja** automática — el offboarding manual es donde se filtran los datos |
| **OAuth2** | Integraciones salientes | Solo authorization code + PKCE |
| **API keys** | Servidor a servidor | Prefijo visible + hash Argon2, con ámbitos y expiración |

### Tokens

```
Access token   JWT, 15 min, firmado EdDSA, claims: sub, tenant_id, roles, scopes
Refresh token  Opaco, 30 días, rotación en cada uso, detección de reutilización
Realtime token JWT, 60 s, un solo uso, para el handshake del WebSocket
```

**Detección de reutilización de refresh token:** si llega un token de refresco
ya consumido, se revoca **toda la familia de sesiones** de ese usuario y se
alerta. Es la señal más clara de un token robado.

---

## 3. Autorización

**RBAC con ámbito**, evaluado en cada request:

```
¿Puede el usuario U hacer la acción A sobre el recurso R?
  1. ¿R pertenece al tenant de U?           → si no, 404 (nunca 403: no revelamos existencia)
  2. ¿Algún rol de U concede el permiso A?
  3. ¿El ámbito del rol cubre el equipo/campaña de R?
  4. ¿Hay una regla de negación explícita?
```

### Roles base

| Rol | Puede | No puede |
|---|---|---|
| **Agent** | Ver sus llamadas, sus leads asignados, usar el copilot | Ver llamadas ajenas, exportar, ver reportes de equipo |
| **Supervisor** | Todo lo de su equipo, monitorear en vivo, coaching | Cambiar configuración de tenant, ver otros equipos |
| **QA** | Ver y puntuar todas las llamadas, escuchar grabaciones | Editar CRM, ver datos financieros |
| **Analyst** | Reportes agregados, exportar métricas | Escuchar grabaciones, ver PII de contactos |
| **Admin** | Configuración, usuarios, integraciones, scripts | Escuchar grabaciones sin permiso explícito |
| **Owner** | Todo, incluida la facturación | — |

Dos separaciones deliberadas:

- **Analyst ve números, no personas.** El que hace reportes no necesita
  escuchar llamadas ni ver teléfonos. Minimiza la superficie de fuga.
- **Admin configura, no escucha.** Que el administrador de TI pueda escuchar
  todas las llamadas de ventas por defecto es un problema, no una feature.
  Requiere concesión explícita y auditada.

### Acciones sensibles: siempre auditadas

Estas escriben en `audit_log` sin excepción, y son consultables por el propio
tenant desde la UI:

- Escuchar o descargar una grabación
- Monitorear una llamada en vivo
- Exportar datos (cualquier volumen)
- Cambiar permisos o roles
- Ver o modificar credenciales de integración
- Cambiar la política de retención
- Acceso de nuestro personal de soporte al tenant

---

## 4. Aislamiento entre tenants

Defensa en profundidad, cuatro capas independientes:

1. **Token** — `tenant_id` viene del JWT firmado. Jamás de un parámetro,
   header o cuerpo de la petición.
2. **Aplicación** — cada repositorio inyecta `tenant_id` en toda consulta,
   por un interceptor obligatorio; no es responsabilidad del desarrollador
   recordarlo.
3. **Base de datos (RLS)** — políticas de Row-Level Security. Aunque la capa
   2 falle, Postgres devuelve cero filas.
4. **Almacenamiento** — prefijo de bucket por tenant + clave de cifrado
   distinta por tenant. Un error de ruta no da acceso: la clave no descifra.

**Prueba automatizada obligatoria:** en CI, una suite crea dos tenants e
intenta acceder a los recursos del otro por **cada endpoint de la API**. Si
alguno devuelve datos, el build falla. Esta suite se regenera automáticamente
al añadir endpoints — no se confía en que alguien recuerde escribirla.

---

## 5. Cifrado

| Estado | Mecanismo |
|---|---|
| En tránsito (externo) | TLS 1.3, HSTS, sin cifrados obsoletos |
| En tránsito (interno) | mTLS entre servicios |
| Audio en vivo | SRTP (WebRTC), DTLS-SRTP obligatorio |
| En reposo — base de datos | Cifrado de volumen + cifrado a nivel de columna para PII sensible |
| En reposo — grabaciones | **Clave por tenant**, gestionada en KMS, rotación anual |
| En reposo — credenciales de CRM | Secret manager dedicado. **Nunca en la base de datos**; la tabla solo guarda una referencia |
| Backups | Cifrados, con claves distintas de las de producción |

**Clave por tenant, no una global.** Cuesta más operar, pero convierte un
compromiso de una clave en un incidente de un cliente, en lugar de en un
incidente de la compañía. Y es lo que permite el borrado criptográfico: para
cumplir un "derecho al olvido" de un tenant completo, se destruye su clave.

---

## 6. El riesgo legal de la voz sintética

> **Esta sección es la más importante del documento y requiere opinión legal
> formal antes del primer cliente pago en Estados Unidos. No es negociable.**

### El problema, sin adornos

Estamos construyendo un sistema que hace que una persona suene como otra, en
una llamada comercial, hacia consumidores estadounidenses, sin que estos lo
sepan. Eso toca varias áreas regulatorias a la vez, y algunas están en
movimiento activo.

### Áreas de exposición

**1. Regulación de voz artificial en telemarketing.**
La FCC ha determinado que las voces generadas por IA en llamadas
automatizadas caen bajo las restricciones de la TCPA. Nuestro caso es
distinto — hay un humano hablando en vivo y en tiempo real, no un mensaje
generado — pero la frontera entre "voz procesada" y "voz artificial" no está
definida legalmente, y la interpretación puede endurecerse.
*Necesitamos opinión legal específica sobre este punto.*

**2. Grabación de llamadas y consentimiento.**
Varios estados de EE.UU. exigen consentimiento de **todas** las partes para
grabar (California, Florida, Pensilvania, Washington, Illinois, entre otros).
Grabamos por defecto. Para llamadas interestatales, la práctica prudente es
aplicar la regla más estricta.

**3. Leyes emergentes de divulgación de IA.**
Varios estados han legislado o están legislando la obligación de revelar
cuando un consumidor interactúa con IA. El alcance varía y está cambiando
rápido.

**4. Derechos sobre la voz.**
La voz de una persona es un atributo protegido en varias jurisdicciones. Esto
afecta tanto a las **voces destino** (deben ser licenciadas, con contrato
explícito para este uso) como a las **voces de los agentes** (su voz es un
dato biométrico en algunas jurisdicciones — notablemente bajo la BIPA de
Illinois, que permite demandas privadas).

**5. Datos biométricos.**
Los embeddings de locutor que usamos para extracción de voz objetivo pueden
calificar como identificadores biométricos. Eso activa requisitos de
consentimiento, retención y notificación.

### Controles que implementamos desde el diseño

| Control | Implementación |
|---|---|
| **Consentimiento del agente** | `agent_voice_profiles.consent_recorded_at` es `NOT NULL`. Sin consentimiento registrado, el esquema no permite procesar su voz |
| **Voces destino licenciadas** | Solo voces de actores con contrato explícito para uso sintético comercial. **Nunca clonamos la voz de una persona real sin su contrato** |
| **Prohibición de suplantación** | El sistema no permite subir una muestra de voz arbitraria para clonarla. Solo se elige de la biblioteca licenciada. Es una restricción de producto deliberada |
| **Modo de divulgación configurable** | Por tenant y por jurisdicción: sin divulgación, anuncio al inicio, o divulgación bajo demanda. **El valor por defecto es anunciar** |
| **Anuncio de grabación automático** | Configurable por jurisdicción del número destino, con detección automática del estado por prefijo |
| **Doble pista de grabación** | `agent_raw` + `agent_processed`. Prueba de lo que se dijo y de lo que se escuchó |
| **Doble transcripción** | `text_original` + `text_delivered`. Igual, en texto |
| **Retención de embeddings** | Se borran al desactivar al agente, con confirmación auditada |
| **Trazabilidad completa** | Cada llamada registra modo de voz, voz destino y versión del modelo |
| **DNC** | Verificación antes de conectar, con bloqueo duro |

### Postura de producto

**No escondemos lo que hacemos.** El material comercial describe VoicePilot
como *procesamiento de voz asistido por IA*, no como magia. El default del
sistema es divulgar. Un cliente puede desactivar la divulgación bajo su
propia responsabilidad legal, y ese cambio queda registrado en la auditoría
con nombre, fecha y aceptación de términos.

Esta postura cuesta algunas ventas. También es lo que permite que la compañía
exista dentro de tres años.

### Acción requerida antes del primer cliente pago

1. Opinión legal formal en EE.UU. sobre voz procesada en vivo bajo TCPA/FCC
2. Revisión estado por estado de grabación y divulgación
3. Plantillas contractuales: consentimiento del agente, licencias de voz,
   términos de servicio con reparto de responsabilidad
4. Definición de qué mercados aceptamos en el lanzamiento (probablemente
   empezar por los estados de consentimiento de una sola parte)

---

## 7. Privacidad de datos

### Minimización

- El copilot recibe solo los fragmentos recuperados, no la base de conocimiento
- Los proveedores externos de IA reciben **solo** lo necesario, con
  redacción previa de PII cuando la tarea no la requiere
- Los logs **nunca** contienen transcripciones, PII ni audio. Solo
  identificadores y métricas. Regla verificada por un linter en CI

### Redacción automática

Detección y enmascarado en transcripciones y análisis de: números de tarjeta,
números de seguridad social, cuentas bancarias. Configurable por tenant y
activado por defecto. Se guarda `[REDACTED:card]`, no el valor.

Combinado con la **pausa PCI** ([doc 05 §6](05-flujo-de-llamada.md)) que
detiene grabación y ASR durante la captura de datos de pago.

### Uso de datos de clientes para entrenar

**Por defecto: no.** El audio y las transcripciones de un tenant no se usan
para entrenar modelos, ni los nuestros ni los de terceros.

Los tenants pueden **optar por participar** en el programa de mejora, con:
contrato explícito, anonimización, remoción de PII, y derecho de retirada.
A cambio reciben descuento. Es la única forma honesta de construir el volante
de datos.

**Los contratos con proveedores de IA deben incluir cláusula de no
entrenamiento y retención cero.** Sin esa cláusula, no se usa el proveedor.

### Derechos del titular

| Derecho | Implementación | SLA |
|---|---|---|
| Acceso | Exportación completa por contacto | 7 días |
| Rectificación | Edición en la UI | Inmediato |
| Supresión | Borrado en cascada, incluidos audio y transcripciones | 30 días |
| Portabilidad | Exportación CSV/JSON | 7 días |
| Oposición | Marca DNC + exclusión de procesamiento | Inmediato |

---

## 8. Seguridad operativa

| Área | Control |
|---|---|
| **Acceso de nuestro personal** | Nadie tiene acceso permanente a datos de clientes. Acceso just-in-time, con aprobación, límite de tiempo y notificación al tenant |
| **Secretos** | Secret manager, rotación automática, cero secretos en el repositorio (verificado por escaneo en cada commit) |
| **Dependencias** | SCA en CI, SBOM por release, parcheo de críticas en 7 días |
| **Imágenes** | Escaneo de contenedores, base distroless, imágenes firmadas |
| **Red** | Segmentación por plano, egreso restringido por lista blanca, WAF en el borde |
| **Backups** | Diarios, cifrados, cross-region, **con prueba de restauración mensual** |
| **Respuesta a incidentes** | Runbook, guardia rotativa, notificación en 72 h, post-mortem sin culpables |
| **Pentest** | Anual por tercero, más un programa de divulgación responsable |

Sobre la prueba de restauración mensual: un backup que nunca se ha
restaurado no es un backup, es una esperanza.

---

## 9. Certificaciones: qué y cuándo

| Certificación | Cuándo | Por qué |
|---|---|---|
| **SOC 2 Tipo I** | Mes 9 | Primer requisito que pide cualquier cliente serio |
| **SOC 2 Tipo II** | Mes 18 | Requiere 6+ meses de evidencia operativa |
| **PCI DSS (SAQ)** | Cuando haya campañas con pagos | Alcance reducido gracias a la pausa PCI |
| **GDPR** | Con el primer cliente europeo | Requiere región de datos en la UE + DPA |
| **HIPAA** | Solo si entramos a salud | Cambia el modelo de datos entero. Decisión de negocio, no técnica |
| **ISO 27001** | Mes 24+ | Requisito europeo y de grandes BPO |

**Todos los controles necesarios para SOC 2 se construyen desde el día uno**
(auditoría, control de accesos, cifrado, gestión de cambios). Añadirlos
después es reescribir; construirlos desde el principio es casi gratis.

---

## 10. Lo que decidimos NO hacer

- **No guardamos números de tarjeta.** Nunca, ni cifrados. La pausa PCI y la
  redacción existen para garantizarlo.
- **No permitimos clonar voces arbitrarias.** Aunque un cliente lo pida y
  pague. Es la línea que separa un producto de una herramienta de fraude.
- **No vendemos ni agregamos datos de clientes.** Los datos del tenant son
  del tenant. No hay "insights de industria" construidos con sus llamadas.
- **No damos acceso permanente a soporte.** Cada acceso es puntual, aprobado
  y notificado.
- **No aceptamos campañas de robocalls.** Nuestro sistema requiere un humano
  hablando en vivo. Es una restricción arquitectónica y también un filtro de
  clientes que no queremos.
