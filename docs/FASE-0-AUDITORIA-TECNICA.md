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
│   ├── Varias cajas registradoras y terminales POS (operación simultánea permitida)
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
7. El sistema permitirá configurar moneda y zona horaria de forma independiente en cada entidad legal y en cada sucursal; no se impondrá un país, una moneda ni una zona horaria global. La precedencia cuando ambos ámbitos tengan configuración, la moneda funcional/contable, las conversiones y las reglas de corte deben definirse expresamente antes de implementarse.
7. Cada sucursal podrá operar varias cajas registradoras y terminales POS simultáneamente. La relación concreta entre caja y terminal, así como las reglas de apertura, cierre, asignación de cajeros y turnos, requieren decisiones operativas separadas.

### 6.2 Contexto de ejecución en backend

Se propone que cada petición autenticada resuelva un contexto inmutable de ejecución que incluya, según corresponda:

- usuario autenticado;
- organización;
- sucursal activa;
- entidad legal aplicable;
- permisos efectivos y alcance;
- terminal/caja cuando el caso de uso lo requiera;
- identificador de petición/correlación.

El cliente puede indicar la sucursal que intenta utilizar al iniciar sesión o al cambiar de contexto, pero el backend debe comprobar que existe, está activa, pertenece a la organización y el usuario tiene una asignación vigente para ella. Después del cambio, cada petición debe volver a resolver el contexto y comprobar los permisos efectivos para esa sucursal. Un id recibido desde el frontend nunca constituye autorización.

Los casos de uso reciben el contexto explícitamente. Los repositorios y funciones SQL reciben los identificadores validados y aplican filtros/constraints en el mismo límite transaccional. No se recomienda depender de variables globales mutables del proceso Node.

### 6.3 Modelo de permisos

Se propone separar:

- **Identidad:** quién es la persona.
- **Rol:** conjunto de capacidades funcionales.
- **Asignación:** dónde puede ejercer ese rol (organización, entidad legal, sucursal o almacén).
- **Permiso:** acción concreta sobre un recurso/capacidad.
- **Excepción temporal:** solo si se aprueba, con motivo, vencimiento y auditoría.

El modelo combinará roles corporativos y roles operativos asignados por sucursal, con permisos configurables por ámbito. El catálogo inicial de roles corporativos será: propietario, administrador general, director de operaciones y responsable financiero. El catálogo inicial de roles operativos por sucursal será: gerente, administrador de sucursal, cajero, mesero, cocinero y responsable de inventario. Un mismo usuario podrá desempeñar roles distintos en distintas sucursales y conservar asignaciones corporativas cuando corresponda. Los permisos efectivos se resolverán a partir del rol y la asignación del usuario en el ámbito correspondiente; no se asumirán permisos globales por el simple nombre del rol ni se tratará `admin` como acceso irrestricto. La matriz detallada de acciones, permisos y posibles restricciones por sucursal debe definirse y aprobarse antes de codificar la autorización. Los roles actuales se deben migrar conservando acceso operativo de forma explícita y verificable.

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

- El catálogo maestro de productos será corporativo y compartido por todas las sucursales; cada producto tendrá una identidad única, evitando duplicados por local.
- Cada sucursal administrará su surtido (qué productos ofrece), precio y disponibilidad mediante configuración local vinculada al producto maestro. Estas diferencias no crearán copias independientes del producto.
- Los campos adicionales que puedan modificarse localmente, aparte de surtido, precio y disponibilidad, no quedan autorizados por esta decisión y requerirán una decisión posterior.
- Existencias y movimientos siempre deben apuntar a almacén/ubicación.
- Mesas, reservas, turnos, comandas, caja y despacho son operativos de sucursal.
- Libros, impuestos, facturas y cuentas deben asociarse a entidad legal, con sucursal como dimensión cuando aplique.
- **Configuración:** valores base corporativos con ajustes permitidos por entidad legal y por sucursal. La precedencia cuando existan valores distintos en varios niveles debe definirse por tipo de parámetro; no se asumirá una regla universal.
- **Proveedores:** catálogo maestro corporativo compartido, con habilitación/relación operativa por entidad legal o sucursal según corresponda. La identidad del proveedor no se duplica por local.
- **Clientes:** identidad compartida dentro de la cadena; ventas, visitas e historial deben conservar el ámbito de origen (sucursal y, cuando aplique, entidad legal), con acceso sujeto a permisos.
- **Promociones:** podrán ser corporativas para las sucursales designadas o locales para una sucursal específica. Su alcance y vigencia deben estar explícitos.

