# Fútbol Pulse 1.7.1 · pruebas — octubre 2026

## Verificado con pruebas automatizadas (sin llamadas reales a ESPN)

- `update_data.py`: 40 peticiones simuladas válidas producen 10 tablas, 10 directorios y 20 meses de calendario de diez ligas.
- Fallos parciales: veinte errores HTTP 400 simulados en el fixture no se traducen en partidos inventados; se registran como advertencias.
- Archivo YAML: parseado, con permisos mínimos para desplegar Pages desde Actions.
- JavaScript: comprobación de sintaxis de `app.js`, `community.js` y `pulse-hybrid.js`.
- Browser (Chromium): 320, 360, 390, 430 y 800 px, sin errores JavaScript ni desplazamiento horizontal.
- Navegación: Partidos, Fixture, búsqueda, fichas de clubes y fotos acreditadas, compartir encuentro, campo de alineaciones y reintento tras caída.
- Modo híbrido: lectura de tabla simulada, rechazo de datos en vivo desde la caché y estado visible de la caché.

## Requiere verificación en el sitio real

- Que GitHub Actions acceda a la API de ESPN desde los servidores de GitHub, sin bloqueo por proveedor.
- Que GitHub Pages publique el artefacto tras cambiar la fuente a `GitHub Actions`.
- Que `pulse-data.json` tenga `generatedAt` actual y al menos un elemento en `counts`.
- Que la app refresque resultados reales durante partidos en vivo y no muestre un estado de caché como directo.
- Que el workflow programado se ejecute (GitHub puede retrasarlo).

Estas pruebas automatizadas **no equivalen** a un despliegue real ni garantizan disponibilidad del proveedor gratuito.
