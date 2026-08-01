# Riesgos técnicos y regulatorios (Panamá)

Esta sección existe porque el brief lo pide explícitamente ("identifica
riesgos técnicos y regulatorios para operar con clínicas en Panamá") y
porque en salud + datos personales + IA, ignorarlos no es opcional. Ninguno
de estos puntos es un bloqueador para lanzar el MVP piloto; todos requieren
una decisión consciente y, en varios casos, revisión legal antes de escalar
a más clínicas o a otros países.

## Regulatorios

1. **Ley 81 de 2019 (Protección de Datos Personales de Panamá) — datos de
   salud son "datos sensibles".** La ley panameña clasifica los datos de
   salud como categoría especial que requiere consentimiento explícito e
   informado para su tratamiento. Decisión de diseño: la plataforma es
   **CRM + marketing**, no un expediente clínico — nunca se captura
   diagnóstico, historia clínica ni resultados de exámenes (ver
   `DATABASE.md`, modelo `Patient`). Aun así, "interesado en rinoplastia" o
   "consulta de fertilidad" ya es información de salud sensible por
   inferencia. Mitigación: (a) texto de consentimiento explícito en cada
   landing page y en el primer mensaje de WhatsApp del asistente
   ("al escribirnos aceptas que usemos tus datos para contactarte sobre tu
   consulta — política de privacidad: [link]"), registrado como
   `ConsentRecord` con timestamp e IP; (b) cifrado en reposo de campos de
   contacto y notas (`pgcrypto` o cifrado a nivel de aplicación) en fase 2;
   (c) derecho de acceso/rectificación/eliminación implementado como
   endpoint de soporte (`/api/settings/data-requests`) antes de operar con
   la primera clínica en producción, no como afterthought.
2. **Publicidad de servicios médicos está regulada por el Ministerio de
   Salud (MINSA) y el Colegio Médico de Panamá.** No se pueden publicar
   testimonios de "antes/después" sin regulación específica, promesas de
   resultado, ni comparaciones que puedan interpretarse como garantía de
   éxito de un procedimiento. Esto afecta directamente el **landing
   builder** (plantillas deben pasar revisión legal antes de publicarse por
   defecto) y el **asistente de IA** (guardrails explícitos en
   `AI_SYSTEM.md` sección 3) — MedGrowth es responsable como agencia de lo
   que publica en nombre de sus clientes, así que el riesgo reputacional/
   legal es compartido, no solo de la clínica.
3. **Cada clínica/doctor requiere idoneidad profesional vigente** (registro
   ante el Ministerio de Salud / colegio correspondiente). MedGrowth no
   verifica currícula médica, pero sí debe dejar constancia contractual
   (onboarding) de que el cliente declara estar habilitado — mitiga
   responsabilidad de la agencia si un cliente resulta no habilitado.
4. **WhatsApp Business Platform (Meta) tiene políticas propias para sector
   salud**: plantillas de mensajes deben pasar aprobación de Meta, y Meta
   restringe categorías sensibles (no se puede usar WhatsApp para volumen
   de marketing no solicitado — solo mensajes iniciados por el usuario o
   plantillas de utilidad/transaccionales aprobadas). Riesgo: una cuenta de
   WhatsApp Business puede ser suspendida por Meta si se usa para spam o
   plantillas mal categorizadas — esto tumbaría el canal principal de
   varias clínicas a la vez. Mitigación: todas las plantillas se someten a
   aprobación antes de uso, y el volumen de mensajes salientes por
   automatización respeta ventanas de 24h de conversación abierta.
5. **Stripe y procesamiento de pagos en Panamá.** Stripe no tiene soporte
   nativo completo de payouts en Panamá para todas las entidades — se
   documenta como riesgo a validar con Stripe Atlas/soporte directo antes de
   contratar el primer cliente real; alternativa de respaldo: procesar vía
   una entidad en EE.UU./LATAM soportada (p. ej. facturar en USD desde una
   entidad admitida) o evaluar un proveedor local (Yappy, tarjetas locales)
   como complemento para la parte de "agencia" (no necesariamente para el
   SaaS).
6. **ACODECO (protección al consumidor) y transparencia de precios.** Si el
   landing builder o el asistente de IA comunican precios, deben ser
   verificables y no engañosos — refuerza la regla de "solo rangos
   pre-aprobados por la clínica" del sistema de IA.

## Técnicos

7. **Vendor lock-in de autenticación.** Elegimos Auth.js para el MVP en vez
   de Clerk (ver `ARCHITECTURE.md` 1.2) precisamente para no atar la
   identidad de usuarios a un proveedor externo antes de validar producto.
   Riesgo residual: Auth.js requiere más trabajo manual para 2FA robusto —
   se prioriza en el roadmap antes de manejar datos de salud sensibles en
   producción (ver punto 1).
8. **Dependencia de un solo proveedor de IA.** Mitigado por diseño
   (`packages/ai`), pero el riesgo real es de *contenido*, no solo de
   disponibilidad: un modelo puede alucinar información médica o de precios.
   Cubierto por los guardrails + post-procesador de `AI_SYSTEM.md` sección 3.
9. **Multi-tenancy a nivel de aplicación (no RLS) en el MVP.** Un bug en un
   Route Handler que olvide filtrar por `organizationId` expondría datos
   entre clínicas. Mitigación inmediata: un único helper
   `requireOrgContext()` + un test de integración que verifica, por cada
   endpoint, que una organización no puede leer datos de otra. RLS en
   Postgres se prioriza como hardening antes de superar ~20-30 clínicas o
   antes de manejar el primer cliente que lo exija contractualmente.
10. **Costos de IA no acotados.** Un flujo de WhatsApp mal configurado (loop
    de auto-respuesta) puede generar miles de llamadas a la API de IA en
    minutos. Mitigación: rate limiting por conversación (`AI_SYSTEM.md` #5,
    `AIUsageLog`) + límite duro de mensajes de IA por conversación por hora,
    con fallback a plantilla estática y alerta a operaciones.
11. **Rate limiting y abuso de endpoints públicos.** `/api/public/leads/*`
    y los webhooks son superficie de ataque (spam de leads falsos, DoS
    ligero). Mitigación: rate limiting por IP (Vercel Edge Middleware +
    Upstash Redis), captcha invisible en formularios públicos de landing
    pages, y verificación de firma en todos los webhooks entrantes.
12. **Backups y continuidad del CRM.** Para una clínica, perder el pipeline
    de leads/citas es un incidente de negocio grave, no solo técnico —
    política de backups y RTO/RPO documentada en `DEPLOYMENT.md` debe
    comunicarse explícitamente en el contrato de servicio (SLA).

## Decisión de alcance para el piloto en Ciudad de Panamá

Antes de firmar la primera clínica real (no demo), se debe tener resuelto
como mínimo: consentimiento explícito registrado (#1), plantillas de
WhatsApp aprobadas por Meta (#4), y guardrails de IA activos y probados con
casos reales (#2, #8). El resto de los puntos son endurecimiento progresivo
documentado en `ROADMAP.md`, no bloqueadores del piloto.
