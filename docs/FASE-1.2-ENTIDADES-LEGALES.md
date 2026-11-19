# Fase 1.2 — Entidades legales y relación con sucursales

**Módulo:** N09 — Gestión multisucursal  
**Subfase:** N09-F1.2 — Entidades legales y relación con sucursales  
**Estado:** En validación CI  
**Rama:** `feat/fase-1-2-entidades-legales`

## 1. Objetivo

Permitir que una organización registre varias entidades legales, cada una con su propia identificación tributaria, y declarar explícitamente qué entidades legales pueden operar en cada sucursal.

La relación es N:M: una entidad legal puede estar habilitada en varias sucursales y una sucursal puede operar con una o varias entidades legales. Los registros pertenecen siempre a la misma organización.

## 2. Modelo de datos

### `legal_entities`

Cada registro pertenece a la única organización de la instalación e incluye:

- Razón social / nombre legal.
- Nombre comercial opcional.
- País emisor del identificador tributario (`tax_country_code`, ISO 3166-1 alpha-2).
- Tipo de identificador (`tax_identifier_type`: NIT, RFC, RUC, TIN u otro código).
- Valor del identificador (`tax_identifier`).
- Domicilio registrado opcional.
- Datos de contacto opcionales.
- Actor de creación/última modificación y timestamps.

La unicidad del identificador se aplica dentro de la organización por país, tipo y valor normalizado a mayúsculas y sin espacios externos. Se conserva el valor introducido, incluida su puntuación interna. No se ejecutan validadores de dígito de control ni normalizaciones tributarias específicas por país.

### `branches`

Esta subfase introduce la identidad mínima necesaria para relacionar una sucursal con sus entidades legales:

- Código único dentro de la organización.
- Nombre de sucursal.
- Actor de creación/última modificación y timestamps.

No se introducen todavía estado operativo, dirección de local, horarios, apertura, suspensión, cierre, zona horaria ni calendario. Corresponden a N09-F1.3 y N09-F1.4.

### `branch_legal_entities`

Tabla de relación con clave primaria compuesta `(organization_id, branch_id, legal_entity_id)`.

- Claves foráneas compuestas obligan a que sucursal y entidad legal pertenezcan a la misma organización.
- Una sucursal se crea con al menos una entidad legal.
- Una sucursal debe conservar al menos una entidad asociada.
- Las relaciones duplicadas se rechazan.
- Una entidad puede asociarse con múltiples sucursales y una sucursal puede tener múltiples entidades.

No se establece una entidad legal predeterminada: esa decisión no fue aprobada y cada operación futura deberá seleccionar explícitamente su responsable cuando aplique.

## 3. Contratos HTTP

Todas las rutas requieren sesión autenticada, pasan por el limitador de escritura cuando modifican datos y reciben el actor autenticado desde el backend. No aceptan `organization_id` del cliente.

### Entidades legales

| Método y ruta | Función |
|---|---|
| `GET /api/legal-entities` | Listar entidades y capacidad `permissions.can_manage` |
| `POST /api/legal-entities` | Registrar una entidad legal |
| `PUT /api/legal-entities/:id` | Reemplazar los datos de una entidad legal |

Ejemplo de alta:

```json
{
  "legal_name": "Restaurantes de Colombia S.A.S.",
  "commercial_name": "Chili Colombia",
  "tax_country_code": "CO",
  "tax_identifier_type": "NIT",
  "tax_identifier": "900123456-7",
  "registered_address": {
    "line_1": "Calle 1",
    "locality": "Medellín",
    "country_code": "CO"
  },
  "contact_email": "legal@example.com",
  "contact_phone": "+57 300 000 0000"
}
```

### Sucursales

| Método y ruta | Función |
|---|---|
| `GET /api/branches` | Listar sucursales y sus entidades legales |
| `POST /api/branches` | Crear identidad mínima y sus asociaciones en una sola operación |
| `PUT /api/branches/:branchId` | Actualizar código y nombre |
| `POST /api/branches/:branchId/legal-entities/:legalEntityId` | Asociar una entidad |
| `DELETE /api/branches/:branchId/legal-entities/:legalEntityId` | Retirar una asociación, si queda al menos otra |

Ejemplo de alta:

```json
{
  "code": "BOG-01",
  "name": "Chili Bogotá Centro",
  "legal_entity_ids": [
    "uuid-entidad-legal-1",
    "uuid-entidad-legal-2"
  ]
}
```

El alta de sucursal y la creación de todas sus asociaciones se ejecutan en una función PostgreSQL única y atómica. Si el código ya existe, si se repiten IDs o si alguna entidad no pertenece a la organización, no se crea una sucursal parcial.

## 4. Autorización y seguridad

