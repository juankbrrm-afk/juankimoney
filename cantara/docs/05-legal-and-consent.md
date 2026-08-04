# Consentimiento, licencias y uso responsable

La clonación de voz es la parte del producto con más superficie de daño. Estas
decisiones son parte del diseño, no un anexo.

## 1. Consentimiento antes de entrenar

Nadie puede entrenar un modelo sin aceptar un consentimiento explícito:

- Se declara que la voz subida es **la propia**, o que se cuenta con permiso
  escrito de la persona titular.
- Se registra en `VoiceConsent`: `version`, `acceptedAt`, `ip`, `userAgent`.
  Versionado, porque si cambia el texto legal hay que saber qué aceptó cada
  usuario y cuándo.
- La API **rechaza** `POST /voices` sin consentimiento vigente para la versión
  activa. No es una casilla decorativa en el frontend: es una precondición del
  servidor.

## 2. Borrado real

`DELETE /voices/:id` no marca una bandera. Borra:

1. las muestras de audio en S3,
2. el modelo entrenado en el proveedor externo (llamada de borrado en el puerto
   `VoiceTrainer.delete`),
3. la fila en base de datos.

Las canciones ya generadas se conservan (son obra del usuario) pero pierden la
referencia al modelo. Un derecho de supresión que deja copias en el proveedor no
es un derecho de supresión.

## 3. Alcance de uso

El servicio está diseñado para que **un usuario cante con su propia voz**. No se
ofrece —ni se debe añadir— catálogo de voces de terceros, imitación de artistas
identificables, ni entrenamiento sobre voces públicas. Las canciones generadas
llevan metadatos que declaran generación asistida por IA.

## 4. Licencia de la música generada

Depende del proveedor musical activo y **cambia**:

- **ElevenLabs Music** (predeterminado): contenido generado por API con licencia
  comercial; publicidad, cine, TV, videojuegos y distribución empresarial
  requieren licencia adicional.
- **Suno / Udio**: los litigios de Sony esperaban resolución hacia mediados de
  2026. Sus adaptadores existen pero **no son el predeterminado**.

`packages/shared/src/licensing.ts` mantiene, por proveedor, qué usos están
permitidos, y la UI muestra esa nota junto a cada descarga. Es información que
el usuario necesita **en el momento de descargar**, no enterrada en unos
términos.

## 5. Datos personales

Una grabación de voz es dato biométrico bajo el RGPD. En consecuencia:

- Cifrado en tránsito y en reposo (SSE-S3 del lado del bucket).
- URLs prefirmadas de vida corta; el bucket nunca es público.
- Exportación e eliminación disponibles para el usuario desde el panel.
- Las muestras crudas se conservan solo mientras exista el modelo.