La matriz física final deberá detallar propietario, ámbito, reglas de acceso, precedencia de configuración y retención para cada recurso.

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
| D0-03 | **Respondida:** coexistirán almacenes centrales de la organización y almacenes propios de cada sucursal. El inventario se controlará tanto por el total del almacén como por sus ubicaciones físicas internas (por ejemplo, zonas, estanterías, cámaras o áreas de preparación). El saldo total del almacén será una consolidación de sus ubicaciones, no una cantidad paralela editable que duplique existencias. | Define propiedad del inventario, transferencias, abastecimiento y granularidad de ubicación |
| D0-04 | **Respondida:** el catálogo maestro de productos será corporativo y compartido, con una identidad única por producto. Cada sucursal podrá definir su propio surtido, precio y disponibilidad mediante configuraciones locales vinculadas al producto maestro, sin duplicarlo. Otros campos locales no quedan autorizados por esta decisión. | Evita duplicar productos y define el límite de las variaciones por sucursal |
| D0-05 | **Respondida:** un mismo usuario podrá tener asignaciones a varias sucursales y seleccionar la sucursal activa al iniciar sesión o cambiarla desde la aplicación. Los roles/permisos se resolverán según las asignaciones y el ámbito de la sucursal activa; el backend validará cada selección y operación. | Define asignaciones, permisos y contexto de sesión sin conceder acceso por cambiar un identificador |
| D0-06 | **Respondida como modelo base:** se combinarán roles corporativos y roles operativos por sucursal, con permisos configurables por ámbito. Catálogo inicial corporativo: propietario, administrador general, director de operaciones y responsable financiero. Catálogo inicial de sucursal: gerente, administrador de sucursal, cajero, mesero, cocinero y responsable de inventario. Un usuario podrá tener roles distintos en distintas sucursales. La matriz exacta de acciones/permisos y sus límites deberá detallarse y aprobarse antes de implementar autorización. | Define RBAC por ámbito, catálogo de roles y separación de responsabilidades |
| D0-06 | **Respondida como modelo base:** roles corporativos y operativos por sucursal, con permisos configurables. Catálogo inicial: propietario, administrador general, director de operaciones, responsable financiero, gerente de sucursal, administrador de sucursal, cajero, mesero, cocinero y responsable de inventario. Un usuario podrá tener roles distintos según la sucursal. La matriz exacta de acciones/permisos sigue pendiente de aprobación. | Define RBAC por ámbito y migración de admin/staff |
| D0-07 | **Respondida:** cada sucursal podrá tener varias cajas registradoras y terminales POS funcionando simultáneamente. Esta respuesta no define todavía la relación caja-terminal ni las reglas de apertura/cierre, asignación de cajeros o turnos. | Define la multiplicidad de cajas y terminales; las reglas de sesión y arqueo requieren decisiones posteriores |
| D0-08 | **Respondida en alcance:** Chili POS será internacional; cada entidad legal y cada sucursal podrá configurar su propia moneda y zona horaria. No habrá una moneda ni zona horaria global obligatoria. Quedan por definir la precedencia cuando ambos ámbitos tengan valores distintos, moneda funcional/contable, conversiones/tasas de cambio y reglas de corte. | Define internacionalización de dinero, calendario operativo, cierres y reportes |
| D0-09 | **Respondida:** se habilitarán tres políticas configurables por producto o sucursal, administradas por un usuario con permiso: (a) bloquear la venta cuando no haya stock suficiente; (b) permitir vender aun sin stock suficiente; y (c) controlar manualmente la disponibilidad comercial del producto, pudiendo desactivarlo aunque exista inventario. La opción elegida y su alcance deben quedar explícitos y cada cambio administrativo será auditable. El rol autorizado y la precedencia entre producto y sucursal se detallarán en la matriz de permisos/configuración. | Afecta POS, inventario disponible/comprometido, cocina y controles administrativos |
| D0-10 | **Respondida:** se adopta un modelo mixto: (a) configuración con valores corporativos y ajustes por entidad legal y sucursal; (b) proveedores con catálogo maestro corporativo y habilitación/relación operativa por entidad legal o sucursal; (c) clientes con identidad compartida en toda la cadena y operaciones/historial conservando su sucursal de origen; (d) promociones corporativas aplicables a sucursales designadas y promociones locales de una sucursal. La precedencia de configuraciones, los permisos y el detalle de alcance/visibilidad se especificarán en el diseño detallado. | Define propiedad, ámbito, sincronización y consistencia de datos compartidos/locales |

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
| Matriz de propiedad/ámbito por recurso | Modelo mixto D0-10 y reglas de propiedad propuestos; completar diccionario, precedencia por parámetro y revisión de datos sensibles por ámbito |
| Matriz de roles, permisos y asignaciones | Modelo RBAC por ámbito, permisos granulares, perfiles mínimos y controles de delegación especificados; queda revisión/aprobación de permisos por acción |
| Estrategia de migración y backfill | Propuesta documentada; requiere datos reales y plan de respaldo |
| Diseño de aislamiento y RLS | Pendiente de diseño detallado y pruebas |
| Pruebas de integración PostgreSQL y aislamiento entre sucursales | Pendiente; no implementadas en esta fase |
| Decisiones de negocio registradas | D0-01 a D0-10 respondidas en alcance principal; quedan por cerrar reglas operativas/contables complementarias y aprobar el diseño técnico de referencia antes de implementar |
| Diseño de configuración internacional | Precedencia por familia, moneda funcional/transaccional y snapshots de zona horaria especificados; reglas contables/fiscales locales y pruebas pendientes | Pendiente de aprobación/implementación |
| Diseño caja-terminal-turnos | Modelo separado de terminal, sesión técnica, caja, sesión de caja y turno; multi-entidad legal requiere política de fondo aprobada | Diseño de referencia |
| Inspección PostgreSQL productiva | Runbook de solo lectura preparado; ejecución y evidencia productiva pendientes | Pendiente |
| Restauración de backup | Procedimiento de restauración aislada y criterios de integridad especificados; ejecución pendiente | Pendiente |
| Diseño CI de PR | Workflow separado, sin secretos ni despliegue, especificado; creación y ejecución pendientes | Pendiente |
| Runbook PostgreSQL/backup | Procedimiento de inspección de solo lectura y restauración aislada en docs/FASE-0-RUNBOOK-POSTGRES-BACKUP.md | Preparado; no ejecutado |
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

