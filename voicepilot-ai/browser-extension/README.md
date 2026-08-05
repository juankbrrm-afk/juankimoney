# browser-extension/

**Chrome Manifest V3 + Side Panel API.** VoicePilot encima del CRM que el
cliente ya usa, sin migrar nada.

## Por qué existe

Es el caballo de Troya del producto. Cambiar de CRM es un proyecto de seis
meses y una guerra política interna: **nadie lo hace para probar a un
proveedor nuevo.** La extensión reduce el costo de adopción a una instalación
y un login, y funciona con cualquier CRM web — incluidos los caseros en PHP
que no tienen API.

## Arquitectura MV3

```
browser-extension/
├── src/
│   ├── background/          Service worker: sesión, auth, WebSocket
│   ├── sidepanel/           La UI del copilot (usa shared/ui)
│   ├── content/
│   │   ├── detector/        Qué registro del CRM está abierto
│   │   ├── writeback/       Rellenar campos del CRM anfitrión
│   │   └── adapters/        Por CRM: salesforce, hubspot, zoho, genérico
│   └── offscreen/           Audio/WebRTC si el agente marca desde el CRM
├── public/manifest.json
└── test/
```

## Decisiones de diseño (justificadas en [doc 07 §6](../docs/07-flujo-crm.md))

| Decisión | Motivo |
|---|---|
| **Side Panel, no overlay inyectado** | Un panel flotante en el DOM ajeno rompe el layout del CRM y genera quejas. El Side Panel vive fuera de la página |
| **Selectores del DOM servidos desde la API** | Salesforce cambia su DOM sin avisar. En el código, cada cambio exige una release con días de revisión; desde el servidor se arregla en minutos |
| **Detección en cascada** | URL → atributos `data-*` → selectores CSS → preguntar al agente |
| **Cero datos de negocio almacenados** | Solo token de sesión y preferencias. Una extensión comprometida no debe filtrar la base de leads |
| **Permisos mínimos** | `activeTab`, `sidePanel`, `storage`, y `host_permissions` solo de los dominios configurados. **Nunca `<all_urls>`** — es rechazo seguro en la revisión y alerta roja para cualquier equipo de seguridad corporativo |
| **UI compartida con `frontend/`** | Mantener dos copilots distintos garantiza que uno se quede atrás |

## El problema del service worker

MV3 mata el service worker tras ~30 s de inactividad. Un WebSocket que se
cae a mitad de llamada es inaceptable. Mitigaciones:

- Reconexión automática con reanudación por `seq`
- Puerto de larga vida desde el side panel mientras hay una llamada activa
- El estado crítico se rehidrata desde la API, nunca se asume en memoria

**Esto se prueba explícitamente:** hay un test que fuerza la terminación del
worker a mitad de llamada y verifica que no se pierde ni un evento.

## Estado

No implementado. Empieza en Fase 1, módulo 1.11 ([roadmap](../docs/10-roadmap.md)).
