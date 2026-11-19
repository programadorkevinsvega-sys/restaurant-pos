# N09-F1.6 — Atribución multisucursal de mesas y reservas

## Estado de integración y despliegue

- PR #15: [N09-F1.6 — Atribución multisucursal de mesas y reservas](https://github.com/programadorkevinsvega-sys/restaurant-pos/pull/15), fusionado el 19 de noviembre de 2026 a las 04:32:23 UTC.
- Merge commit en `main`: `f46873732adfe4ad5f0263228f3573486681a58c`.
- CI #53: [ejecución 44458796849](https://github.com/programadorkevinsvega-sys/restaurant-pos/actions/runs/44458796849), backend/frontend/build y PostgreSQL 16/17 aprobados.
- CI #54: [ejecución 44459010838](https://github.com/programadorkevinsvega-sys/restaurant-pos/actions/runs/44459010838), todos los jobs aprobados sobre el HEAD integrado del PR.
- Producción: [ejecución 44459019271](https://github.com/programadorkevinsvega-sys/restaurant-pos/actions/runs/44459019271), finalizada correctamente. Los jobs `Verify and build` y `Deploy to application VM` aprobaron sobre el merge commit.
- La migración 011 fue aplicada por el despliegue automatizado en la VM. No se ejecutó backfill de mesas ni reservas históricas.

## Objetivo

Cada mesa y reserva nueva pertenece a una organización y a una sucursal concreta. Las operaciones solo pueden consultar o modificar recursos de la sucursal activa a la que el usuario autenticado esté asignado. Una reserva no puede apuntar a una mesa de otra sucursal.

La sucursal enviada mediante `X-Active-Branch-ID` es contexto solicitado, no una prueba de autorización. El backend obtiene el actor de la sesión y PostgreSQL vuelve a comprobar su asignación.

## Alcance implementado

### Mesas

- Las mesas nuevas guardan `organization_id`, `branch_id`, `created_by_user_id` y `updated_by_user_id`.
- El número de mesa es único dentro de una sucursal, no globalmente. Dos sucursales pueden tener una mesa con el mismo número.
- La unicidad se comprueba en PostgreSQL, también ante intentos concurrentes.
- Listado, creación y actualización de estado operan exclusivamente sobre la sucursal activa y el actor asignado.
- Al actualizar `current_order_id`, PostgreSQL comprueba que el pedido pertenezca a la misma organización y sucursal que la mesa.

### Reservas

- Las reservas nuevas guardan organización, sucursal y actor creador/actualizador.
- Listado, creación y cambio de estado quedan limitados a la sucursal activa y a la asignación del actor.
- Una clave foránea compuesta garantiza que la mesa referenciada pertenece a la misma organización y sucursal de la reserva.
- Las funciones PostgreSQL rechazan reservas cuya mesa no pertenezca a la sucursal solicitada.

No se definen aquí reglas nuevas para duración de reservas, anticipos, cancelaciones, no-show, tolerancias, capacidad dinámica, solapamientos, doble reserva o bloqueo automático de mesas. Esas políticas siguen sujetas a las decisiones funcionales del dominio de reservas.

## Seguridad y persistencia

Migración: `011_branch_scoped_tables_and_reservations.sql`.

- Los campos de contexto son nulos únicamente para los registros históricos que existían sin atribución. Los registros nuevos se crean mediante funciones de PostgreSQL que completan el contexto.
- El rol `restaurant_pos_app` no tiene lectura ni DML directo sobre `public.tables` o `public.reservations`. Solo puede invocar las funciones de lectura/escritura autorizadas.
- Las funciones `SECURITY DEFINER` usan referencias calificadas al esquema `public` y un `search_path` limitado a `pg_catalog`.
- Cada función comprueba que el usuario esté activo y asignado a la sucursal. Las escrituras también comprueban que la sucursal esté en estado `active`.
- Las funciones de lectura permiten consultar datos históricos atribuidos de sucursales suspendidas o cerradas, mientras el usuario conserve la asignación. No habilitan escritura en esos estados.
- Las operaciones de escritura bloquean la fila de sucursal en modo compartido para serializarse correctamente con cambios de ciclo de vida; también bloquean la asignación/actor durante la validación.
- Las respuestas de recursos ajenos a la sucursal activa no revelan si existen en otra sucursal; se presentan como no encontrados.
- Los cambios de estado actualizan `updated_by_user_id` y `updated_at`. No se crea todavía un historial general de eventos organizacionales (N09-F1.5).

## Datos históricos

Las mesas y reservas existentes antes de esta migración permanecen con `organization_id`, `branch_id`, `created_by_user_id` y `updated_by_user_id` en `NULL`. No se inventa una relación con una sucursal a partir del nombre, ubicación, pedido relacionado u otra inferencia.

Los endpoints operativos por sucursal no incluyen esos registros sin atribución. Los registros permanecen almacenados; asignarlos posteriormente requerirá un proceso explícito, revisado y autorizado, con evidencia suficiente para decidir su sucursal. Esta fase no ofrece una operación de backfill.

## Contratos HTTP conservados

| Método | Ruta | Comportamiento |
|---|---|---|
| GET | `/api/tables` | Lista las mesas de la sucursal activa. |
| POST | `/api/tables` | Crea una mesa en la sucursal activa. |
| PUT | `/api/tables/:id/status` | Actualiza una mesa de la sucursal activa. |
| GET | `/api/reservations` | Lista reservas de la sucursal activa; conserva filtros actuales de fecha/estado. |
| POST | `/api/reservations` | Crea una reserva ligada a una mesa de la misma sucursal. |
| PUT | `/api/reservations/:id/status` | Actualiza una reserva de la sucursal activa. |

El cliente HTTP continúa enviando el encabezado de sucursal activa existente. No se agrega un identificador de sucursal al cuerpo de creación: el backend lo toma del contexto autenticado.

## Pruebas incorporadas

- Contexto de sucursal obligatorio en todos los casos de uso de mesas y reservas.
- Llamadas del repositorio dirigidas a funciones PostgreSQL con el identificador del actor y la sucursal.
- Privilegios del rol runtime: sin SELECT, INSERT, UPDATE ni DELETE directo en las tablas.
- Ejecución permitida únicamente de las funciones de lectura/escritura con alcance.
- Usuario asignado a dos sucursales: consultas separadas y números de mesa repetibles entre sucursales.
- Rechazo de número de mesa duplicado dentro de la misma sucursal, incluidos intentos concurrentes.
- Rechazo de reserva que referencia una mesa de otra sucursal.
- Rechazo de cambios de estado sobre una mesa o reserva perteneciente a otra sucursal.
- Rechazo del usuario sin asignación a la sucursal.
- Lectura histórica permitida en sucursal suspendida y escrituras bloqueadas.
- Registros históricos sin contexto excluidos de listados por sucursal y conservados sin backfill.

## Límites expresos: decisiones aún pendientes

- `public.settings` no se modifica. Continúa con su comportamiento global actual.
- No se define precedencia, herencia ni excepción de configuración entre organización, entidad legal y sucursal (D0-10).
- La moneda declarada en `branches.currency_code` es informativa para esta fase. No cambia precios, ventas, impuestos, pagos, redondeos, conversión, tipo de cambio ni contabilidad.
- Moneda funcional por entidad legal, monedas de transacción permitidas y snapshots de conversión siguen pendientes de aprobación (D0-08 y línea financiera).
- No se implementa matriz RBAC granular por recurso/acción/ámbito. Las rutas conservan los roles globales existentes y PostgreSQL exige asignación a la sucursal; esto no sustituye N09-F3.3.
- No se implementan delegación temporal ni segregación de funciones.
- No se implementa historial general de cambios organizacionales (N09-F1.5).
- Los filtros por fecha de reservas conservan el rango UTC actual; no se aplican todavía la zona horaria local ni el calendario de la sucursal a los cortes del módulo de reservas.
- No se agregan reglas fiscales, facturación electrónica, contabilización por entidad legal ni atribución retroactiva de operaciones.

## Cierre y operación

El cierre de esta fase requiere que CI complete backend/frontend/build y las integraciones PostgreSQL 16 y 17 sobre el HEAD exacto del PR, además de revisión de migración y documentación.

La migración se desarrolla y valida en CI/entornos aislados. La aprobación del PR no autoriza por sí sola migrarla en producción ni ejecutar backfills. Siguen vigentes las puertas de Fase 0 para inspección de PostgreSQL productivo y restauración aislada antes de cambios de esquema/datos productivos.
