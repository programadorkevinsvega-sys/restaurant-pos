# Fase 0 — Auditoría técnica y cimientos multisucursal

> **Estado:** En análisis. Este documento no declara cerrada la Fase 0 ni autoriza cambios de esquema o comportamiento.
> **Base auditada:** `main` en `8b92115223f724f98ee2e41f6c68c95bde57d586`.
> **Modelo comercial confirmado:** una organización/cadena de restaurantes con múltiples sucursales y una o varias entidades legales (NIT). Una sucursal puede operar para una o varias entidades legales; cada operación fiscal/financiera debe identificar la entidad legal responsable. No es un SaaS multi-tenant para restaurantes independientes.
> **Alcance de esta auditoría:** lectura estática de código, SQL versionado, contratos HTTP, frontend, pruebas, configuración y workflow disponible en GitHub.

## 1. Resumen ejecutivo

El POS actual es una aplicación de una sola instalación con datos operativos globales. La estructura modular del backend y el uso de PostgreSQL permiten evolucionar el sistema, pero todavía no existe el contexto de organización/sucursal necesario para operar la cadena con aislamiento y autorización correctos.

El problema no se resuelve agregando un selector de sucursal en el frontend. Hoy las rutas, casos de uso, repositorios y tablas SQL inspeccionados no transportan ni verifican un ámbito de sucursal. La autorización se limita a los roles globales `admin` y `staff`.

**Conclusión:** antes de implementar inventario, compras, recetas, cocina, finanzas multisucursal o BI consolidado, debe diseñarse e introducirse una base organizacional, un contexto de sucursal validado en backend y permisos con alcance explícito.

No se modificó código, SQL, scripts, dependencias, infraestructura ni despliegue durante esta auditoría.

## 2. Identificación de la base revisada

- Repositorio: `programadorkevinsvega-sys/restaurant-pos`.
- Rama revisada: `main`.
- Commit revisado: `8b92115223f724f98ee2e41f6c68c95bde57d586`.
- Backend: Node.js + Express 5, JavaScript ESM, PostgreSQL mediante `pg`, Redis para rate limiting y caché de catálogo, Zod para validación.
- Frontend: Next.js 16, React 19, TypeScript, Biome.
- Organización backend: módulos `auth`, `catalog`, `orders`, `operations`, `accounting`, cada uno con capas domain/application/infrastructure/presentation.
- Composition root: `backend/src/app.js`.
- Persistencia: migraciones SQL versionadas en `backend/src/migrations`.
- Pruebas backend: Node test runner, en `backend/test`.
- Producción documentada: frontend/API detrás de Nginx, procesos PM2 en VM, PostgreSQL, Redis y despliegue mediante GitHub Actions + Tailscale/SSH.

## 3. Inventario funcional observado

| Área | Implementación observada | Brecha para cadena multisucursal |
|---|---|---|
| Identidad | Usuarios PostgreSQL, contraseña scrypt, sesiones opacas, rotación de refresh, cookies HttpOnly, CSRF | El usuario solo tiene rol global; no hay asignación a organización, entidad legal o sucursal |
| Catálogo | Categorías/productos, precio, descuento, imagen, tipo y caché Redis | No se define propiedad corporativa vs sucursal, precio/menú local ni disponibilidad por sucursal |
| Pedidos | Creación transaccional mediante `create_pos_order`, partidas y cálculo de precio/impuesto/tarifa | No hay sucursal, caja, terminal, turno ni almacén de origen en el contrato/persistencia |
| Mesas | CRUD básico de mesas y estado | Número de mesa es único globalmente; no existe plano/área ni sucursal propietaria |
| Reservas | Crear, listar, cambiar estado y asociar mesa | No hay sucursal ni reglas horarias/zonas por local |
| Delivery | Información de entrega y asignación de repartidor | Consultas globales; no hay sucursal/zona/despacho de origen |
| Configuración | Tabla `settings` con clave/valor | La clave es única global; impuestos y tarifa delivery son configuración global |
| Informes | Ventas y productos más vendidos por rango temporal | No hay filtros de sucursal, entidad legal ni consolidación controlada |
| Administración de usuarios | Alta mediante CLI `pnpm user:create` | No hay administración UI/API ni asignación de alcance |
| Auditoría de negocio | Logs, request id, trazas Sentry | No se observa libro de auditoría de acciones de negocio con actor, ámbito, recurso y resultado |

Este inventario describe lo encontrado en el commit auditado; no afirma que el entorno productivo tenga exactamente los mismos datos o configuración.

## 4. Hallazgos técnicos verificables

### 4.1 Esquema PostgreSQL sin dimensión organizacional

En las migraciones `001_create_tables.sql`, `003_additional_tables.sql`, `004_secure_access_and_use_cases.sql` y `005_create_auth_tables.sql`:

