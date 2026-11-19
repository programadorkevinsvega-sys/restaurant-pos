# N09-F1.3 — Alta, apertura, suspensión y cierre de sucursales

**Estado:** En desarrollo; la aceptación final depende de CI y revisión del PR.  
**Módulo:** N09 — Gestión multisucursal  
**Rama:** `feat/fase-1-3-ciclo-vida-sucursales`

## 1. Objetivo

Completar la identidad mínima de sucursal incorporada en N09-F1.2 con un ciclo de vida operativo. La administración de estados queda a cargo del propietario corporativo registrado hasta que se implemente RBAC por ámbito.

## 2. Regla funcional confirmada

Una sucursal suspendida o cerrada no admite nuevas operaciones. Sus registros ya atribuidos siguen disponibles para consulta histórica y no se eliminan.

La aplicación se implementa en esta fase para pedidos atribuidos a una sucursal y sus detalles relacionados (`order_items` y `delivery_info`). La base de datos impide INSERT, UPDATE y DELETE de esos registros mientras la sucursal esté suspendida o cerrada. Los endpoints de lectura no filtran por estado de sucursal.

**Límite importante:** mesas y reservas todavía no guardan `branch_id` en el modelo actual. No se les asigna una sucursal por inferencia y esta fase no pretende aislarlas. Esa integración requiere su propio alcance y pruebas dentro de N09. Informes contables, caja y otros módulos tampoco quedan cubiertos automáticamente por el estado de sucursal.

## 3. Estados y transiciones

| Estado | Significado |
|---|---|
| `active` | Sucursal operativa; permite nuevas operaciones |
| `suspended` | Operación temporalmente detenida; registros atribuidos en consulta |
| `closed` | Cierre definitivo; registros atribuidos en consulta |

Transiciones incluidas:

- Activa → suspendida.
- Suspendida → activa.
- Activa → cerrada.
- Suspendida → cerrada.

En esta entrega, el cierre (`closed`) es terminal. No existe transición de cerrada a activa; una reapertura posterior requeriría un flujo explícito distinto. Una transición al mismo estado devuelve `UNCHANGED` y no duplica el evento de auditoría.

Las sucursales existentes y nuevas se inicializan como `active`. No se infiere retrospectivamente que una sucursal histórica estuviera suspendida o cerrada.

## 4. Contratos HTTP

- `GET /api/branches`: incluye estado y fecha de última transición.
- `GET /api/branches/available`: incluye sucursales asignadas aunque estén suspendidas o cerradas, para permitir cambiar el ámbito y consultar pedidos históricos.
- `PUT /api/branches/:branchId/status`: cambia estado. Body estricto: `{ "status": "active" | "suspended" | "closed" }`.
- `GET /api/branches/:branchId/lifecycle`: historial de cambios, disponible únicamente al propietario corporativo.

La administración de estados sigue exigiendo el propietario corporativo de N09-F1.1. El rol heredado `admin` por sí mismo no autoriza estas acciones.

## 5. Integridad y auditoría PostgreSQL

La migración `009_branch_lifecycle_and_read_only_state.sql`:

- Añade estado, fecha de transición, fecha de cierre y actor del cierre.
- Crea `branch_lifecycle_events`, con estado anterior/nuevo, actor e instante. El alta de sucursales también deja un evento inicial. Las sucursales existentes reciben un evento de línea base como activas usando su actor y fecha de creación originales.
- Retira escritura directa del estado desde el rol runtime. Los cambios pasan por `change_branch_status`, función `SECURITY DEFINER` que valida al propietario activo y bloquea la fila de sucursal.
- Usa bloqueos de fila compatibles (`FOR SHARE` para las operaciones atribuidas, `FOR UPDATE` para cambiar estado) para serializar suspensión/cierre con escrituras concurrentes: una operación que obtiene primero el bloqueo termina antes del cambio; una que llega después es rechazada.
- Bloquea cambios de identidad de sucursal y asociaciones de entidad legal mientras está inactiva.
- Bloquea escrituras y borrados de pedidos y de sus detalles cuando la sucursal no está activa.
- Mantiene las consultas históricas de pedidos/entregas sin excluir sucursales no activas.

Las filas históricas que no tienen `branch_id` permanecen sin atribución; no se completan por inferencia.

## 6. Interfaz

Configuración muestra el estado actual, acciones válidas para la transición, fecha de cierre y los cinco eventos más recientes. El selector de sucursal sigue permitiendo elegir una sucursal suspendida/cerrada, identifica el estado y conserva la consulta histórica. El carrito impide registrar pedidos y explica que el ámbito está en solo lectura.

## 7. Fuera de alcance

- Dirección, datos del local, horarios, calendario, zona horaria y parámetros locales (N09-F1.4).
- Historial general de cambios de datos organizacionales (N09-F1.5); este alcance audita solo transiciones de estado.
- Roles y permisos corporativos/locales granulares (N09-F3.1/F3.3).
- Atribución de mesas, reservas, caja, inventario y contabilidad.
- Asignación retrospectiva de registros históricos sin contexto.
- Fiscalidad, moneda, facturación electrónica y decisiones contables.
- Migraciones, backfills, despliegue o cambios de producción.

## 8. Matriz requisito → prueba → CI

| Requisito | Evidencia automatizada |
|---|---|
| Solo propietario puede cambiar estado | Rechazo de actor operador/no propietario |
| Estados válidos y transiciones | Cambio active → suspended → active → closed |
| Cierre terminal | Rechazo de reactivación |
| Auditoría inmutable | Evento de creación y evento por cada cambio real |
| Idempotencia | Repetir estado devuelve UNCHANGED sin evento |
| Bloqueo de operaciones | Rechazo de crear/actualizar/borrar pedido y modificar detalles |
| Consulta histórica | Lectura de pedidos después de suspender/cerrar |
| Concurrencia | Lock timeout demuestra espera del cambio de estado mientras una operación sostiene FOR SHARE |
| Privilegios | Runtime lee historial, pero no inserta/actualiza/elimina eventos ni modifica estado directamente |
| Reproducibilidad | Migración desde base vacía e idempotencia en PostgreSQL 16 y 17 |

La fase solo se declara completada cuando todos los jobs del PR pasan y el roadmap refleja el HEAD validado. La integración de código en `main` no autoriza migraciones ni despliegue productivo; se mantienen las puertas de inspección y restore de Fase 0.
