# N09-F1.5 — Historial de cambios organizacionales

## Estado de integración

- PR #17 fusionado en `main` mediante merge commit `a71e35de0077ce67784eb0b65df79afaaf0c7694`.
- CI #57 (`44460578759`) aprobó backend/frontend/build y PostgreSQL 16/17 sobre el HEAD final del PR.
- Despliegue productivo #44461054650: verificación/build y despliegue a la VM completados correctamente.
- La migración 012 se aplicó mediante el despliegue automatizado. No se realizó backfill de eventos organizacionales anteriores que carecían de actor o snapshots fiables.
- La alineación de permisos de la pestaña y la presentación legible de snapshots se incluyen en la corrección de cobertura frontend N09-F1.1–F1.6.

## Objetivo

Ofrecer al propietario corporativo una cronología verificable de los cambios que afectan la organización, sus entidades legales, la identidad de las sucursales y las relaciones explícitas entre sucursales y entidades legales.

Cada evento conserva actor, instante, recurso, acción y estado anterior/nuevo cuando corresponde. La consulta unificada reutiliza los registros históricos específicos ya creados por F1.3 y F1.4, sin copiarlos ni generar una segunda fuente de verdad.

## Cambios registrados por esta fase

- Perfil de organización: creación y cambios de nombre, nombre comercial, contacto, sitio web y domicilio principal.
- Entidades legales: creación y cambios de razón social, nombre comercial, jurisdicción/identificación tributaria, domicilio registrado y contacto.
- Identidad de sucursal: creación y cambios de código y nombre.
- Relaciones sucursal–entidad legal: asociación y desasociación explícitas.

Las instantáneas de identificadores tributarios guardan un valor enmascarado que conserva únicamente los últimos cuatro caracteres. Nunca se copia el NIT completo al historial. Las credenciales, contraseñas, cookies, tokens y secretos no forman parte de las instantáneas.

## Historiales existentes integrados

La consulta unificada también presenta, desde sus tablas originales:

- Cambios de estado activo/suspendido/cerrado de F1.3.
- Cambios de configuración local, horarios y excepciones de calendario de F1.4.

No se duplican esos eventos en `organization_change_events`. Los eventos iniciales de estado de una sucursal, que no representan una transición, no se vuelven a presentar como cambios de ciclo de vida; la creación de la sucursal queda registrada por el evento de identidad.

## Persistencia e integridad

Migración: `012_organization_change_history.sql`.

- `organization_change_events` es append-only. La base rechaza UPDATE y DELETE.
- El rol runtime no tiene SELECT ni DML directo sobre la tabla.
- Los registros se escriben mediante triggers de PostgreSQL asociados a las operaciones de dominio existentes, o en la función protegida que elimina una relación sucursal–entidad legal.
- La consulta se realiza mediante `list_organization_history`, una función `SECURITY DEFINER` con `search_path` limitado a `pg_catalog`.
- La función vuelve a comprobar que el actor sea el propietario corporativo registrado y esté activo.
- Los eventos incluyen el actor autenticado y el instante de base de datos; no se confía en un actor enviado por el frontend.
- La eliminación de una relación conserva su snapshot antes de completar la transacción. La clave de recurso queda acompañada por el identificador de sucursal.

## API

`GET /api/organization/history`

Filtros opcionales:

| Parámetro | Uso |
|---|---|
| `limit` | Cantidad de eventos por página; predeterminado 50, máximo 100 |
| `resource_type` | `organization`, `legal_entity`, `branch` o `branch_legal_entity` |
| `branch_id` | Limita la cronología a una sucursal |
| `before_at` + `before_id` | Cursor estable para continuar la página anterior; ambos son obligatorios en conjunto |

La respuesta incluye eventos ordenados de más reciente a más antiguo y `next_cursor` cuando existe otra página. Los recursos de otra organización no pueden consultarse desde esta instalación: la organización es el límite de propiedad del producto.

## Datos anteriores a la migración

No se hace backfill ni se reconstruye una cronología a partir de los valores actuales de las tablas. Los eventos nuevos de organización, entidades, identidad de sucursal y asociaciones empiezan a registrarse cuando se aplica esta migración.

Las bitácoras de ciclo de vida y configuración local anteriores se conservan y pueden aparecer en la cronología unificada porque ya contienen su propio actor, fecha y snapshots. No se infiere un actor o un estado previo inexistente.

## Interfaz

La pestaña **Historial** aparece dentro de Configuración. Permite filtrar por tipo de recurso y sucursal, consultar actor/fecha/acción, abrir los estados anterior/nuevo con nombres legibles y cargar la página siguiente. La interfaz solo refleja `permissions.can_update`; el backend y PostgreSQL validan al propietario en cada lectura.

## Fuera de alcance

- Historial de asignaciones de usuarios a sucursales, roles o permisos: línea N09-F3.2/F3.3/F3.5.
- Matriz RBAC, delegación, segregación de funciones y auditoría general de autorización.
- Historial de preferencias de `public.settings` o reglas de precedencia/herencia.
- Efectos comerciales, fiscales o contables de moneda, zona horaria y configuración.
- Reglas de ventas, pagos, reservas, inventario o contabilidad.
- Backfill o atribución retroactiva de registros que no tenían actor o contexto.
- Registro de lecturas de datos o trazas HTTP genéricas; esta fase registra cambios de dominio, no constituye una plataforma SIEM.

## Verificación requerida para el cierre

- Pruebas unitarias de autorización owner-only, filtros, cursor y traducción segura de errores de autorización.
- PostgreSQL real: migración desde base vacía e idempotencia, triggers de creación/actualización, asociaciones y desasociaciones, snapshots enmascarados, consulta unificada con historiales F1.3/F1.4, filtros y paginación.
- Cuenta runtime: sin acceso directo a la tabla central de historial; solo ejecución de la función de consulta.
- Append-only: UPDATE y DELETE rechazados en PostgreSQL.
- CI completa en PostgreSQL 16 y 17, backend/frontend/build, tipos y lint.
- Revisión de roadmap y evidencia de despliegue por separado. La aprobación del PR no autoriza por sí misma aplicar migraciones o desplegar en producción.