- No se encontraron tablas `organizations`, `legal_entities`, `branches` o `warehouses`.
- `categories`, `products`, `orders`, `order_items`, `tables`, `reservations`, `delivery_info` y `settings` no contienen una clave de sucursal.
- `tables.number` tiene una restricción UNIQUE global, incompatible con repetir numeración de mesas en locales diferentes.
- `settings.key` es UNIQUE global; no permite separar configuración corporativa, fiscal, de sucursal o terminal.
- `orders.table_number` almacena texto en lugar de una relación obligatoria con la mesa de una sucursal.
- `reservations.table_id` apunta a una mesa global, sin validar que mesa y reserva pertenezcan al mismo local.
- `order_items.product_id` usa `ON DELETE CASCADE`; debe revisarse antes de introducir historial inmutable de ventas, porque borrar un producto podría borrar partidas históricas.
- Los importes se almacenan en PostgreSQL como NUMERIC, lo cual es una base adecuada, pero los repositorios convierten algunos importes a `Number` al responder. Los contratos de dinero/moneda y precisión deberán definirse para los nuevos módulos.

### 4.2 RLS está deshabilitado en el estado final de las migraciones

La migración `001` habilita RLS en varias tablas y `003` también lo habilita en las tablas operativas nuevas. Sin embargo, `004_secure_access_and_use_cases.sql` elimina las políticas existentes y ejecuta `DISABLE ROW LEVEL SECURITY` sobre esas tablas.

El rol de runtime `restaurant_pos_app` recibe permisos DML sobre las tablas. Por tanto, el estado final versionado no aporta aislamiento de filas mediante RLS. La aplicación debe aplicar filtros/validaciones en cada operación; para la cadena se recomienda además evaluar RLS como defensa en profundidad, no como sustituto de la autorización de dominio.

### 4.3 Autorización actual basada solo en rol global

En `shared/presentation/http/authentication.js`:

- `authenticate` resuelve el usuario de la sesión y coloca `userId` y `role` en `request.auth`.
- `authorize(...roles)` compara únicamente el rol.
- `app_users` almacena `email`, `password_hash`, `role` e `is_active`; no tiene membresías, sucursales asignadas ni permisos.
- `AuthUseCases.publicUser` devuelve id, correo y rol.
- Las rutas de pedidos, mesas, reservas y delivery aceptan `staff` o `admin`; administración de catálogo, configuración e informes requieren `admin`.

No hay evidencia en estas piezas de autorización por sucursal, entidad legal, almacén o recurso.

### 4.4 Repositorios y funciones SQL operan globalmente

Ejemplos inspeccionados:

- `PostgresCatalogRepository.listProducts` filtra por categoría, no por organización/sucursal.
- `PostgresOrderRepository.listOrders` filtra por estado y límite; `updateStatus` actualiza por id.
- `create_pos_order` obtiene productos y settings globales, calcula importes y crea pedido/partidas sin parámetro de sucursal.
- `PostgresOperationsRepository.listTables` y `listReservations` no incluyen sucursal.
- `listDeliveries` consulta pedidos globales.
- `PostgresAccountingRepository` llama funciones SQL de reportes sin parámetro de sucursal o entidad legal.
- `settings` y el cálculo de impuesto/tarifa de delivery se consultan mediante claves globales.

Las funciones transaccionales deben recibir un contexto validado por el backend y comprobarlo dentro de la misma transacción; no basta con filtrar solamente en el controlador HTTP.

### 4.5 Caché y contexto de petición

- El namespace de caché de catálogo se crea como `restaurant-pos:<entorno>:cache:v1:catalog`.
- Las claves de categorías/productos no incluyen organización ni sucursal.
- `requestContext` crea request id y trace id, pero no resuelve organización/sucursal.
- Antes de habilitar caché de datos locales debe definirse el ámbito de cada recurso y su clave de caché; de lo contrario, puede haber exposición cruzada o invalidaciones incorrectas.

### 4.6 Frontend sin contexto de sucursal

- `posApplication` construye repositorios HTTP globales.
- `HttpTablesRepository`, `HttpReservationsRepository`, `HttpDeliveriesRepository` e `HttpAccountingRepository` no reciben sucursal.
- Los modelos TypeScript de mesa, reserva, delivery e informes no exponen identificadores de sucursal.
- La navegación actual ofrece menú, mesas, nuevo producto, reservas, delivery, contabilidad y configuración; no hay selector ni contexto activo de sucursal.

El frontend podrá enviar una sucursal seleccionada, pero nunca será autoridad para decidir si el usuario puede acceder a ella.

## 5. Pruebas y calidad observadas

- Los tests existentes cubren autenticación, CSRF, configuración, rate limiting, caché Redis, composición HTTP y contratos de repositorios.
- `postgres-repositories.test.js` usa objetos de prueba con un método `query`; no demuestra aislamiento con PostgreSQL real.
- En el inventario de `backend/test` revisado no se encontró una suite de integración que levante PostgreSQL real y ejecute migraciones/consultas multisucursal.
- No se encontró suite E2E del flujo completo POS con dos sucursales.
- No existen escenarios de autorización cruzada entre sucursales porque el modelo aún no contiene ese concepto.
- No se ejecutaron pruebas en una VM ni contra la base productiva durante esta auditoría; por tanto, no se declara validación productiva.

### CI/CD

El único workflow encontrado es `.github/workflows/deploy.yml`. Su disparador es `push` a `main`; ejecuta backend checks, typecheck/lint/build del frontend y después despliega a producción. No declara un disparador `pull_request`.

