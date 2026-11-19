# N09-F1.4 — Dirección y configuración local de sucursales

## Objetivo

Registrar la información física y operativa propia de cada establecimiento: dirección de operación, zona horaria, moneda declarada, horario semanal y excepciones de calendario. Esta información pertenece a la sucursal y no sustituye los datos corporativos ni el domicilio fiscal de las entidades legales asociadas.

## Alcance implementado en esta fase

### Dirección operativa

Cada sucursal puede mantener una dirección estructurada con:

- Dirección principal y complemento.
- Ciudad/localidad.
- Departamento, estado o región administrativa.
- Código postal.
- País mediante código ISO alpha-2.

La dirección operativa se almacena en `branches.operational_address`. No se copia, infiere ni sincroniza con `legal_entities.registered_address`.

### Zona horaria y moneda local

- `time_zone`: identificador IANA validado contra `pg_timezone_names` (por ejemplo, `America/Bogota`).
- `currency_code`: código alfabético de tres letras, normalizado a mayúsculas (por ejemplo, `COP`).

Los campos son explícitos y pueden permanecer sin configurar. No se infieren a partir del domicilio de la entidad legal ni de la instalación.

**Límite funcional deliberado:** esta fase registra los parámetros locales, pero no cambia el cálculo de importes, precios, impuestos, comprobantes, moneda funcional/contable, conversiones, tipo de cambio, precedencia entre entidad legal y sucursal ni reglas de corte. Esas decisiones siguen bajo D0-08 y la línea financiera correspondiente. La validación de moneda en esta fase verifica el formato de tres letras; no constituye por sí sola una validación exhaustiva contra un catálogo ISO 4217 versionado.

### Horario semanal

Se almacena una colección de intervalos ligados al día ISO:

- 1 = lunes, ..., 7 = domingo.
- Formato de hora local de 24 horas `HH:MM`.
- Se permiten varios intervalos por día (por ejemplo, servicio de almuerzo y cena).
- Se permite indicar que el cierre sucede al día siguiente.
- No se permiten intervalos inválidos ni superpuestos, incluso en el límite semanal domingo/lunes.
- Un arreglo vacío significa que el horario no está definido; no significa que la sucursal esté cerrada.

Los horarios son horas de pared de la zona horaria declarada por la sucursal. No se convierten todavía en disponibilidad transaccional ni en reglas de apertura/cierre contable.

### Excepciones por fecha local

La sucursal puede registrar una excepción para una fecha concreta:

- `closed`: cierre extraordinario, sin intervalos.
- `special_hours`: uno o varios intervalos horarios especiales, que reemplazan el horario semanal para esa fecha.
- Cada excepción exige un motivo y es única por sucursal/fecha.
- Las fechas se almacenan como fechas locales, sin conversión UTC automática.
- El calendario requiere zona horaria configurada.
- No se importan festivos nacionales, regionales ni religiosos de forma automática.

Las excepciones pueden consultarse en un rango máximo de 367 fechas inclusivas. La administración visualiza los próximos 90 días; la API acepta rangos acotados.

## Persistencia, autorización y auditoría

Migración: `010_branch_local_configuration_and_calendar.sql`.

- Los campos locales quedan en `public.branches`.
- Las excepciones se almacenan en `public.branch_calendar_exceptions`.
- Los cambios de configuración y calendario generan eventos en `public.branch_local_configuration_events`, con actor, fecha y snapshots anterior/nuevo cuando aplican.
- El rol `restaurant_pos_app` solo dispone de lectura directa sobre las tablas nuevas. No puede insertar, modificar ni borrar excepciones o eventos de auditoría.
- Las escrituras se ejecutan mediante funciones PostgreSQL `SECURITY DEFINER` que vuelven a comprobar al propietario corporativo activo, la pertenencia de la sucursal y su estado.
- La autorización HTTP conserva provisionalmente el control de propietario corporativo ya utilizado en N09-F1.2/F1.3. No sustituye la matriz RBAC por ámbito de N09-F3.
- Las escrituras de configuración y calendario solo se admiten cuando la sucursal está activa. Suspendidas y cerradas permiten consulta histórica, pero no cambios.

## Contratos HTTP

| Método | Ruta | Propósito |
|---|---|---|
| PUT | `/api/branches/:branchId/configuration` | Reemplaza la configuración local validada de la sucursal. |
| GET | `/api/branches/:branchId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | Consulta excepciones dentro del rango local. |
| PUT | `/api/branches/:branchId/calendar/:localDate` | Crea o actualiza la excepción de una fecha. |
| DELETE | `/api/branches/:branchId/calendar/:localDate` | Elimina una excepción existente. |

Los contratos rechazan campos desconocidos, fechas inválidas, horas mal formadas, monedas con formato incorrecto, intervalos vacíos/solapados y rangos de calendario superiores al límite. PostgreSQL repite las validaciones relevantes para proteger la integridad aunque se invoquen las funciones fuera de la API.

## Límites y trabajo posterior

Esta fase **no** implementa:

- Precedencia/herencia de parámetros corporativos, de entidad legal y sucursal (D0-10).
- Matriz RBAC granular y permisos delegados (N09-F3).
- Uso de la moneda local para precios, ventas, impuestos, pagos, contabilidad o facturación.
- Reglas de corte diario, turnos, cajas o cierres operativos.
- Importación automática de festivos ni fuentes externas de calendario.
- Asociación retroactiva o aislamiento de mesas y reservas. Esas tablas aún requieren su propia atribución por sucursal.
- Historial organizacional general de N09-F1.5; los eventos aquí cubren únicamente cambios de configuración local y excepciones de calendario.
- Migración, backfill, verificación o despliegue sobre la base productiva.

## Criterios de cierre

La fase solo se considera cerrada al completar:

1. Migración desde base vacía y ejecución idempotente en PostgreSQL 16 y 17.
2. Pruebas de permisos del rol runtime (lectura sí; DML directo no).
3. Pruebas de validación de dirección, zona horaria, moneda y horarios, incluidos solapamientos dentro del día y entre domingo/lunes.
4. Pruebas de autorización propietario/no propietario, estado activo/no activo, inserción/actualización/eliminación de excepciones y auditoría.
5. Typecheck, lint, build y suite backend/frontend de CI.
6. Actualización de esta documentación y del roadmap con commit y ejecuciones CI exactas.

La aprobación de CI no autoriza aplicar la migración en producción; siguen vigentes las puertas de Fase 0.
