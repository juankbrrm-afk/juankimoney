# Estudio de Flow — build publicado

`index.html` es el estudio entero en un solo archivo, generado con
`npm run build:studio` desde la raiz del repositorio. No pide nada a ningun
servidor: el JavaScript y el CSS van dentro.

Para tenerlo en el movil con una URL propia: en GitHub, Settings → Pages →
Source "Deploy from a branch", rama `main` y carpeta `/docs`. El estudio queda
en `https://<usuario>.github.io/<repo>/estudio/`.

Hace falta HTTPS (o `localhost`): sin contexto seguro el navegador no da acceso
al microfono. Un archivo abierto con doble clic desde el escritorio, con una URL
`file://`, no vale para grabar.

Cuando se cambie el estudio hay que volver a generar este archivo:

```bash
npm run build:studio
cp dist-studio/estudio.html docs/estudio/index.html
```