Para el commit auditado y el head documental del PR #8, la consulta de ejecuciones asociadas no devolvió workflow runs. El estado combinado consultado para el commit de main no devolvió checks. Esto **no equivale a CI aprobada**. Además, al no existir un workflow de PR en el archivo revisado, los cambios de una rama no reciben automáticamente la misma validación antes del merge.

No se cambió el workflow durante la Fase 0.

## 6. Arquitectura objetivo propuesta para validar

Esta sección es una propuesta de diseño, no un esquema aprobado ni una instrucción para crear tablas todavía.

### 6.1 Jerarquía organizacional

```text
Organización / Cadena
├── Entidades legales (una o varias; cada una con su NIT)
├── Sucursales
│   ├── Relación con una o varias entidades legales
│   ├── Cajas / terminales
│   ├── Mesas / áreas
│   └── Almacenes de sucursal
└── Almacenes centrales

Relación Sucursal ↔ Entidad legal: N:M mediante asignaciones explícitas.
```

Principios propuestos:

1. Una instalación representa la organización empresarial de la cadena; no se añade multi-tenancy para clientes independientes.
2. La organización es propietaria de los recursos corporativos y gobierna las sucursales.
3. La entidad legal es una dimensión fiscal/contable distinta de la sucursal. No asumir que una sucursal equivale a una entidad legal.
4. Todo dato operativo debe tener un propietario/ámbito explícito: organización, entidad legal, sucursal o almacén.
5. Los movimientos entre almacenes/sucursales deben registrar origen, destino, actor, cantidades, estados y diferencias.
6. Los informes consolidados deben mantener la dimensión de origen y separar entidades legales, monedas y periodos incompatibles.

### 6.2 Contexto de ejecución en backend

Se propone que cada petición autenticada resuelva un contexto inmutable de ejecución que incluya, según corresponda:

- usuario autenticado;
- organización;
- sucursal activa;
- entidad legal aplicable;
- permisos efectivos y alcance;
- terminal/caja cuando el caso de uso lo requiera;
- identificador de petición/correlación.

El cliente puede indicar la sucursal que intenta utilizar, pero el backend debe comprobar que existe, está activa, pertenece a la organización y está asignada al usuario/rol. Un id recibido desde el frontend nunca constituye autorización.

Los casos de uso reciben el contexto explícitamente. Los repositorios y funciones SQL reciben los identificadores validados y aplican filtros/constraints en el mismo límite transaccional. No se recomienda depender de variables globales mutables del proceso Node.

### 6.3 Modelo de permisos

Se propone separar:

- **Identidad:** quién es la persona.
- **Rol:** conjunto de capacidades funcionales.
- **Asignación:** dónde puede ejercer ese rol (organización, entidad legal, sucursal o almacén).
- **Permiso:** acción concreta sobre un recurso/capacidad.
- **Excepción temporal:** solo si se aprueba, con motivo, vencimiento y auditoría.

El modelo debe permitir usuarios corporativos con alcance a varias sucursales y usuarios limitados a una o varias sucursales, sin asumir que `admin` significa acceso irrestricto por defecto. Los roles actuales se deben migrar conservando acceso operativo de forma explícita y verificable.

### 6.4 Persistencia y defensa en profundidad

Propuesta a validar:

- Claves foráneas compuestas que impidan asociar recursos de una organización/sucursal con padres de otro ámbito.
- Índices que comiencen por las claves de ámbito en tablas operativas de alto volumen.
- Restricciones UNIQUE compuestas, por ejemplo numeración de mesa dentro de una sucursal, no global.
- Transacciones para validar contexto y escribir el recurso relacionado.
- RLS por contexto transaccional (`SET LOCAL`) como segunda barrera si se puede garantizar su aplicación en todas las conexiones y funciones SQL. Revisar con cuidado las funciones `SECURITY DEFINER`, propietarios, FORCE RLS y privilegios.
- Auditoría de cambios de alcance, permisos, caja, inventario y finanzas.
- Caché con namespace y claves que incluyan todos los ámbitos relevantes; invalidación local y corporativa explícita.

### 6.5 Recursos corporativos y locales

No se debe resolver todo agregando `branch_id` indiscriminadamente. Se necesita una matriz de propiedad por módulo:

- Catálogo maestro, categorías, recetas y proveedores podrían ser corporativos.
- Precios, disponibilidad, surtido y excepciones podrían variar por sucursal.
- Existencias y movimientos siempre deben apuntar a almacén/ubicación.
- Mesas, reservas, turnos, comandas, caja y despacho son operativos de sucursal.
- Libros, impuestos, facturas y cuentas deben asociarse a entidad legal, con sucursal como dimensión cuando aplique.
- Configuración puede tener valores corporativos con overrides por sucursal.

La propiedad definitiva de cada recurso depende de decisiones operativas pendientes.

## 7. Estrategia de evolución de datos propuesta

No se debe desplegar una migración masiva sin plan de compatibilidad y respaldo verificado.