> Este diseño concreta las decisiones de alcance y las recomendaciones técnicas de referencia; no constituye todavía un esquema SQL aprobado ni reemplaza la aprobación de reglas contables/fiscales locales. Las diez decisiones de negocio están respondidas en su alcance principal. Los detalles operativos, permisos delegables, excepciones financieras y configuración por familia quedan sujetos a revisión antes de implementar.

### 12.1 Modelo lógico y cardinalidades recomendadas

El modelo debe representar una única organización propietaria de la instalación, aunque se recomienda que el agregado soporte más de una organización solo si el negocio lo aprueba expresamente; no se construirá multi-tenancy de clientes.

Entidades lógicas:

- `Organization`: raíz de propiedad y gobierno de la cadena.
- `LegalEntity`: identidad fiscal/contable; pertenece a una organización.
- `Branch`: unidad operativa perteneciente a una organización; puede vincularse con una o varias entidades legales mediante asignaciones explícitas.
- `Warehouse`: unidad física de inventario; pertenece a una organización y se clasifica como central (sin sucursal propietaria) o local (asignada a una sucursal).
- `StorageLocation`: ubicación física interna de un almacén, organizada con la granularidad necesaria para representar zonas, estanterías, cámaras, congeladores o áreas de preparación. El modelo deberá permitir consultar tanto el saldo de cada ubicación como el total consolidado del almacén.
- `User`: identidad autenticable global dentro de la instalación.
- `Role` y `Permission`: catálogo separado por ámbito corporativo u operativo; agrupa capacidades y permisos configurables.
- `UserAssignment`: asignación de usuario a un ámbito con uno o más roles/capacidades y vigencia; permite que el mismo usuario tenga diferentes asignaciones y permisos en varias sucursales.
- `RolePermission` (relación conceptual): vincula cada rol con sus permisos; el conjunto efectivo debe considerar el ámbito de la asignación y la configuración autorizada para la sucursal.
- `BranchTerminal` / `CashRegister`: terminal y caja de una sucursal, separados de la identidad de usuario.
- `AuditEvent`: registro inmutable de acciones relevantes.

Cardinalidades base propuestas:
- Organization 1:N LegalEntity.
- Organization 1:N Branch.
- Organization 1:N Warehouse.
- **Almacén central:** pertenece a la organización y no tiene `branch_id` propietario.
- **Almacén local:** pertenece a la organización y tiene un `branch_id` obligatorio que identifica su sucursal propietaria.
- **LegalEntity N:M Branch mediante `BranchLegalEntity`**; cada asignación debe tener estado/vigencia y permitir validar qué entidad legal puede operar en cada sucursal. Una sucursal podrá tener una o varias asignaciones activas.
- Cada `StorageLocation` pertenece a un único almacén. El sistema debe exponer saldos por ubicación y el total del almacén. El total se obtiene de la suma de las ubicaciones y, solo si se autoriza una modalidad sin ubicación específica, de un saldo explícito no asignado; nunca se mantendrán dos cantidades independientes que puedan divergir.
- Branch 1:N Terminal y CashRegister; la entidad legal responsable de cada operación de caja debe quedar identificada en sus transacciones, sin asumir todavía que una caja física pertenece exclusivamente a un único NIT.
- User N:M Organization/LegalEntity/Branch/Warehouse mediante asignaciones explícitas; cada asignación a sucursal mantiene sus propios roles/permisos y vigencia.
- Los roles corporativos se asignan en el ámbito de la organización; los roles operativos se asignan a una sucursal concreta. No se presume que un rol local se propague a otras sucursales ni que un rol corporativo conceda por sí solo todos los permisos operativos.
- La sucursal activa se conserva como contexto de sesión/solicitud y puede seleccionarse al iniciar sesión o cambiarse desde la aplicación. Nunca se almacena como una única sucursal fija del usuario ni reemplaza la verificación de permisos en backend.
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
| Almacén | Organización o sucursal | Organization / Branch | Se confirman almacenes centrales y locales. El inventario se controla por ubicación física y se consolida por almacén, sin duplicar saldos |
| Categorías y productos maestros | Corporativo | Organization | Catálogo compartido; identidad única del producto en toda la organización |
| Surtido por sucursal | Sucursal | Branch | Define qué productos maestros ofrece cada local; no duplica el producto |
| Precio por sucursal | Sucursal, con valor corporativo solo si se aprueba después | Branch | Cada sucursal puede definir su precio para un producto maestro |
| Disponibilidad por sucursal | Sucursal | Branch | Cada local controla si el producto está disponible, sin alterar el catálogo maestro |
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


### 12.9 Autorización RBAC por ámbito — diseño objetivo

La autorización será **RBAC + asignaciones de ámbito (scope-based access control)**. Los roles agrupan permisos; la asignación determina dónde puede ejercerlos. El nombre del rol, la sucursal activa o un identificador recibido desde el cliente nunca conceden acceso por sí solos.

**Catálogo de permisos**