- Todas las lecturas requieren autenticación.
- Para listar o escribir entidades legales y sucursales se exige que el actor sea el propietario explícito de la organización registrado en N09-F1.1, y que continúe activo. Así los NIT y las asociaciones no se exponen a personal operativo mientras N09-F3 no ofrezca permisos RBAC por ámbito.
- El rol legado `admin` por sí solo no permite administrar entidades legales ni sucursales.
- Esta política es transitoria y explícita mientras N09-F3 implementa RBAC por ámbito; no se interpreta como la matriz final de roles corporativos/locales.
- `restaurant_pos_app` tiene SELECT sobre las tres tablas y no recibe INSERT, UPDATE ni DELETE directos.
- Las escrituras pasan por funciones `SECURITY DEFINER` con `search_path = pg_catalog`, nombres de tablas completamente cualificados y privilegios PUBLIC revocados.
- Las funciones verifican de nuevo el propietario y el ámbito en PostgreSQL.
- No se expone ni acepta un ID de organización desde el cliente.
- No hay endpoints de borrado de entidades legales ni sucursales; se preservan las referencias para operaciones futuras.
- Las operaciones concurrentes de retiro de asociaciones bloquean la fila de sucursal y garantizan que nunca se retire la última entidad legal.

## 5. Límites funcionales deliberados

Esta fase no configura:

- Régimen tributario, responsabilidades fiscales, actividades económicas, tarifas, exenciones, retenciones o calendarios fiscales.
- Proveedor de facturación electrónica, certificados, resolución de numeración o contingencias.
- Moneda funcional, moneda transaccional, tipos de cambio ni zona horaria.
- Domicilio operativo, estado, horarios, apertura, suspensión o cierre de sucursales.
- Selector de sucursal activa, roles corporativos/locales, asignaciones de usuarios o delegación RBAC.
- Almacenes, inventario, catálogo compartido o configuración por sucursal.

Estos asuntos pertenecen a N09-F1.3/F1.4, N09-F3, N09-F2 y a las líneas de Finanzas/Impuestos/Facturación del roadmap.

## 6. Transacciones existentes y responsabilidad fiscal

La decisión D0-02 establece que cada operación fiscal/financiera debe identificar una única entidad legal responsable. Esta migración no modifica `orders`, no reasigna pedidos históricos y no inventa una entidad emisora para ventas existentes.

El POS actual todavía no tiene contexto de sucursal activa en el flujo de pedidos. Por ello, la selección obligatoria de entidad legal en cada operación de venta/cobro debe integrarse con el contexto de sucursal y su lista de entidades habilitadas antes de habilitar flujos fiscales/financieros multisucursal. Esto se debe resolver en la integración operativa posterior; no se declara implementado por el solo hecho de crear la relación N:M.

No ejecutar backfills, asignaciones retroactivas ni documentos fiscales a partir de supuestos.

## 7. Trazabilidad requisito → implementación → prueba

| Requisito | Implementación | Evidencia de prueba |
|---|---|---|
| Una organización tiene varias entidades legales | `legal_entities.organization_id` | Alta de dos NIT para la misma organización |
| Identificador por país/tipo/valor | Check constraints + índice único compuesto | Duplicado de NIT devuelve cero filas |
| Identificador tributario internacional | Código país ISO + tipo (NIT/RFC/RUC/TIN) | Validación de país y esquema en Zod |
| Una sucursal puede tener una o varias entidades | Alta atómica con UUID[] | Alta de sucursal con dos entidades |
| N:M | `branch_legal_entities` | Asociaciones dobles y varias sucursales posibles |
| No cruzar organizaciones | FK compuestas por `organization_id` | Entidad ajena rechazada por la función de alta |
| Una sucursal no queda sin entidad | Lock de sucursal + conteo en retiro | Dos retiros simultáneos: uno elimina y el otro preserva la última |
| No DML directo desde runtime | Grants SELECT; funciones SECURITY DEFINER | Privilegios y rechazo de INSERT/UPDATE/DELETE directos |
| Solo propietario administra | Validación en casos de uso y funciones SQL | Actor no propietario rechazado |
| Reproducibilidad | Migración `007` versionada | Migración desde cero e idempotencia en PG 16/17 |

## 8. Validación y despliegue

El workflow de PR debe ejecutar:

1. Backend syntax y pruebas unitarias.
2. Frontend typecheck, lint y build.
3. Migración desde una base vacía e idempotencia en PostgreSQL 16 y 17.
4. Pruebas de permisos, integridad, asociaciones y concurrencia mediante el rol runtime restringido.

La migración `007_create_legal_entities_and_branch_relations.sql` solo se ejecuta en CI y bases aisladas durante esta fase. No aplicar a producción ni ejecutar backfills hasta tener inspección productiva y restauración de backup verificada, pendientes de Fase 0.

La fase se considera validada cuando todos los checks aprueben el HEAD final del PR. La integración en `main` y el despliegue siguen sujetos a revisión y autorización explícita.