1. Congelar el inventario de tablas, funciones, índices, constraints, permisos y volúmenes reales de producción.
2. Aprobar la jerarquía organizacional y la matriz de propiedad por tabla/recurso.
3. Crear entidades base organizacionales y registrar la organización y sucursal iniciales mediante datos aprobados; no inventar nombres o identificadores comerciales.
4. Agregar claves de ámbito de forma expand/contract: primero nullable y compatibles, luego backfill validado, constraints/índices y finalmente NOT NULL donde corresponda.
5. Asociar todos los registros actuales a la sucursal inicial aprobada, verificando conteos, relaciones huérfanas y totales antes/después.
6. Actualizar funciones SQL, repositorios, casos de uso y contratos para exigir contexto.
7. Activar autorización por alcance y pruebas negativas entre dos sucursales.
8. Evaluar RLS después de demostrar el contexto transaccional y compatibilidad con funciones existentes.
9. Separar claves de caché e invalidación por ámbito.
10. Desplegar con migraciones compatibles con la versión activa y rollback documentado. Las migraciones ya aplicadas no se revierten simplemente al volver a una versión anterior.

La creación de sucursales adicionales y la activación de nuevas capacidades debe ocurrir solo después de verificar el aislamiento con dos o más sucursales reales de prueba.

## 8. Decisiones pendientes que bloquean el diseño físico

| ID | Decisión | Por qué importa |
|---|---|---|
| D0-01 | **Respondida:** la organización podrá tener varias entidades legales, cada una con su propio NIT. | Define contabilidad, impuestos y facturación por entidad legal |
| D0-02 | **Respondida:** ambas modalidades serán válidas; una sucursal podrá operar con una sola entidad legal o con varias. Se modelará la relación como N:M. | Define cardinalidad y asignación fiscal por operación |
| D0-03 | **Parcialmente respondida:** habrá almacenes centrales de la organización y almacenes propios de cada sucursal. **Pendiente:** decidir si cada almacén tendrá ubicaciones internas (zonas, estanterías, cámaras u otras divisiones). | Define propiedad del inventario, transferencias, abastecimiento y granularidad de ubicación |
| D0-04 | ¿El catálogo maestro es corporativo? ¿Qué campos/precios/disponibilidad pueden variar por sucursal? | Evita duplicar productos y define overrides |
| D0-05 | ¿Un usuario puede estar asignado a varias sucursales y cambiar de sucursal activa? | Define asignaciones y sesión/contexto |
| D0-06 | ¿Qué roles corporativos y roles operativos existen, y qué acciones pueden ejecutar? | Define RBAC/permissions y migración de admin/staff |
| D0-07 | ¿Una sucursal tendrá varias cajas/terminales y turnos concurrentes? | Define caja, terminal, sesión operativa y auditoría |
| D0-08 | ¿Qué zona horaria, moneda y reglas de corte aplican por sucursal/entidad? | Define cierres, reportes, fechas y dinero |
| D0-09 | ¿Se permite vender un producto sin stock o con disponibilidad local desactivada? | Afecta POS, recetas, inventario y cocina |
| D0-10 | ¿Qué datos y capacidades deben ser corporativos frente a locales en configuración, proveedores, clientes y promociones? | Define propiedad y sincronización |

No se codificarán respuestas temporales a estas preguntas para aparentar progreso. Las decisiones fiscales, laborales, contables y comerciales requieren aprobación del responsable del negocio.

## 9. Riesgos prioritarios y orden de tratamiento

| Prioridad | Riesgo | Tratamiento requerido |
|---|---|---|
| Crítica | Lectura/escritura global sin sucursal | Resolver modelo, contexto backend y aislamiento antes de módulos multisucursal |
| Crítica | RLS deshabilitado en migración 004 | Diseñar controles de aplicación y evaluar RLS como defensa adicional |
| Alta | Roles globales sin asignaciones | Diseñar permisos por alcance y migración de usuarios existentes |
| Alta | Funciones SQL globales para pedidos, delivery e informes | Introducir contexto validado y constraints dentro de transacciones |
| Alta | Caché sin ámbito | Definir propiedad y partición de caché antes de cachear datos locales |
| Alta | Configuración global de impuestos/tarifas | Definir alcance corporativo, entidad legal y sucursal |
| Media | Pruebas solo con dobles para repositorios | Incorporar integración PostgreSQL real y pruebas de aislamiento |
| Media | Workflow sin trigger de PR | Definir validación de ramas sin desplegar producción |
| Media | Historial de venta acoplado a borrado de producto | Revisar FK y política de archivado antes de inventario/finanzas |

## 10. Plan de cierre de Fase 0