- Claves estables con formato \`recurso.acción\`, por ejemplo: \`orders.read\`, \`orders.create\`, \`orders.cancel\`, \`catalog.manage\`, \`pricing.manage\`, \`inventory.receive\`, \`inventory.adjust\`, \`cash.open\`, \`cash.close\`, \`cash.reconcile\`, \`finance.ledger.read\`, \`finance.post\`, \`users.assign\`, \`roles.manage\`, \`settings.manage\` y \`audit.read\`.
- El catálogo de permisos pertenece al sistema y se versiona. Los administradores asignan permisos a roles existentes o roles personalizados; no pueden crear permisos arbitrarios que el backend no implemente.
- Cada permiso declara los ámbitos donde puede aplicarse, si admite herencia, si requiere aprobación adicional y si es sensible. La herencia es opt-in por permiso; no existe propagación automática de un permiso corporativo a todas las sucursales.
- Separar lectura, ejecución, configuración, aprobación y reverso. No agrupar acciones de riesgo diferente en un único permiso genérico.

**Asignaciones y resolución**

La relación conceptual será \`UserScopeRole(user_id, role_id, scope_type, scope_id, valid_from, valid_until, status, granted_by, reason, version)\`, con FK/constraints que validen la pertenencia del ámbito a la organización. Un usuario puede tener roles distintos y vigentes en varias sucursales. Las asignaciones tienen vigencia, estado, actor otorgante y motivo; se revocan, no se borran físicamente.

La decisión de autorización se calcula con: identidad autenticada + asignación vigente + permiso solicitado + ámbito del recurso + estado del recurso + restricciones de negocio. **Default deny**: ausencia de asignación/contexto, recurso fuera del ámbito o permiso no concedido implica rechazo. Las consultas y escrituras vuelven a comprobar el ámbito en repositorio/SQL; ocultar un botón en frontend no es control de seguridad.

La herencia seguirá una lista permitida explícita:
- Un rol corporativo solo alcanza los ámbitos descendientes para los permisos marcados expresamente como heredables.
- Un rol de sucursal solo aplica a esa sucursal y a sus recursos subordinados cuando el permiso lo permita.
- Roles de entidad legal, almacén o caja no se extienden lateralmente a otras entidades.
- No se permiten comodines equivalentes a "todo" para usuarios operativos ni elevación implícita desde el antiguo \`admin\`.

**Matriz inicial de perfiles recomendados**

| Perfil | Alcance asignable | Capacidades base recomendadas | Separación explícita |
|---|---|---|---|
| Propietario | Organización, mediante asignación expresa | Gobierno de organización, entidades legales, sucursales, roles, auditoría y visión corporativa | Sus acciones privilegiadas quedan auditadas; no evita controles de integridad ni aprobaciones obligatorias |
| Administrador general | Organización y sucursales delegadas | Usuarios/asignaciones dentro de su delegación, configuración general, catálogo, sucursales y operación | Sin acceso automático a asientos, certificados fiscales, secretos o aprobación de sus propios privilegios |
| Director de operaciones | Organización/sucursales delegadas | Operación, catálogo/surtido, inventario, cocina, delivery y reportes operativos consolidados | Sin contabilización, administración de certificados ni conciliación bancaria por defecto |
| Responsable financiero | Entidades legales autorizadas y sucursales de consulta | Libros, reportes financieros, conciliación, cierres revisables y configuración financiera aprobada | No abre cajones ni registra ventas por el mero rol financiero; las aprobaciones sensibles se separan |
| Gerente de sucursal | Una o más sucursales asignadas | Operación local, personal operativo asignado, mesas, pedidos, disponibilidad/precios locales, supervisión de cajas y reportes locales | No administra otras sucursales ni cambia su propio nivel de privilegio |
| Administrador de sucursal | Sucursal asignada | Configuración operativa local, catálogo local permitido, reservas, inventario y usuarios de bajo privilegio dentro de límites | No cambia parámetros legales/contables ni concede permisos superiores |
| Cajero | Caja/turno asignado dentro de una sucursal | Cobros, apertura/cierre permitidos, consulta de su sesión y registro de movimientos autorizados | Sin gestión de roles, inventario administrativo, reembolsos o aprobación de sus propias diferencias salvo permiso específico |
| Mesero | Sucursal y áreas/mesas asignadas | Crear/actualizar comandas y consultar estado operativo necesario | Sin administración de precios, caja, inventario ni datos financieros no necesarios |
| Cocinero | Sucursal/estaciones asignadas | Consultar tickets KDS y actualizar estados de preparación | Sin datos de pago, administración comercial o caja |
| Responsable de inventario | Almacenes/sucursales asignados | Recepción, conteos, transferencias, trazabilidad y ajustes autorizados | Ajustes de riesgo pueden requerir aprobación distinta del ejecutor |

Esta es una **matriz base de mínimo privilegio**, no una concesión automática a todos los usuarios con ese título. Los permisos finales y quién puede aprobar cada acción deben quedar en una matriz versionada antes de codificar. Los roles personalizados podrán reducir o combinar capacidades dentro de la delegación del administrador, nunca superar sus propios permisos delegables.

**Controles de privilegio y operación**

1. Ningún usuario puede otorgarse roles, ampliar su propia asignación ni modificar una asignación de mayor alcance que sus facultades.
2. Las altas, cambios, expiraciones y revocaciones de roles/permisos generan eventos append-only con actor, objetivo, ámbito, permiso anterior/nuevo, motivo, fecha y correlación.
3. Las operaciones de alto impacto aplican segregación de funciones configurable (por ejemplo, quien solicita no es quien aprueba). Umbrales y excepciones requieren aprobación de negocio.
4. La revocación invalida permisos cacheados y se aplica en la siguiente autorización; las operaciones sensibles consultan versión de autorización vigente.
5. La caché de permisos incluye usuario, ámbito, versión y expiración corta; cambios de asignación incrementan una versión de autorización e invalidan entradas.
6. La identidad y autorización se verifican en backend. RLS, cuando se active, será defensa adicional y se probará con el rol runtime real; nunca reemplazará estas reglas.

**Pruebas obligatorias:** escalamiento horizontal/vertical, asignación expirada, cambio/revocación durante sesión, ámbito padre sin permiso heredable, rol corporativo con permisos limitados, manipulación de IDs, acceso a exportaciones/reportes/jobs, caché después de revocación y concurrencia entre cambios de permisos y operaciones.

### 12.10 Precedencia de moneda, zona horaria y configuración

No se usará una precedencia universal ciega. Cada parámetro tendrá metadatos: ámbitos permitidos, fuente de verdad, regla de herencia, capacidad de override, vigencia, tipo de dato, validación y si representa una restricción legal/de seguridad.

**Regla general de configuración**

- Valores de organización sirven como defaults para nuevas entidades.
- Una entidad legal puede definir sus propios valores dentro de los parámetros permitidos.
- Una sucursal puede sobrescribir parámetros operativos autorizados.
- Una terminal solo puede sobrescribir preferencias del dispositivo (impresora, pantalla, idioma de interfaz, periféricos); nunca moneda contable, impuestos, permisos o reglas legales.
- Cada valor se guarda como \`inherit\`, \`override\` o \`disabled\`, con origen, autor, versión y \`effective_from/effective_until\`. Un valor nulo no significa indistintamente "heredar" o "desactivar".
- Para parámetros fiscales, legales, de seguridad o de integridad, la entidad legal o la política central aplicable es autoritativa; una sucursal no puede debilitarla. Las excepciones necesitan permiso y aprobación explícitos.
- Para parámetros puramente operativos de sucursal, prevalece el override de la sucursal. Los cambios son auditables y no reescriben snapshots de operaciones históricas.

**Moneda**

- Usar códigos ISO 4217 y conservar el código en cada importe; el importe no existe sin moneda. La precisión/escala y redondeo se determinan por moneda y regla de negocio, sin \`float\` ni conversiones a coma flotante.
- La entidad legal define moneda funcional contable y conjunto de monedas de transacción que tiene habilitadas. La sucursal define la moneda operativa predeterminada.
- Una venta usa la moneda operativa de la sucursal solo si está habilitada para la entidad legal responsable. Si no coincide o no está autorizada, el backend rechaza la operación/configuración o exige selección explícita de otra moneda permitida; jamás convierte silenciosamente.
- Separar \`transaction_currency\`, \`functional_currency\` y moneda de liquidación/cobro cuando aplique. El documento de venta conserva importe y moneda originales; el asiento conserva importe funcional y la conversión aplicada.
- Toda conversión financiera guarda snapshot inmutable de moneda origen/destino, tasa, dirección, fuente, fecha/hora, regla de redondeo y usuario/proceso que la aplicó. No se recalcula el pasado cuando cambia una tasa.
- La aceptación de pagos en monedas distintas, cambio entregado y diferencias de cambio se habilita mediante política explícita y submayores por moneda; no se infiere de que una sucursal tenga una moneda configurada.

**Zona horaria y fecha de negocio**

- Guardar instantes técnicos como \`timestamptz\` en UTC. Guardar también el identificador IANA aplicado y el \`business_date\` calculado para operaciones con corte, para que el cambio futuro de configuración no altere el historial.
- La zona horaria de sucursal es la autoridad para horario operativo, turnos, ventas del día y cortes locales. La zona de la entidad legal puede usarse para reportes/plazos legales solo cuando la regla fiscal/contable aplicable lo determine y esté configurada.
- Toda operación conserva \`occurred_at_utc\`, \`branch_timezone_snapshot\` y, cuando aplique, \`legal_timezone_snapshot\` y \`business_date\`.
- Manejar horario de verano y horas locales inexistentes/duplicadas mediante zona IANA; nunca fijar offsets manuales ni depender de la zona horaria del servidor.

**Matriz de precedencia por familia**

| Familia | Fuente autoritativa | Override permitido |
|---|---|---|
| Preferencias corporativas | Organización | Entidad legal y sucursal según definición del parámetro |
| Parámetro operativo local | Sucursal | Terminal solo para preferencias del dispositivo |
| Identidad fiscal, régimen, numeración y moneda funcional | Entidad legal | No por sucursal; excepciones legales documentadas |
| Moneda de transacción predeterminada | Sucursal, validada contra monedas habilitadas de la entidad legal | Selección explícita entre monedas permitidas |
| Zona horaria de operación y fecha de negocio | Sucursal | No por terminal |
| Seguridad y límites mínimos | Política central/organización | Solo se permite endurecer, no debilitar |

### 12.11 Cajas, terminales, sesiones y turnos

Se separan cuatro conceptos que no deben compartir una única tabla o estado:

- \`CashRegister\`: punto/caja física o lógica donde se controla efectivo y conciliación; pertenece a una sola sucursal.
- \`Terminal\`: dispositivo POS registrado, con identidad propia, estado, sucursal asignada y credenciales de dispositivo revocables.
- \`TerminalSession\`: sesión técnica/autenticada de uso del dispositivo; no representa dinero abierto.
- \`CashRegisterSession\`: ciclo financiero de apertura a cierre de una caja, con fondo inicial, movimientos, conteo, diferencias y cierre.
- \`CashierShift\`: turno individual de un cajero/operador, enlazado a la sesión de caja y, cuando corresponda, a una terminal.

**Cardinalidades y concurrencia recomendadas**

- Branch 1:N CashRegister y Branch 1:N Terminal. Cada caja/terminal pertenece a exactamente una sucursal.
- Una terminal tiene como máximo una asignación activa a una caja en un instante. La asignación conserva historial, actor y vigencia; no se cambia mientras exista operación/turno activo.
- Una caja puede operar en modo dedicado (una terminal) o compartido (varias terminales) si se habilita explícitamente. El modo compartido exige ledger transaccional, bloqueo de concurrencia e idempotencia para impedir dobles cobros y dobles movimientos.
- Solo existe una sesión de caja abierta por caja física/lógica a la vez (constraint único parcial sobre sesiones abiertas). Una sesión puede contener varios turnos individuales si la caja opera en modo compartido; cada cajero mantiene identidad y trazabilidad propias.
- La sesión de terminal no abre/cierra la caja automáticamente. Cerrar sesión de un usuario o apagar terminal no liquida ni cierra el efectivo.
- Cada pedido/pago/movimiento registra organización, sucursal, entidad legal responsable, caja, terminal, sesión de caja, turno/actor, moneda, método y referencia idempotente. La entidad legal nunca se deduce solo de la caja.

**Libro de caja y cierre**

- Cada movimiento financiero es append-only y se enlaza a su documento de origen; correcciones por reverso/ajuste, no UPDATE/DELETE de movimientos confirmados.
- Apertura registra actor, hora, moneda, fondo inicial y desglose aprobado. El fondo debe asignarse a un propietario contable explícito.
- Movimientos concurrentes se contabilizan dentro de transacciones con bloqueo de la sesión/cuenta afectada y clave idempotente. El saldo esperado se deriva del ledger, no de un total editable en frontend.
- El cierre detiene nuevas operaciones, exige resolver turnos activos conforme a política, calcula esperado por moneda/medio/entidad legal, registra conteo declarado por denominación, diferencia y motivo, y produce snapshot inmutable.
- Una diferencia no se elimina ni se corrige editando el cierre. Se registra ajuste/reverso con actor, aprobación y auditoría.
- El cierre y la conciliación se separan: cerrar la sesión física no implica que pagos externos/bancarios estén conciliados.

**Particularidad de sucursales con varias entidades legales**

Un mismo local puede vender para varios NIT. Por eso cada venta/movimiento debe conservar \`legal_entity_id\`, y el registro de caja debe poder conciliar submayores por entidad legal y moneda además del efectivo físico total. El fondo de apertura y el efectivo compartido deben tener propietario/criterio de asignación explícito. No se permitirá efectivo sin atribución contable; el tratamiento de fondos compartidos requiere aprobación del responsable financiero antes de activarlo.

**Pruebas obligatorias:** dos terminales cobrando simultáneamente en una caja compartida, dos cajas en la misma sucursal, terminal reasignada con sesión activa, doble envío/reintento, cierre concurrente con cobro, usuario revocado durante turno, diferencia de arqueo, reinicio de proceso, moneda distinta, y operaciones de dos entidades legales en una caja autorizada.

### 12.12 Inspección de PostgreSQL de producción

La inspección será una captura reproducible y **de solo lectura**, antes de cualquier migración. No se usará el usuario propietario de migraciones para tareas exploratorias normales ni se cambiarán roles, grants, políticas, parámetros o datos durante el levantamiento.

Alcance mínimo:
1. Identificar proveedor/host lógico, base, versión exacta y extensiones habilitadas.
2. Inventariar schemas, tablas/particiones, vistas, secuencias, funciones, triggers, índices, constraints y dependencias.
3. Capturar tamaño por base/tabla/índice y estimaciones de filas; los \`COUNT(*)\` exactos se programan selectivamente si el costo/impacto es aceptable.
4. Identificar owners, roles, atributos de rol, membresías, grants, default privileges y rol efectivo de runtime; nunca consultar ni exportar hashes de contraseña de roles.
5. Inspeccionar RLS habilitado/forzado y políticas por tabla; revisar funciones \`SECURITY DEFINER\`, propietario, \`search_path\`, grants y posibles bypass.
6. Revisar transacciones largas, locks, conexiones, replicación y estado de archivado WAL si aplica.
7. Comparar \`schema_migrations\` con los SQL versionados y documentar cualquier diferencia.
8. Registrar relaciones huérfanas y validaciones de integridad con consultas acotadas, sin alterar registros.
9. Obtener un inventario de configuración de backup, frecuencia, retención, cifrado, destino, WAL/PITR y últimas ejecuciones; secretos y URLs con credenciales quedan fuera de la evidencia compartida.

La captura se guarda como artefacto privado con fecha UTC, commit de aplicación asociado, versión PostgreSQL, rol de inspección y huella/hash de los informes. Al PR solo se incorpora un resumen sanitizado: jamás PII, correos, tokens, hashes, cadenas de conexión o datos de clientes.

### 12.13 Backup, restauración y recuperación verificable

La existencia de un archivo o snapshot no constituye evidencia suficiente. El criterio es restaurar en un entorno aislado y verificar que la aplicación y los datos recuperados son consistentes.

**Política técnica recomendada**

- Primero identificar el mecanismo actual (backup administrado, pgBackRest, Barman, WAL-G u otro) y conservarlo si cumple los requisitos; no introducir una herramienta nueva sin evaluar infraestructura, costos y operación.
- Preferir recuperación a un punto en el tiempo (PITR) cuando el proveedor/arquitectura lo soporte, con base backup y cadena WAL íntegra.
- Asegurar cifrado en tránsito y reposo, acceso mínimo, retención protegida frente a borrado accidental, logs de backup y alertas de fallo.
- Respaldar datos y metadatos necesarios para reconstruir roles/permisos/extensiones/configuración, con secretos gestionados aparte y protegidos; nunca adjuntarlos al repositorio.
- Definir RPO y RTO con el negocio según impacto real. No se inventan objetivos numéricos en esta fase.

**Prueba de restauración requerida para cerrar Fase 0**

1. Seleccionar una copia identificada y registrar origen, timestamp, tipo, tamaño y checksum/manifiesto.
2. Crear infraestructura/base aislada, sin ruta de escritura hacia producción, sin tráfico real y con integraciones/webhooks salientes deshabilitados.
3. Restaurar con versión mayor compatible de PostgreSQL y extensiones requeridas; aplicar el procedimiento correspondiente al formato físico o lógico.
4. Verificar finalización sin errores, objetos, owners/grants, extensiones, historial de migraciones, índices, constraints, funciones y políticas.
5. Comparar conteos exactos de tablas críticas, relaciones, agregados financieros/inventario y muestras anonimizadas contra un snapshot de referencia coherente.
6. Ejecutar health checks y un conjunto de consultas/pruebas de lectura de la aplicación contra la restauración. No permitir que el entorno restaurado envíe cobros, emails, webhooks ni notificaciones reales.
7. Medir duración real de restauración y validación, calcular RPO/RTO observado y compararlo con objetivos aprobados.
8. Registrar evidencia, errores, desviaciones y acciones correctivas. Repetir la prueba después de corregir cualquier fallo.

\`pg_verifybackup\` o la inspección de un catálogo \`pg_restore --list\` sirven como verificaciones complementarias del artefacto/formato, pero **no sustituyen una restauración completa y pruebas de consistencia**. Nunca se restaura encima de producción como prueba.

### 12.14 CI de Pull Request separada del despliegue

**Hallazgo del repositorio:** el árbol \`.github/workflows\` en \`main\` contiene solamente \`deploy.yml\`. El workflow se dispara por \`push\` a \`main\`; su job \`build\` instala dependencias y ejecuta \`pnpm --dir backend check\`, typecheck/lint/build del frontend, y después el job \`deploy\` conecta por Tailscale/SSH, ejecuta \`pnpm migrate\` en la VM y activa la versión. No existe un workflow independiente de \`pull_request\`. Los tests \`postgres-repositories.test.js\` usan objetos con un método \`query\` simulado, por lo que no prueban PostgreSQL real.

**Diseño objetivo de CI PR**

- Nuevo workflow independiente que se ejecute en \`pull_request\` hacia \`main\` y en ejecuciones manuales de diagnóstico; permisos mínimos \`contents: read\`, concurrencia por PR y cancelación de ejecuciones obsoletas.
- Node.js 24 y pnpm 12.15.0, coherentes con el workflow actual. Instalar backend y frontend desde sus lockfiles independientes con \`--frozen-lockfile\`.
- Job estático/unitario: comprobación de sintaxis/tests backend, typecheck y lint frontend, build frontend con valores de prueba no productivos y sin credenciales reales.
- Job de integración: PostgreSQL efímero de la misma versión mayor que producción (se confirma en la inspección), Redis de prueba si la suite lo necesita, aplicación de todas las migraciones desde cero, comprobación de upgrade desde el esquema base y tests usando el rol runtime limitado, no el owner de migraciones.
- Suites de integración deben validar constraints, transacciones, RLS cuando esté habilitado, funciones privilegiadas, permisos, aislamiento y concurrencia. Los doubles se conservan para unit tests, no como sustituto de integración.
- Job de frontend/API contract y E2E cuando existan fixtures y entorno local determinista; sin acceder a producción.
- Escaneo de dependencias/secretos y artefactos de diagnóstico sanitizados; nunca imprimir variables sensibles.
- No incluir \`SENTRY_AUTH_TOKEN\`, \`TS_AUTHKEY\`, SSH keys, \`DATABASE_URL\` de producción, environment \`production\`, migraciones productivas ni acciones de deploy en el workflow PR.
- Los servicios de prueba se destruyen al terminar. Ninguna prueba de PR puede conectarse a la red ni al hostname de producción.

**Puertas de merge y CD**

1. Proteger \`main\`: exigir PR, checks obligatorios de CI, revisión aprobada y resolución de conversaciones; deshabilitar bypass administrativo ordinario.
2. El workflow de despliegue queda separado y solo se activa en \`push\` a \`main\` después de un merge que satisfizo las protecciones.
3. Las migraciones productivas siguen siendo una operación de CD, no de CI. Antes de migraciones con impacto de datos deben existir backup restaurado/verificado, plan expand/contract, compatibilidad con versión anterior y procedimiento de recuperación.
4. Para migraciones destructivas o backfills, agregar aprobación manual protegida antes del paso productivo; el rollback de aplicación no revierte por sí solo el esquema/datos.
5. Publicar estados requeridos claros: backend checks, frontend checks/build, PostgreSQL integration/migrations, security checks y E2E cuando aplique.

**Límite de esta fase:** este diseño no crea ni cambia workflows todavía. Primero se aprueba el diseño y se construye un CI PR que no pueda desplegar por construcción.


## 13. Matriz de entregables y evidencia — actualización

Se documentó el detalle técnico de referencia para RBAC, configuración internacional, cajas/terminales, inspección de producción, restauración y CI PR. Los diseños no equivalen a implementación ni a evidencia de ejecución; ver secciones 12.9–12.14 y el [runbook de PostgreSQL y backup](./FASE-0-RUNBOOK-POSTGRES-BACKUP.md).

| Entregable | Resultado de esta revisión | Estado |
|---|---|---|
| Decisión D0-01 — varias entidades legales por organización | Confirmada por el propietario: una organización podrá tener varias empresas/NIT | Respondida |
| Decisión D0-02 — relación sucursal-entidad legal | Confirmada por el propietario: se admiten sucursales vinculadas a una o varias entidades legales (N:M) | Respondida |
| Decisión D0-03 — almacenes y granularidad del inventario | Confirmado: almacenes centrales y locales por sucursal; control por ubicación física y total consolidado por almacén | Respondida |
| Decisión D0-04 — catálogo de productos | Confirmado: catálogo maestro corporativo único; surtido, precio y disponibilidad configurables por sucursal sin duplicar productos | Respondida |
| Decisión D0-05 — usuarios y sucursal activa | Confirmado: un usuario puede tener asignaciones a varias sucursales, seleccionar una al iniciar sesión y cambiarla desde la aplicación; permisos validados por sucursal en backend | Respondida |
| Decisión D0-06 — roles y permisos por ámbito | Catálogos iniciales y diseño RBAC por ámbito, default deny, permisos recurso.acción, límites de delegación y auditoría especificados; aprobación de permisos finales pendiente | Respondida (modelo base); diseño documentado |
| Auditoría estática de código y migraciones versionadas | Revisados composición backend, autenticación, migraciones 001/003/004/005 y módulos actuales en el commit base | Realizado estáticamente |
| Brechas multisucursal | Identificadas en persistencia, autorización, funciones SQL, caché, frontend y pruebas | Realizado |
| Modelo lógico de referencia | Entidades, relaciones y cardinalidades candidatas documentadas | Propuesto; requiere aprobación D0 |
| Matriz de propiedad | Modelo mixto documentado y precedencia por familia propuesta | Diseño de referencia; revisión recurso por recurso pendiente |
| Contexto backend | Contrato conceptual, reglas de resolución y propagación documentados | Diseño de referencia |
| Seguridad | Amenazas IDOR, scope leakage, RLS, cache, jobs y privilegios documentadas | Diseño de referencia |
| Migración | Expand/contract, backfill, verificación y rollback documentados | Plan; requiere acceso a datos reales |
| Pruebas | 15 escenarios de aceptación multisucursal definidos | Especificadas; no ejecutadas |
| Producción/VM/backup | Runbook de inspección read-only y recuperación aislada preparado; no se accedió al entorno ni se ejecutó restauración | Pendiente de ejecución/evidencia |
| CI de PR | Se verificó que el único workflow es deploy.yml (push a main con job de despliegue); arquitectura de CI independiente documentada, workflow aún no creado | Pendiente de implementación |
| Decisiones de negocio D0-01 y D0-02 | Respondidas por el propietario e incorporadas al modelo lógico | Respondidas |
| Decisión D0-03 | Modelo central/local y control de inventario por ubicación más total consolidado del almacén definidos | Respondida |
| Decisión D0-04 | Catálogo maestro corporativo y surtido/precio/disponibilidad por sucursal definidos | Respondida |
| Decisión D0-05 | Asignación de usuarios a varias sucursales y selección/cambio de sucursal activa definidos | Respondida |
| Decisión D0-06 | Modelo corporativo/operativo aceptado; matriz RBAC granular de referencia documentada para revisión y aprobación | Respondida (modelo base) |
| Decisión D0-07 | Cada sucursal podrá operar múltiples cajas registradoras y terminales POS simultáneamente; reglas de sesiones y relación caja-terminal pendientes | Respondida (alcance confirmado) |
| Decisión D0-08 | Cada entidad legal y sucursal puede configurar moneda y zona horaria propias; precedencia entre ámbitos, moneda funcional, conversión y reglas de corte pendientes | Respondida (alcance internacional confirmado) |
| Decisión D0-09 | Tres políticas configurables por producto o sucursal y administradas por usuarios autorizados; permisos y precedencia pendientes | Respondida (políticas aceptadas) |
| Decisión D0-10 | Modelo mixto aceptado: configuración corporativa con ajustes por entidad legal/sucursal; proveedores compartidos con habilitación por ámbito; clientes compartidos con historial por sucursal; promociones corporativas o locales | Respondida (modelo base); precedencia/permisos/detalle de visibilidad pendientes |

## 14. Dictamen de Fase 0

La Fase 0 queda **completada en su componente de análisis estático y diseño técnico de referencia**, pero **no puede declararse cerrada integralmente**.

Bloqueantes para cierre formal:
1. Revisar/aprobar la matriz RBAC y sus perfiles mínimos; cerrar excepciones y permisos delegables.
2. Aprobar la precedencia por familia de configuración, monedas admitidas por entidad legal, reglas de conversión, fecha de negocio y snapshots horarios.
3. Aprobar el modelo de caja compartida, asignación de fondos por entidad legal, operación concurrente y segregación de cierre/aprobación.
4. Ejecutar la inspección de PostgreSQL productivo y validar el runbook con evidencia sanitizada.
5. Restaurar realmente un backup en entorno aislado y validar integridad, RPO/RTO frente a objetivos aprobados.
6. Crear, ejecutar y hacer obligatoria la CI de PR independiente del despliegue; proteger main.
7. Aprobar el diseño lógico, la matriz recurso/ámbito y las decisiones de operación/finanzas que aún dependen de políticas legales locales.

No se creó ni modificó código de aplicación, migraciones, scripts, dependencias, workflows ni infraestructura. Se documentó el diseño técnico de referencia y un runbook de inspección/restauración; no se ejecutaron consultas en la base productiva, pruebas de restauración, pruebas automatizadas ni despliegues. No se debe iniciar la migración multisucursal ni marcar Fase 0 como cerrada hasta adjuntar evidencia de ejecución de todos los bloqueantes.
