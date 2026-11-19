# Auditoría de cobertura funcional — N09-F1.1 a N09-F1.6

## Propósito

Esta matriz separa cuatro cosas que no deben confundirse: requisito funcional aprobado, persistencia/backend, contrato HTTP y experiencia frontend. Una ruta existente o un build correcto no demuestran por sí solos que el usuario pueda completar el flujo desde la aplicación.

La auditoría se limita a N09-F1.1–F1.6. No convierte en requisitos de estas fases las decisiones pendientes de configuración heredada, fiscalidad, moneda funcional, contabilidad, reglas avanzadas de reservas ni RBAC granular.

## Matriz de trazabilidad

| Fase | Requisito aprobado | Backend / persistencia | API | Frontend exigido | Estado de auditoría |
|---|---|---|---|---|---|
| F1.1 | Una organización por instalación; perfil corporativo con nombre, nombre comercial, contacto, web y sede; bootstrap atómico; solo propietario edita | Migración 006, funciones protegidas, actor y timestamps; propietario validado en caso de uso y PostgreSQL | GET, POST bootstrap y PATCH /organization | Formulario completo de alta/edición, lectura de todos los campos y permiso derivado del servidor | El formulario cubre los campos del contrato; sin brecha funcional confirmada en la revisión |
| F1.2 | Varias entidades legales; identificación por país/tipo/valor; domicilio/contacto; relación N:M sucursal-entidad; al menos una entidad por sucursal | Migración 007, claves compuestas, unicidad, funciones protegidas y bloqueo concurrente de última asociación | GET/POST/PUT legal-entities; GET/POST/PUT branches; POST/DELETE asociación legal | Alta/edición de todos los campos, consulta de contactos/domicilio y administración de asociaciones | Se amplía el resumen de entidad para mostrar contacto/domicilio sin entrar en edición |
| F1.3 | Estados active/suspended/closed; transiciones permitidas; cierre terminal; lecturas históricas; bloqueo de nuevas operaciones; historial de estados | Migración 009, eventos de ciclo de vida, bloqueos concurrentes y restricciones de escritura sobre recursos atribuidos | GET branches/available, PUT status, GET lifecycle | Estado, última transición/cierre, acciones válidas, confirmación del cierre, selector de sucursal y aviso de solo lectura | Se muestra explícitamente la fecha de última transición; mesas/reservas adoptan solo lectura en sucursales no activas |
| F1.4 | Dirección operativa, zona horaria IANA, moneda declarativa, intervalos semanales y excepciones por fecha local | Migración 010, validaciones y eventos de auditoría | PUT configuration; GET/PUT/DELETE calendar | Editor de cada campo, varios intervalos por día, cruce al día siguiente, excepciones cerradas/horario especial con motivo | Editor existente cubre los campos del contrato y limita el calendario visual a los próximos 90 días, según especificación |
| F1.5 | Historial unificado de organización, entidades, sucursales, asociaciones, ciclo de vida y configuración; snapshots tributarios enmascarados; paginación | Migración 012 append-only, triggers y función owner-only; reutiliza bitácoras F1.3/F1.4 | GET organization/history con filtros y cursor | Pestaña owner-only, tipo/sucursal, actor/fecha/acción, snapshots legibles y carga de más eventos | Se alinea el gate de UI con permissions.can_update y se presentan snapshots con etiquetas legibles |
| F1.6 | Mesas/reservas atribuidas a organización/sucursal/actor; aislamiento por sucursal; vínculo de reserva-mesa dentro de la misma sucursal; preservación de históricos sin backfill | Migración 011, funciones PostgreSQL protegidas, restricciones, locks y pruebas de dos sucursales/concurrencia | GET/POST tables; PUT table status (incluye current_order_id opcional); GET/POST reservations; PUT reservation status (filtros date/status) | Crear mesas, administrar estados permitidos, consultar pedido vinculado y vincular/quitar pedido; crear reservas con todos los campos y filtrar/actualizar todos los estados permitidos | Corrección frontend en curso: contratos HTTP, formularios, filtros, estados y consulta de pedido vinculado |