| Entregable | Estado |
|---|---|
| Inventario de módulos, rutas, repositorios, tablas y funciones actuales | En análisis; inventario estático inicial documentado |
| Matriz de brechas multisucursal | En análisis; brechas principales identificadas |
| Modelo organización-entidad legal-sucursal-almacén | Relación organización-entidad legal y sucursal-entidad legal N:M incorporadas; el resto del modelo sigue pendiente de aprobación |
| Matriz de propiedad/ámbito por recurso | Pendiente de ubicaciones internas (D0-03) y decisiones D0-04 a D0-10; requiere revisión de consistencia |
| Matriz de roles, permisos y asignaciones | Propuesta documentada; pendiente aprobación |
| Estrategia de migración y backfill | Propuesta documentada; requiere datos reales y plan de respaldo |
| Diseño de aislamiento y RLS | Pendiente de diseño detallado y pruebas |
| Pruebas de integración PostgreSQL y aislamiento entre sucursales | Pendiente; no implementadas en esta fase |
| Decisiones de negocio registradas | D0-01 y D0-02 respondidas; D0-03 parcialmente respondida (modelo central/local confirmado); D0-04 a D0-10 pendientes |
| Evidencia de CI/entorno objetivo | Pendiente |

### Criterios de aceptación para cerrar Ola 0

1. Las decisiones D0-01 a D0-10 necesarias para el modelo físico están respondidas y aprobadas.
2. Existe un diagrama lógico y un diccionario de datos con cardinalidades y propietarios.
3. Existe una matriz tabla/recurso → ámbito → propietario → permisos → retención.
4. Existe un diseño de contexto de petición y autorización con amenazas y pruebas negativas.
5. Existe un plan de migración/backfill con conteos, integridad, respaldo, compatibilidad y rollback.
6. Existe un diseño de pruebas PostgreSQL real para dos sucursales, usuario corporativo y usuario limitado.
7. Se define cómo probar consultas, funciones SQL, caché, exportaciones y procesos asíncronos sin filtración entre sucursales.
8. La CI de PR puede validar cambios sin ejecutar el despliegue productivo.
9. Las decisiones no aprobadas permanecen bloqueadas; no se inventan reglas fiscales/contables/comerciales.
10. No se marca la fase como completada hasta adjuntar evidencia de pruebas y revisión.

## 11. Límites y trabajo no realizado

- No se conectó a la base de datos productiva ni se inspeccionaron datos reales, constraints efectivos, índices, policies o volúmenes del servidor.
- No se accedió a la VM ni se ejecutaron consultas de salud, backups o pruebas de carga.
- No se ejecutaron localmente `pnpm check`, typecheck, lint ni build; la auditoría fue estática sobre los archivos del commit indicado.
- No se ejecutaron pruebas de integración PostgreSQL ni E2E.
- No se modificaron scripts, dependencias, migraciones, workflow, frontend, backend o infraestructura.
- No se aprobó ningún criterio contable, fiscal, laboral, de inventario, compras, precios o operación.

**Estado final de esta entrega:** auditoría estática inicial realizada y propuesta arquitectónica documentada. La Fase 0 permanece **En análisis**, no Completada.


---

## 12. Diseño técnico de referencia — versión 1

> Este diseño concreta las decisiones técnicas que pueden establecerse sin inventar políticas comerciales, fiscales ni operativas. No constituye todavía un esquema SQL aprobado. D0-01 y D0-02 ya fueron respondidas por el propietario; D0-03 está parcialmente respondida (tipos de almacén confirmados, ubicaciones internas pendientes); D0-04 a D0-10 siguen pendientes.

### 12.1 Modelo lógico y cardinalidades recomendadas

El modelo debe representar una única organización propietaria de la instalación, aunque se recomienda que el agregado soporte más de una organización solo si el negocio lo aprueba expresamente; no se construirá multi-tenancy de clientes.

Entidades lógicas:

- `Organization`: raíz de propiedad y gobierno de la cadena.
- `LegalEntity`: identidad fiscal/contable; pertenece a una organización.
- `Branch`: unidad operativa perteneciente a una organización; puede vincularse con una o varias entidades legales mediante asignaciones explícitas.
- `Warehouse`: unidad física de inventario; pertenece a una organización y se clasifica como central (sin sucursal propietaria) o local (asignada a una sucursal).
- `StorageLocation`: ubicación interna opcional dentro de un almacén; su obligatoriedad y granularidad siguen pendientes de D0-03.
- `User`: identidad autenticable global dentro de la instalación.
- `Role` y `Permission`: capacidades y permisos.
- `UserAssignment`: asignación de usuario a un ámbito con rol/capacidades y vigencia.
- `BranchTerminal` / `CashRegister`: terminal y caja de una sucursal, separados de la identidad de usuario.
- `AuditEvent`: registro inmutable de acciones relevantes.

Cardinalidades base propuestas:
- Organization 1:N LegalEntity.
- Organization 1:N Branch.
- Organization 1:N Warehouse.
- **Almacén central:** pertenece a la organización y no tiene `branch_id` propietario.
- **Almacén local:** pertenece a la organización y tiene un `branch_id` obligatorio que identifica su sucursal propietaria.
- **LegalEntity N:M Branch mediante `BranchLegalEntity`**; cada asignación debe tener estado/vigencia y permitir validar qué entidad legal puede operar en cada sucursal. Una sucursal podrá tener una o varias asignaciones activas.
- Las ubicaciones internas (`StorageLocation`) podrán colgar de un almacén, pero su uso obligatorio, profundidad y clasificación quedan pendientes de D0-03.
- Branch 1:N Terminal y CashRegister; la entidad legal responsable de cada operación de caja debe quedar identificada en sus transacciones, sin asumir todavía que una caja física pertenece exclusivamente a un único NIT.
- User N:M Organization/LegalEntity/Branch/Warehouse mediante asignaciones explícitas.
- Toda venta, factura, pago, asiento o registro financiero/fiscal debe quedar asociado a una única entidad legal responsable. El backend valida que esa entidad legal esté vinculada y habilitada para la sucursal al momento de la operación.

