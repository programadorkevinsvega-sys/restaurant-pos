# Fase 0 — Auditoría técnica y cimientos multisucursal

> **Estado:** En análisis. Este documento no declara cerrada la Fase 0 ni autoriza cambios de esquema o comportamiento.
> **Base auditada:** `main` en `8b92115223f724f98ee2e41f6c68c95bde57d586`.
> **Modelo comercial confirmado:** una organización/cadena de restaurantes con múltiples sucursales; no un SaaS multi-tenant para restaurantes independientes.
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
├── Entidad legal (una o varias; pendiente de decisión)
│   └── Sucursal(es) asignadas a esa entidad (relación pendiente)
├── Sucursales
│   ├── Cajas / terminales
│   ├── Mesas / áreas
│   └── Almacenes de sucursal
└── Almacenes centrales (si la operación los requiere)
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
| D0-01 | ¿Cuántas entidades legales existen y pueden cambiar en el futuro? | Define contabilidad, impuestos, facturación y relación sucursal-entidad |
| D0-02 | ¿Una sucursal pertenece a una sola entidad legal o puede operar con más de una? | Define cardinalidad y asignación fiscal |
| D0-03 | ¿Habrá almacenes centrales, almacenes por sucursal y ubicaciones internas? | Define inventario, transferencias y abastecimiento |
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
| Modelo organización-entidad legal-sucursal-almacén | Propuesta documentada; pendiente aprobación |
| Matriz de propiedad/ámbito por recurso | Pendiente de decisiones D0-01 a D0-10 |
| Matriz de roles, permisos y asignaciones | Propuesta documentada; pendiente aprobación |
| Estrategia de migración y backfill | Propuesta documentada; requiere datos reales y plan de respaldo |
| Diseño de aislamiento y RLS | Pendiente de diseño detallado y pruebas |
| Pruebas de integración PostgreSQL y aislamiento entre sucursales | Pendiente; no implementadas en esta fase |
| Decisiones de negocio registradas y aprobadas | Pendiente |
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
