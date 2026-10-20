# Fútbol Pulse 1.7.1 · Hybrid Data — octubre 2026

Aplicación móvil y PWA sin registro ni pago. Se conserva la estética Premium Nocturne Club, junto con las funciones de la 1.7 Community.

## Arquitectura

- **Directo:** el móvil sigue consultando ESPN y OpenLigaDB para los marcadores por día y las alertas mientras la app está abierta. **Nunca** se usa el JSON compartido para sustituir estos resultados.
- **Caché común:** GitHub Actions obtiene tablas, directorios de clubes y fixture mensual de diez competiciones cada seis horas aproximadamente; genera `pulse-data.json` y despliega el sitio en GitHub Pages mediante un artefacto. Si una API no ofrece datos válidos, no publica valores inventados.
- **Respaldo:** si el JSON no aparece o está caducado, el móvil consulta las fuentes como antes. Una copia de hasta siete días solo puede utilizarse como respaldo en caso de fallo de la API, y se etiqueta visualmente.
- **Fotos:** Wikimedia Commons sigue consultándose desde el móvil con revisión de licencias y créditos; no se descargan ni redistribuyen fotos en el JSON comunitario.
- **Sin claves privadas**, Cloudflare ni nuevos registros.

## Publicación

**Requiere un paso distinto respecto a versiones anteriores:** GitHub Pages debe publicar desde **GitHub Actions**, no desde la rama directamente. Consulta `GUIA_GITHUB.md`.

El archivo `.github/workflows/pulse-hybrid-pages.yml` es obligatorio para la actualización periódica. No puede situarse en la raíz.

## Limitaciones

ESPN no garantiza el servicio de acceso público ni las condiciones de reutilización de los datos para un sitio de terceros; comprueba sus términos antes de una distribución amplia. La caché no resuelve restricciones CORS de las consultas directas. La planificación de Actions puede retrasarse, suspenderse por inactividad o verse limitada por cuotas. Una caída total de fuentes cancela la nueva publicación y deja activo el sitio anterior.
