# Pruebas de navegador, E2E y aceptación visual

## Propósito

Esta suite comprueba la navegación real en Chromium, completa flujos de usuario contra el backend desplegado en un entorno CI aislado y adjunta capturas de cada requisito cubierto. No sustituye las pruebas unitarias, las pruebas PostgreSQL ni la aceptación visual por una persona responsable.

## Ejecución

El workflow `.github/workflows/ci-pr.yml` crea una base PostgreSQL efímera, aplica todas las migraciones, carga fixtures exclusivos de E2E, inicia API y frontend y ejecuta Playwright con Chromium.

La suite instala una versión fijada de `@playwright/test` solo dentro del job (actualmente fijada en `1.65.1`). No añade dependencias de ejecución al producto ni altera los lockfiles de backend/frontend.

Credenciales de prueba:
- Usuario: `e2e.owner@chili.test`
- Contraseña: la variable efímera `E2E_PASSWORD` del job.
- Sucursal: `E2E-BOG`.

Estas credenciales y fixtures solo existen en el PostgreSQL desechable del workflow. No se deben copiar a producción.

## Matriz de aceptación cubierta

| Requisito | Prueba de navegador | Evidencia automática | Revisión humana |
|---|---|---|---|
| N09-F1.1 | Perfil corporativo y campos | Captura adjunta al test | Verificar lectura, edición y permisos |
| N09-F1.2 | Entidad legal, NIT, contacto y domicilio | Captura adjunta al test | Verificar creación/edición/asociación N:M |
| N09-F1.3 | Suspender y reactivar sucursal | Captura adjunta al test | Verificar cierre terminal y modo histórico |
| N09-F1.4 | Dirección, zona horaria, moneda y calendario | Captura adjunta al test | Verificar guardar, consultar y eliminar excepción |
| N09-F1.5 | Historial, actor y snapshots | Captura adjunta al test | Verificar filtros, paginación y enmascaramiento |
| N09-F1.6 | Mesas y creación/consulta de reserva | Captura adjunta al test | Verificar aislamiento, lectura histórica y permisos |
| N09-F2.1 | Catálogo maestro y disponibilidad por sucursal | Captura adjunta al test | Verificar exclusión local, restauración, aislamiento entre sucursales y bloqueo de pedidos con producto excluido |

## Evidencia visual

Cada caso adjunta una captura completa de la pantalla obtenida después de ejecutar el flujo. El job publica `playwright-report` y `test-results` como artefactos aun cuando falle la suite.

Una captura demuestra qué se renderizó durante la ejecución; por sí sola no demuestra calidad visual. La aceptación de cada requisito requiere que la persona revisora confirme, sobre esas capturas y la aplicación de destino:
1. La información y acciones requeridas están presentes.
2. No hay campos cortados, superpuestos, ilegibles ni fuera del viewport.
3. Estados de carga, vacío, error, solo lectura y éxito son comprensibles.
4. Los permisos y acciones disponibles corresponden al actor y sucursal activos.
5. El flujo se puede completar sin usar endpoints manuales ni modificar datos fuera de la interfaz.

## Reglas para declarar una subfase completada

- Todas las pruebas automatizadas del requisito pasan.
- La captura de evidencia correspondiente se inspecciona y registra como aceptada.
- Los casos negativos, de aislamiento y permisos del backend siguen cubiertos por pruebas unitarias/PostgreSQL.
- Se verifica la versión desplegada por separado. Un CI verde o un health check no equivalen a aceptación visual.
- No se acepta una subfase con un test omitido, marcado `fixme`, con datos simulados o con una captura ausente.

## Alcance actual

La primera suite automatiza recorridos positivos de navegador y adjunta evidencia de N09-F1.1–F1.6. Los casos de cierre terminal, autorización negativa, aislamiento entre sucursales, errores, estados vacíos y regresión de formularios se mantienen como criterios adicionales que no quedan cubiertos por una captura positiva y deben agregarse antes de declarar F1 aceptada. F2.1 ya cuenta con un caso E2E inicial para excluir y reactivar un producto en una sucursal y verificar que desaparece del menú operativo; debe pasar CI y ampliarse con casos negativos de autorización/aislamiento antes de aceptar la subfase. Las pruebas de F2.2–F2.5 se incorporarán al mismo esquema junto con la implementación real de cada subfase; no se crean pruebas verdes para pantallas o comportamientos que todavía no existen.
