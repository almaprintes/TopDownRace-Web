# TopDownRace-Web

Web oficial: https://topdownrace.almaprint.es

## Récords públicos

La sección `#records` muestra hasta 10 pilotos por circuito (posición, apodo,
mejor vuelta), respetando empates y sin datos de fantasmas ni IDs de usuario.
Mantiene los idiomas ES/EN/IT.

### Flujo y consumo

1. Supabase Cron ejecuta `tdr_web_private.refresh_leaderboards()` cada cinco
   minutos. La función es SECURITY INVOKER, privada, ejecutada como postgres.
   No cambia las tablas, las políticas ni las funciones usadas por el juego.
2. Guarda una única fila en `public.web_leaderboard_snapshot`, con RLS de
   lectura pública. No se permiten escrituras desde anon/authenticated.
3. `.github/workflows/rankings.yml` lee SOLO esa fila cada cinco minutos
   (programación al minuto 2, 7, 12, etc.). Usa una clave **publishable**,
   intencionadamente pública; nunca una clave service_role.
4. Publica `leaderboards.json` y `usage.json` en la rama `rankings-data`.
   El navegador descarga la copia estática de raw.githubusercontent.com.
   No crea usuarios, no consulta Supabase y no descarga fantasmas.
5. La página solo solicita los datos al acercarse a la sección y mientras
   está visible, como máximo una vez por cinco minutos por pestaña.
   Cambiar de circuito usa los datos ya descargados.

La programación de GitHub no garantiza una ejecución puntual; puede sufrir
retrasos y su CDN puede añadir unos minutos. La interfaz muestra la hora de
generación real y avisa a partir de 20 minutos de antigüedad. Si falla una
exportación conserva la última copia válida. No se promete tiempo real.
Los workflows programados de repositorios públicos pueden desactivarse tras
60 días sin actividad; el seguimiento detecta copias obsoletas.

### Seguimiento

- `rankings-data:usage.json`: peticiones del exportador, éxitos, fallos,
  bytes de los cuerpos de respuesta por día, última actualización y
  proyección de 30 días a 8.640 consultas. Retención: 90 días.
- `tdr_web_private.refresh_daily`: número de regeneraciones, tiempo total
  de ejecución medido en milisegundos y tamaño máximo de la copia por día.
  Retención: 90 días. Acceso solo administrativo.
- Logs de Cron de estos dos trabajos: retención 7 días.
- Ejecuciones de GitHub Actions: comprobar `Rankings checks and refresh`.

Los bytes del exportador **no son el consumo total facturado**: no incluyen
cabeceras, consultas ajenas al exportador, el juego ni otros servicios.
El total oficial se comprueba en Usage/Egress de Supabase. Un visitante
que consulte por su cuenta la API pública tampoco aparece en usage.json.

Umbrales iniciales de seguimiento: copia >30 minutos, fallos nuevos,
proyección del exportador >100 MB/30 días o incremento >2x respecto a la
línea base. Avisar también si el total oficial supera el 70% de la cuota,
si esa métrica está disponible; no inferirlo a partir del tamaño de la BD.

Primera medición (2026-10-07): 4 circuitos, 16 tiempos, copia JSONB de
1.168 bytes, primera regeneración 22,245 ms. El tamaño de la respuesta HTTP
real lo mide el exportador, por lo que puede variar respecto a esa cifra.

### Validación y mantenimiento

```sh
node --check assets/rankings.js
node --test tests/*.test.mjs
```

`ops/web-rankings.sql` documenta el SQL de la migración remota
`add_public_web_leaderboard_snapshot`, ya aplicada en
`juukbnkjboiazqggqcyv`. No volver a ejecutarla a ciegas.
El cron de Supabase actualiza la copia; el workflow de GitHub la exporta.
El deploy habitual de GitHub Pages sigue usando main.

Para pausar: desactivar el workflow y los jobs `tdr-web-rankings-refresh`
y `tdr-web-rankings-cleanup` en Cron. No borrar registros del juego.
