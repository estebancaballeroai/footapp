# Guía: instalar Fútbol Pulse 1.7.1 Hybrid Data en GitHub

## La vía más sencilla desde el navegador

1. Entra en tu repositorio actual de Fútbol Pulse. Si necesitas volver a la versión anterior, conserva una copia del ZIP 1.7.
2. Del ZIP **Sitio**, descomprime y sube los archivos directamente en la raíz del repositorio (`index.html`, `app.js`, `pulse-hybrid.js`, `pulse-data.json`, `update_data.py`, CSS, iconos, etc.). Puedes utilizar **Add file → Upload files**; sustituye los antiguos.
3. Añade el workflow por separado: **Add file → Create new file** y escribe exactamente `.github/workflows/pulse-hybrid-pages.yml` en el campo de nombre. Pega el contenido del archivo `pulse-hybrid-pages.yml` suministrado con el paquete. Guarda en la rama principal (normalmente `main`; también se acepta `master`). GitHub crea las carpetas automáticamente al escribir `/`.
4. Abre **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**. Esta configuración es imprescindible porque las actualizaciones se publican mediante artefactos, sin hacer commits de resultados. El sitio público conservará normalmente la misma dirección.
5. Abre **Actions → Fútbol Pulse - datos compartidos y Pages → Run workflow → Run workflow**. Espera a que *prepare* y *deploy* aparezcan en verde. En el primer despliegue se genera `pulse-data.json` real.
6. Comprueba `https://TU-USUARIO.github.io/TU-REPO/pulse-data.json` (o `https://TU-USUARIO.github.io/pulse-data.json` si tu repo se llama `TU-USUARIO.github.io`). Debe contener `generatedAt` reciente y `counts` con valores positivos.
7. Abre Fútbol Pulse; bajo la cabecera aparecerá **«Datos compartidos · fecha y hora»**. Confirma también que los partidos en vivo se siguen actualizando.

## ¿Y si no funciona?

- **No aparece Run workflow:** comprueba que el archivo está exactamente en `.github/workflows/` y en la rama principal, y que GitHub Actions está permitido en **Settings → Actions → General**.
- **Error en prepare:** abre el log; puede ser ESPN (HTTP 400, 429, 403) o falta de acceso externo. No publiques un JSON de ceros como si fuera una tabla real.
- **Error en deploy:** verifica en **Settings → Pages** que Source sea **GitHub Actions**. El workflow incluye los permisos mínimos `contents: read`, `pages: write`, `id-token: write`; normalmente **no** necesitas dar permiso de escritura al contenido del repositorio.
- **El indicador dice «Modo directo»:** abre `pulse-data.json` en el sitio publicado, comprueba si contiene datos reales y espera unos segundos. La app sigue funcionando con sus fuentes habituales.
- **El sitio anterior desaparece:** revisa Actions → últimas ejecuciones. Si deseas revertir, en Settings → Pages selecciona la fuente anterior y vuelve a publicar el ZIP anterior.

## Actualizaciones y coste

Cada seis horas, un workflow programado intenta generar nuevos datos (calendario y tablas; no goles en vivo). Las ejecuciones programadas se realizan en UTC y pueden retrasarse. GitHub deshabilita periódicamente los cron de repositorios públicos que llevan 60 días sin actividad. Los límites de GitHub y de ESPN siguen aplicándose.

No necesitas una cuenta Cloudflare, ningún token personalizado ni activar «Read and write permissions» general en Settings → Actions. Si el repositorio pertenece a una organización con políticas especiales, podrían existir otras restricciones.
