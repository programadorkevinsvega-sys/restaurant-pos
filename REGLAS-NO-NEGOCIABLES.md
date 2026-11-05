# Reglas no negociables del proyecto

Estas reglas aplican a todo el trabajo del proyecto: código, infraestructura,
documentación, pruebas y despliegues. No se omiten por rapidez, urgencia ni
porque una función todavía no esté disponible para clientes.

## 1. Ramas, pull requests y producción

- Nunca trabajar directamente en `main`: no hacer commits ni cambios de trabajo
  allí. Cada tarea se realiza en una rama nueva y aislada.
- Todo cambio entra a `main` mediante un pull request (PR). No se integra por
  fuera del PR.
- `main` representa exclusivamente la versión aprobada para producción. Solo se
  puede fusionar un PR cuando todas las validaciones requeridas de GitHub Actions
  hayan terminado correctamente y el cambio haya sido revisado.
- Si una validación falla, se corrige la causa. Está prohibido omitirla,
  deshabilitarla o declarar el PR listo ignorando el fallo.
- El despliegue a producción solo puede partir de un cambio integrado desde un
  PR que cumplió esas condiciones.

## 2. Cierre de fases

- No se inicia ni se da por comenzada una fase posterior mientras la fase
  actual no esté terminada al 100 % según sus criterios de salida.
- Una fase se considera cerrada únicamente cuando todo su alcance acordado está
  implementado o resuelto, las validaciones requeridas pasan y la documentación
  y evidencias correspondientes están actualizadas.
- No se cuentan como terminados los elementos pendientes, parcialmente
  implementados, sin probar, simulados como si fueran reales o anotados para
  resolver después.
- Si existe un bloqueo, se documenta y se resuelve antes de avanzar; no se
  rebaja silenciosamente el criterio de cierre.

## 3. Calidad desde el primer día

- Todo trabajo se diseña desde el inicio con estándar de producción:
  profesional, robusto, escalable, seguro, observable y mantenible a largo plazo.
- No se aceptan soluciones temporales, atajos, configuraciones inseguras ni
  comportamientos que solo sean válidos “por ahora” o “antes de producción”.
- Los cambios deben manejar explícitamente errores, concurrencia, recursos,
  apagado y recuperación cuando corresponda a su responsabilidad.
- Las pruebas y controles automáticos son parte de la implementación, no una
  tarea opcional posterior.

## 4. Errores claros y seguros

- No se devuelven errores genéricos cuando es posible identificar la causa.
  Los errores deben ser explícitos, útiles y coherentes con el contexto.
- El cliente recibe únicamente un mensaje claro y seguro, comprensible y
  accionable para el usuario. Nunca se envían al frontend stack traces,
  consultas, rutas internas, secretos, detalles de infraestructura ni mensajes
  crudos de dependencias.
- Los errores internos se conservan en el servidor con contexto técnico
  suficiente para diagnosticar y correlacionar el incidente, sin incluir datos
  sensibles.
- Los fallos no se ocultan: no se ignoran, no se convierten en éxito, no se
  reemplazan por valores por defecto engañosos y no se silencian con catches
  vacíos. Si una operación no puede completarse, se informa explícitamente.
- Cada límite entre sistema y usuario traduce los errores internos a respuestas
  seguras y documentadas; las pruebas cubren ambas representaciones.

## 5. Código completo; sin trabajo a medias

- No se integra lógica incompleta, stubs, funciones vacías ni flujos que aparenten
  funcionar sin cumplir el caso de uso.
- No se dejan `TODO`, `FIXME` ni comentarios equivalentes como sustituto de
  implementación acordada.
- No se deja código que silencie errores, omita validaciones, ignore resultados
  o falle sin una respuesta controlada.
- No se deja `panic` en el código de aplicación o producción. Los fallos se
  devuelven y manejan explícitamente; el arranque y el apagado informan errores
  con claridad y terminan de forma controlada cuando no se puede continuar.
- Si el alcance no puede completarse y verificarse, el cambio no se presenta
  como terminado ni se fusiona.

## 6. Privacidad y logs

- Nunca se registran secretos ni datos sensibles: contraseñas, tokens, cookies,
  claves, credenciales, datos completos de pago, documentos, teléfonos, correos,
  direcciones u otra información personal identificable.
- No se registran cuerpos completos de solicitudes/respuestas, objetos de
  usuario ni errores crudos de proveedores si pueden contener esos datos.
- Los logs usan campos estructurados y permitidos explícitamente; cualquier dato
  imprescindible debe minimizarse o enmascararse antes de registrarse.
- Los identificadores de correlación y traza pueden usarse para diagnóstico,
  pero no sustituyen la redacción de datos sensibles ni deben contener PII.
- Si una prueba, herramienta o incidente detecta datos sensibles en logs, se
  bloquea la integración/despliegue y se corrigen tanto la fuente como la
  retención o exposición del dato ya registrado.

## 7. Evidencia antes de integrar

- Cada PR declara qué validaciones ejecutó y sus resultados reales; nunca se
  afirma que una prueba, revisión o despliegue pasó si no se ejecutó y verificó.
- Los cambios deben incluir pruebas del comportamiento afectado y preservar los
  comportamientos existentes que no se hayan acordado modificar.
- Toda desviación de alcance o requisito se resuelve explícitamente antes de
  fusionar; no se oculta en comentarios, fallos tolerados ni tareas futuras.