## Cobertura detallada por pantalla

### Organización — F1.1

- Los campos del perfil son `name`, `commercial_name`, `contact_email`, `contact_phone`, `website_url` y los seis componentes de `headquarters_address`.
- El frontend usa `permissions.can_update`; no calcula la propiedad a partir del rol global.

### Entidades legales y sucursales — F1.2/F1.3/F1.4

- La entidad legal captura razón social, nombre comercial, país, tipo/valor tributario, correo, teléfono y domicilio estructurado.
- La ficha de entidad presenta contactos y domicilio almacenados, además de razón social, identificación y número de sucursales.
- La sucursal ofrece identidad, asociaciones N:M, asignaciones de usuarios, ciclo de vida, configuración local y calendario.
- Suspender/cerrar no significa borrar datos. Las sucursales no activas permanecen seleccionables para consulta histórica; las escrituras se deshabilitan en la UI y continúan protegidas por backend/PostgreSQL.

### Historial — F1.5

- Los datos tributarios se presentan como devuelve el backend, con máscara aplicada en PostgreSQL.
- Los snapshots distinguen estado anterior, posterior y metadata; los nombres de campos se traducen para lectura humana.
- La interfaz no amplía permisos: API y PostgreSQL siguen siendo la autoridad.

### Mesas y reservas — F1.6

- Mesa: número/nombre máximo 30 caracteres y capacidad 1–100, alineados con Zod; estados `available`, `occupied`, `reserved`, `maintenance`; lectura de pedido vinculado y actualización de `current_order_id` (UUID o null) mediante el endpoint existente.
- Reserva: nombre, teléfono, correo, mesa, fecha/hora, personas 1–100 y notas; consulta mediante los filtros API `date` y `status`; actualización a cualquiera de los estados permitidos por el contrato: `confirmed`, `seated`, `completed`, `cancelled`, `no_show`.
- La pantalla no crea reglas de duración, solapamiento, anticipos, no-show, tolerancia ni bloqueo automático: F1.6 las excluye expresamente.
- Las mesas/reservas históricas sin `branch_id` no se atribuyen retroactivamente. No aparecen en el listado por sucursal y no se modifica su contexto.
- En sucursales suspendidas/cerradas la interfaz permite consulta, pero bloquea las acciones de escritura.

## Decisiones y límites que no son brechas de implementación

Se mantienen fuera de F1.1–F1.6, según los documentos de fase:

- Precedencia/herencia de `public.settings` entre organización, entidad legal y sucursal.
- Uso financiero/fiscal/contable de `currency_code`, monedas transaccionales, moneda funcional y conversiones.
- Aplicar reglas de zona horaria de sucursal a cortes transaccionales de reservas.
- Matriz RBAC granular, roles locales/corporativos completos, delegación y auditoría integral de permisos (N09-F3).
- Backfill de históricos sin contexto fiable.
- Reglas avanzadas del dominio de reservas y mesas no aprobadas.

Estos límites no deben rellenarse con supuestos ni presentarse como funcionalidades terminadas.

## Criterio de cierre de esta corrección

- TypeScript, lint y build frontend.
- Backend syntax y pruebas unitarias existentes.
- Migraciones desde base vacía, idempotencia y pruebas de integración en PostgreSQL 16 y 17.
- Revisión de los diffs para confirmar que los cambios funcionales de esta entrega pertenecen al frontend y no amplían reglas de negocio.
- Prueba manual en la VM de organización, entidades legales, sucursales/configuración, historial, mesas y reservas después del despliegue aprobado.

No se considera cerrada la corrección por el mero hecho de abrir el PR. La fusión y el despliegue siguen sujetos a la aprobación del propietario del repositorio.