Esta decisión no define todavía si una misma comanda/carrito puede incluir productos facturados por distintas entidades legales; ese caso requiere una regla comercial y fiscal específica antes de implementarse.

No se recomienda guardar una única sucursal activa como atributo permanente del usuario: el contexto activo pertenece a la sesión/solicitud y debe poder cambiarse después de autorización.

### 12.2 Matriz inicial de propiedad de recursos

La matriz es una clasificación arquitectónica inicial para revisar; los casos marcados como "por aprobar" no se convertirán en constraints hasta recibir decisión del negocio.

| Recurso | Ámbito recomendado | Propietario lógico | Observación |
|---|---|---|---|
| Organización | Organización | Organization | Raíz única de la cadena |
| Entidad legal | Organización | Organization | Datos fiscales no se infieren de la sucursal |
| Sucursal | Organización | Organization | Zona horaria y estado propios |
| Almacén | Organización o sucursal | Organization / Branch | Se confirman almacenes centrales propiedad de la organización y almacenes locales propiedad de una sucursal. Ubicaciones internas pendientes de D0-03 |
| Categorías y productos maestros | Corporativo | Organization | Surtido y disponibilidad local como relación separada |
| Precio y menú publicado | Corporativo con override local | Organization / Branch | Pendiente D0-04 |
| Receta y versión | Corporativo con posible override | Organization / Branch | Costeo por sucursal/fecha |
| Proveedor | Corporativo | Organization | Condiciones comerciales pueden variar |
| Existencia y movimiento | Almacén | Warehouse | No se guarda stock como cifra editable sin movimientos |
| Pedido/comanda | Sucursal + entidad legal responsable | Branch + LegalEntity | Cada operación de venta identifica el NIT emisor/responsable; snapshot de precio, impuesto y datos relevantes |
| Partida de pedido | Pedido | Order | No debe borrarse al eliminar/archivar producto |
| Mesa/área/plano | Sucursal | Branch | Número único dentro de sucursal, no global |
| Reserva/lista de espera | Sucursal | Branch | Mesa debe pertenecer a la misma sucursal |
| Caja/turno/transacción de caja | Sucursal + caja | CashRegister | Requiere reglas de apertura/cierre |
| Delivery/despacho | Sucursal | Branch | Zona y asignación local, salvo operación central aprobada |
| Cliente/CRM | Organización, con datos de actividad por sucursal | Organization | Privacidad y visibilidad por aprobar |
| Empleado/relación laboral | Organización y entidad legal | Organization / LegalEntity | No inferir empleador legal |
| Factura/asiento/libro | Entidad legal | LegalEntity | Sucursal como dimensión analítica cuando aplique |
| Configuración | Global/corporativa con override | Organization / Branch / Terminal | Precedencia explícita y auditable |
| Reporte | Ámbito autorizado | Ámbito de origen | Consolidación sin perder moneda/entidad legal |

### 12.3 Contrato del contexto de ejecución

El backend debe construir un objeto de contexto inmutable después de autenticar y autorizar la selección de ámbito. Como una sucursal puede estar vinculada a varias entidades legales, las operaciones fiscales/financieras deben resolver una `legalEntityId` concreta y validar la asignación activa sucursal-entidad legal antes de continuar. Forma conceptual:

```ts
type ExecutionContext = {
  requestId: string
  userId: string
  organizationId: string
  legalEntityId?: string
  branchId?: string
  warehouseId?: string
  terminalId?: string
  permissions: ReadonlySet<string>
  scope: "organization" | "legal_entity" | "branch" | "warehouse"
}
```

Reglas obligatorias:
1. La identidad proviene de la sesión autenticada, nunca del body.
2. El cliente puede solicitar un `branchId`; el backend comprueba existencia, estado, pertenencia y asignación del usuario antes de construir el contexto.
3. Si el caso de uso tiene impacto fiscal/financiero, debe resolver una `legalEntityId` explícita y comprobar que existe una asignación activa para esa sucursal; nunca elegir un NIT implícitamente.
4. El caso de uso recibe el contexto explícitamente; no lee variables globales mutables.
5. Cada método de repositorio que acceda a datos acotados recibe el contexto o identificadores ya validados y documentados.
6. Las escrituras validan todas las relaciones en una única transacción.
7. La ausencia de contexto en un caso de uso que lo requiere produce rechazo explícito; nunca se interpreta como "todas las sucursales" o "todas las entidades legales".
8. El acceso corporativo consolidado exige permiso explícito de alcance corporativo.
9. Los trabajos asíncronos persisten el ámbito y actor de origen en el mensaje; no dependen de la sesión HTTP desaparecida.

### 12.4 Autorización y amenazas

