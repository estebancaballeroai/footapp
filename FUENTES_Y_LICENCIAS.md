# Fuentes y licencias — Fútbol Pulse v1.7

## Wikimedia Commons / Wikidata

El nuevo módulo de fotografías hace la siguiente cadena de verificación:

1. Busca nombre en Wikidata, con comprobación de denominación y descripción correspondiente a jugador, club o estadio.
2. Si la entidad tiene una imagen declarada (propiedad P18), consulta `imageinfo` y `extmetadata` en Wikimedia Commons.
3. Comprueba **la licencia del archivo específico**. Se aceptan CC0, dominio público, CC BY 1.0–4.0 y CC BY-SA 1.0–4.0. Se rechazan licencias NC, ND, sin identificar o no permitidas.
4. Muestra un enlace a la página del archivo en Commons, autor y licencia. Las imágenes no se incorporan al ZIP. Si no se puede verificar la imagen o no hay conexión, se muestra un avatar.

Los permisos de reproducción y los créditos dependen de cada archivo, no de Wikimedia Commons como conjunto. Algunas imágenes podrían imponer requisitos de atribución adicionales; debe revisarse la página del archivo para usos posteriores.

Referencias oficiales:
- https://www.mediawiki.org/wiki/Wikimedia_APIs/Content_reuse
- https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy
- https://attribution.wikimedia.org/attribution-signals/license.html
- https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia

## Resultados y fichas deportivas

- ESPN, resultados, clasificaciones, partidos, alineaciones (API pública no oficial; sin garantía de uso continuado ni de cobertura): https://www.espn.com/soccer/
- TheSportsDB, información institucional, fotos no reutilizadas automáticamente y plantillas parciales: https://www.thesportsdb.com/docs_api_guide.php
- OpenLigaDB, resultados comunitarios para Alemania: https://www.openligadb.de/
- Wikipedia, historia y enlaces con aviso de cobertura: https://es.wikipedia.org/

## Privacidad y uso entre amigos

No hay cuentas ni seguimiento de usuarios por Fútbol Pulse. Las llamadas externas al abrir el sitio pueden ser visibles para los proveedores. Las fotografías se consultan bajo demanda. Antes de difundir públicamente la app, comprueba los términos de los datos deportivos, logos y marcas.
