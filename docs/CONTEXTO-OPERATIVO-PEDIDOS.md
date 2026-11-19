# Contexto operativo y fiscal de los pedidos

## Objetivo

Todo pedido nuevo creado desde el POS debe quedar ligado, desde su inserción, a:

- La organización propietaria de la instalación.
- Una sucursal a la que el usuario autenticado esté asignado.
- Una entidad legal asociada a esa sucursal y elegida para esa operación.
- El usuario autenticado que registró el pedido.

La sucursal enviada por el navegador es contexto solicitado, no una autorización. El backend obtiene el usuario desde la sesión y PostgreSQL vuelve a comprobar la asignación y la relación sucursal-entidad legal antes de crear el pedido.

## Configuración previa

1. El propietario corporativo registra cada entidad legal y su identificación fiscal.
2. El propietario crea las sucursales y asocia una o varias entidades legales a cada una.
3. El propietario asigna usuarios activos a una o varias sucursales.
4. Al iniciar sesión, el operador ve únicamente las sucursales que tiene asignadas. Si tiene una sola, se selecciona como única opción; si tiene varias, debe elegir la activa.

La pertenencia a una sucursal no amplía el rol global ni concede capacidades administrativas. Las asignaciones de sucursal solo autorizan el acceso operativo que esta implementación protege.

## Contrato de contexto

El cliente HTTP añade `X-Active-Branch-ID` a las solicitudes con una sucursal seleccionada. El backend valida el formato UUID y vincula el identificador al contexto de sesión. PostgreSQL no confía en ese encabezado como prueba de acceso: valida que el usuario autenticado esté asignado a la sucursal.

Endpoints añadidos:

- `GET /api/branches/available`: sucursales asignadas al usuario autenticado, con sus entidades legales asociadas. El DTO operativo no expone NIT ni identificadores fiscales completos.
- `GET /api/branches/:branchId/users`: usuarios activos y estado de asignación; solo el propietario corporativo puede consultarlos.
- `POST /api/branches/:branchId/users/:userId`: asigna un usuario activo; solo el propietario.
- `DELETE /api/branches/:branchId/users/:userId`: retira la asignación; solo el propietario.

`POST /api/orders` ahora exige `legal_entity_id`. El backend toma la sucursal del contexto autenticado, no del cuerpo del pedido, y toma el actor desde la sesión. La función transaccional valida:

- La existencia de sucursal dentro de la organización.
- La asignación activa del usuario a esa sucursal.
- La asociación de la entidad legal elegida con la misma sucursal.
- El tipo y contenido del pedido y sus productos.
- Los datos obligatorios de entrega, cuando el tipo es domicilio.

La lista y la actualización de estado de pedidos se filtran por la sucursal activa y por la asignación del usuario. La lista de entregas y la asignación de repartidor siguen la misma delimitación.

## Persistencia e integridad

La migración `008_branch_assignments_and_order_context.sql`:

- Crea `branch_user_assignments` con unicidad por organización, sucursal y usuario.
- Añade a `orders` `organization_id`, `branch_id`, `legal_entity_id` y `created_by_user_id`.
- Exige que esos cuatro campos estén todos presentes o todos ausentes.
- Aplica una clave foránea compuesta hacia `branch_legal_entities`.
- Impide modificar el contexto operativo/fiscal después de crear el pedido.
- Rechaza inserciones nuevas sin contexto o cuyo actor no pertenezca a la sucursal.
- Retira al rol de ejecución la inserción directa de filas en `orders`; la creación se realiza mediante la función transaccional validada.
- Revoca las firmas antiguas de creación de pedidos y asignación de repartidor que no reciben contexto de sucursal.

Los pedidos existentes mantienen los cuatro campos nuevos en `NULL`. No se asigna retrospectivamente un NIT ni una sucursal inferida.

## Selección de entidad legal en el POS

El carrito muestra la sucursal activa. Si está asociada a varias entidades legales, el operador debe seleccionar explícitamente cuál registra el pedido. No hay una entidad predeterminada en ese escenario. Si la sucursal tiene una única entidad asociada, esa es la única selección posible.

La selección del NIT queda ligada al identificador de la sucursal activa. Cambiar de sucursal invalida una selección anterior, incluso si la interfaz conserva el carrito.

## Compatibilidad y límites deliberados

- Se conserva el cálculo actual de subtotal, impuesto y tarifa de domicilio. La configuración fiscal continúa siendo la configuración global existente; esta entrega no inventa tarifas por entidad legal ni modifica vigencias tributarias.
- Esta atribución no equivale todavía a facturación electrónica ni a contabilización por entidad legal.
- Los reportes contables, mesas, reservas y otros módulos operativos todavía no quedan delimitados completamente por sucursal en esta entrega. Necesitan su propio diseño de alcance y permisos, alineado con N09-F3.3 y el trabajo financiero/contable.
- Las asignaciones de usuario implementan el alcance básico de N09-F3.2. No sustituyen la matriz de roles locales/corporativos, delegación ni permisos granulares del resto de N09-F3.
- Esta migración no se ha aplicado a producción ni modifica datos de producción.

## Verificación

La suite incorpora pruebas unitarias y de integración para:

- Rechazar solicitudes sin sucursal activa o con encabezado malformado.
- Rechazar usuarios no asignados y entidades legales ajenas a la sucursal.
- Permitir un usuario asignado a varias sucursales.
- Verificar la persistencia de sucursal, entidad legal y actor.
- Impedir cambiar el contexto después de crear el pedido.
- Impedir la inserción directa o la creación mediante la firma antigua sin contexto.
- Delimitar entregas y asignación de repartidor a la sucursal del usuario.
- Verificar privilegios del rol runtime y protección de los pedidos históricos.

El cierre de la entrega queda sujeto a los resultados finales de CI del Pull Request.