Modelo recomendado: RBAC para agrupar capacidades más asignaciones de alcance (scope assignment). No se debe convertir el rol global actual en permiso universal implícito.

Matriz mínima de capacidades que debe detallarse con el negocio:
- `catalog.read`, `catalog.manage`, `pricing.manage`
- `orders.read`, `orders.create`, `orders.change_status`, `orders.cancel`
- `operations.tables.manage`, `reservations.manage`, `delivery.dispatch`
- `inventory.read`, `inventory.receive`, `inventory.transfer`, `inventory.adjust`
- `cash.open`, `cash.close`, `cash.reconcile`
- `users.manage`, `assignments.manage`, `audit.read`
- `reports.branch.read`, `reports.organization.read`, `finance.legal_entity.read`

Amenazas y controles verificables:
- IDOR/cambio de branch id: resolver asignación en backend y comprobar ownership en SQL.
- Omisión de filtro en una consulta nueva: contratos de repositorio con contexto obligatorio y pruebas de aislamiento.
- Cruce de entidades relacionadas: FK compuestas y constraints de mismo ámbito.
- Fuga por caché: claves con todos los ámbitos y tests de hit/miss e invalidación.
- Fuga por exportación/reporte: scope aplicado en query y prueba de datos señuelo en otra sucursal.
- Contexto contaminado en pool PostgreSQL: transacción explícita y `SET LOCAL`; nunca `SET` de sesión sin reset garantizado.
- Funciones `SECURITY DEFINER`: revisar owner, search_path, privilegios y validación de contexto; no confiar en RLS como única barrera.
- Escalada de privilegios por rol: asignaciones y permisos comprobados en cada operación sensible.
- Mensajes asíncronos falsificados/reproducidos: validar origen, ámbito, idempotencia y autorización del consumidor.
- Auditoría manipulable: actor, acción, ámbito, recurso, resultado y correlación append-only; no registrar secretos ni datos de pago sensibles.

### 12.5 Estrategia PostgreSQL y RLS

Decisión técnica de referencia: autorización de dominio + restricciones relacionales como controles primarios; RLS puede añadirse como defensa en profundidad, después de probar el patrón con el rol real de runtime.

Requisitos antes de activar RLS:
- El pool debe iniciar transacción por operación acotada.
- El contexto se establece con `SET LOCAL` o mecanismo equivalente dentro de esa transacción.
- Todas las rutas de éxito y error hacen rollback/commit correctamente.
- La conexión vuelve al pool sin estado residual.
- Se prueban funciones `SECURITY DEFINER`, vistas, owners, bypassrls, superuser y FORCE ROW LEVEL SECURITY.
- El rol runtime no debe ser superuser ni tener BYPASSRLS.
- Las pruebas deben conectarse con el mismo rol/privilegios de producción, no solo con el owner de migraciones.

No se debe reactivar RLS por simple `ALTER TABLE ENABLE ROW LEVEL SECURITY`: sin políticas correctas y pruebas con el rol runtime puede provocar indisponibilidad o dar una falsa sensación de aislamiento.

### 12.6 Plan expand/contract para datos actuales

Secuencia de migración propuesta:
1. Obtener snapshot de esquema y datos desde producción: tablas, columnas, constraints, índices, funciones, triggers, policies, roles, grants, extensiones, tamaños y conteos.
2. Verificar backup restaurable en un entorno aislado; registrar timestamp, tamaño, checksum y duración de restauración.
3. Definir y aprobar Organization, LegalEntity, Branch y Warehouse iniciales con datos reales.
4. Crear tablas organizacionales y relaciones sin alterar todavía lecturas/escrituras existentes.
5. Añadir columnas de ámbito nullable y nuevos índices/FK sin validar inicialmente si la estrategia de despliegue lo requiere.
6. Backfill por relaciones deterministas; no asignar registros ambiguos automáticamente.
7. Comparar conteos, huérfanos, importes agregados, estados y relaciones antes/después; cualquier diferencia bloquea el avance.
8. Desplegar backend compatible que escriba y lea el nuevo ámbito, con telemetría para detectar registros sin contexto.
9. Validar consultas, reportes, tareas y caché con datos de dos sucursales.
10. Aplicar constraints validados y NOT NULL solo cuando la cobertura sea completa.
11. Activar controles de autorización y, después de sus pruebas, RLS.
12. Retirar rutas legacy en una entrega posterior, con rollback operativo documentado.

No ejecutar backfill en producción sin respaldo restaurado y plan de reversión. No se debe "rollback" una migración destructiva simplemente bajando el binario.

### 12.7 Plan de pruebas de aceptación para la base multisucursal

| ID | Escenario | Resultado exigido |
|---|---|---|
| MS-001 | Usuario de sucursal A consulta pedidos de A | Solo ve A |
| MS-002 | Usuario de sucursal A solicita pedido de B por UUID | 404/403 sin revelar datos |
| MS-003 | Usuario A crea pedido indicando producto no disponible en A | Rechazo consistente |
| MS-004 | Usuario A asocia mesa perteneciente a B | Rechazo y rollback total |
| MS-005 | Usuario sin sucursal activa ejecuta operación local | Rechazo explícito |
| MS-006 | Usuario corporativo autorizado consulta consolidado | Ve sucursales autorizadas y conserva dimensión de origen |
| MS-007 | Usuario corporativo sin permiso financiero intenta ver datos contables | 403 |
| MS-008 | Dos sucursales usan el mismo número de mesa | Permitido si la clave compuesta lo define |
| MS-009 | Dos transacciones concurrentes actualizan un recurso de sucursales distintas | Sin bloqueo/contaminación cruzada |
| MS-010 | Caché de A se calienta y usuario B consulta mismo producto | No recibe precio/disponibilidad privada de A |
| MS-011 | Falla una transacción después de establecer contexto | Rollback y conexión limpia al pool |
| MS-012 | Se ejecuta función SQL privilegiada con contexto A apuntando a B | Rechazo |
| MS-013 | Exportación y reporte filtran por ámbito | Ningún registro de B aparece en A |
| MS-014 | Trabajo asíncrono de A se reintenta | Mantiene A e idempotencia |
| MS-015 | Se revoca una asignación durante sesión activa | Acceso denegado según política de revocación aprobada |

Estas pruebas requieren PostgreSQL real y el rol runtime equivalente. Los dobles de repositorio no satisfacen el criterio.

### 12.8 Requisitos de observabilidad y operación

Antes de habilitar el modelo:
- Log estructurado con request id, actor, branch id y operación; nunca tokens, contraseñas, cookies ni datos sensibles.
- Métricas de denegaciones por scope, consultas sin ámbito, registros huérfanos, fallos de migración y latencia por operación.
- Alertas para intentos de acceso cruzado, errores de contexto y backfill incompleto.
- Dashboard de migración con conteos por tabla y sucursal.
- Runbook de backup, restauración, migración, verificación, rollback de aplicación y recuperación.
- Canary o despliegue controlado compatible con la infraestructura existente; no desplegar cambios de Fase 0 a producción porque esta entrega es de diseño.

## 13. Matriz de entregables y evidencia — actualización

| Entregable | Resultado de esta revisión | Estado |
|---|---|---|
| Decisión D0-01 — varias entidades legales por organización | Confirmada por el propietario: una organización podrá tener varias empresas/NIT | Respondida |
| Decisión D0-02 — relación sucursal-entidad legal | Confirmada por el propietario: se admiten sucursales vinculadas a una o varias entidades legales (N:M) | Respondida |
| Decisión D0-03 — modelo central/local de almacenes | Confirmado: habrá almacenes centrales de la organización y almacenes propios de cada sucursal. Las ubicaciones internas siguen pendientes | Parcial |
| Auditoría estática de código y migraciones versionadas | Revisados composición backend, autenticación, migraciones 001/003/004/005 y módulos actuales en el commit base | Realizado estáticamente |
| Brechas multisucursal | Identificadas en persistencia, autorización, funciones SQL, caché, frontend y pruebas | Realizado |
| Modelo lógico de referencia | Entidades, relaciones y cardinalidades candidatas documentadas | Propuesto; requiere aprobación D0 |
| Matriz de propiedad | Clasificación inicial por recurso documentada | Propuesta; requiere decisiones operativas |
| Contexto backend | Contrato conceptual, reglas de resolución y propagación documentados | Diseño de referencia |
| Seguridad | Amenazas IDOR, scope leakage, RLS, cache, jobs y privilegios documentadas | Diseño de referencia |
| Migración | Expand/contract, backfill, verificación y rollback documentados | Plan; requiere acceso a datos reales |
| Pruebas | 15 escenarios de aceptación multisucursal definidos | Especificadas; no ejecutadas |
| Producción/VM/backup | Sin acceso ni evidencia verificable en esta revisión | Bloqueado |
| CI de PR | No hay workflow de validación de PR en el commit base inspeccionado; no se ha cambiado | Pendiente |
| Decisiones de negocio D0-01 y D0-02 | Respondidas por el propietario e incorporadas al modelo lógico | Respondidas |
| Decisión D0-03 | Modelo central/local de almacenes respondido; definición de ubicaciones internas pendiente | Parcial |
| Decisiones de negocio D0-04 a D0-10 | Pendientes de respuesta del propietario | Pendientes |

## 14. Dictamen de Fase 0

La Fase 0 queda **completada en su componente de análisis estático y diseño técnico de referencia**, pero **no puede declararse cerrada integralmente**.

Bloqueantes para cierre formal:
1. Completar la decisión D0-03 sobre ubicaciones internas, resolver D0-04 a D0-10 y validar la consistencia del modelo completo.
2. Auditoría de esquema, datos, roles, grants, policies, volúmenes y backups en la base productiva.
3. Verificación de backup restaurable y plan de migración basado en conteos reales.
4. Validación del pipeline de PR que no despliegue producción.
5. Revisión y aprobación del diseño lógico final y matriz de propiedad/permisos.

No se creó ni modificó código de aplicación, migraciones, scripts, dependencias, workflows ni infraestructura. No se ejecutaron pruebas ni despliegues. No se debe iniciar la migración multisucursal ni marcar Fase 0 como cerrada hasta resolver los bloqueantes anteriores.
