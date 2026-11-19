# Fase 1.1 — Organización y datos corporativos

**Módulo:** N09 — Gestión multisucursal  
**Subfase:** N09-F1.1 — Organización y datos corporativos  
**Estado:** En desarrollo / pendiente de CI sobre el HEAD final  
**Rama de trabajo:** `feat/fase-1-1-organizacion-corporativa`

## 1. Objetivo

Introducir en PostgreSQL la identidad corporativa de la cadena y un perfil de datos generales para la instalación de Chili POS. Esta entidad representa la organización propietaria de la cadena, no una entidad legal/fiscal y tampoco un tenant de una plataforma SaaS multiempresa.

El modelo comercial ya aprobado es una cadena perteneciente a una organización, con múltiples sucursales y una o varias entidades legales/NIT. La organización es única por instalación; las entidades legales y sucursales son agregados separados que se incorporarán en subfases posteriores.

## 2. Alcance implementado en esta subfase

- Registro persistente de una única organización por instalación.
- Nombre corporativo obligatorio.
- Nombre comercial opcional.
- Email, teléfono, sitio web y dirección general de sede opcionales.
- Dirección estructurada como JSON con campos de dirección comunes y código de país ISO 3166-1 alpha-2.
- Alta inicial atómica mediante operación PostgreSQL protegida.
- Propietario del perfil registrado explícitamente al completar el alta inicial.
- Lectura autenticada del perfil.
- Actualización parcial del perfil solo por el usuario propietario registrado.
- Timestamps de creación y actualización y referencia al último usuario que actualizó el perfil.
- Contratos HTTP validados con Zod, estrictos frente a campos adicionales.
- Pruebas unitarias y de integración PostgreSQL para permisos, unicidad, propiedad y validación.

## 3. Modelo de persistencia

La migración `006_create_organization_profile.sql` crea `public.organizations` con una restricción de instalación única:

- `installation_slot = 1` y UNIQUE impiden registrar una segunda organización en la misma instalación.
- `owner_user_id` identifica al usuario que completó el bootstrap inicial y tiene FK con `ON DELETE RESTRICT`.
- `updated_by_user_id` conserva el actor de la última actualización.
- Los límites de longitud, valores opcionales y el tipo objeto de la dirección se validan en PostgreSQL.
- El perfil no guarda NIT ni datos fiscales: estos pertenecen a `LegalEntity`, no a `Organization`.

El rol de ejecución `restaurant_pos_app` recibe SELECT, pero no INSERT, UPDATE o DELETE directos sobre la tabla. La escritura se realiza mediante dos funciones PostgreSQL `SECURITY DEFINER`, con `search_path` fijado, privilegios PUBLIC revocados y EXECUTE concedido al rol de aplicación.

### Bootstrap

`bootstrap_organization_profile(..., actor_user_id)`:

1. Comprueba que el actor exista, esté activo y tenga el rol heredado `admin`.
2. Intenta insertar la organización en el único slot permitido.
3. En la misma inserción registra al actor como propietario.
4. Ante dos altas simultáneas, la restricción UNIQUE permite una sola inserción; la otra llamada devuelve cero filas y la API responde conflicto.
5. No transforma el rol global `admin` en un permiso de propietario permanente.

### Actualización

`update_organization_profile(..., actor_user_id)`:

1. Comprueba que el actor siga activo.
2. Exige por lo menos un campo de actualización.
3. Actualiza exclusivamente si `owner_user_id = actor_user_id`.
4. No permite cambiar el propietario desde el contrato de esta subfase.
5. La API hace una comprobación de propiedad en el caso de uso y PostgreSQL repite la protección en la escritura.

## 4. Contrato HTTP

Todas las rutas se publican bajo `/api/organization`. Requieren sesión autenticada, respuesta `Cache-Control: no-store` y la protección CSRF global de los métodos de escritura.

### Consultar perfil

`GET /api/organization`

Respuesta 200:

```json
{
  "organization": {
    "id": "uuid",
    "name": "Chili POS Group",
    "commercial_name": "Chili POS",
    "contact_email": "contact@example.com",
    "contact_phone": "+57 300 000 0000",
    "website_url": "https://example.com",
    "headquarters_address": {
      "line_1": "Calle 1",
      "locality": "Medellín",
      "country_code": "CO"
    },
    "created_at": "2026-11-18T00:00:00.000Z",
    "updated_at": "2026-11-18T00:00:00.000Z"
  }
}
```

Si el bootstrap no ha sucedido, devuelve `404 ORGANIZATION_NOT_INITIALIZED`.

### Alta inicial

`POST /api/organization/bootstrap`

Requiere usuario autenticado con el rol heredado `admin` y el limitador de escritura. Ejemplo:

```json
{
  "name": "Chili POS Group",
  "commercial_name": "Chili POS",
  "contact_email": "contact@example.com",
  "contact_phone": "+57 300 000 0000",
  "website_url": "https://example.com",
  "headquarters_address": {
    "line_1": "Calle 1",
    "locality": "Medellín",
    "administrative_area": "Antioquia",
    "postal_code": "050001",
    "country_code": "CO"
  }
}
```

Devuelve 201 cuando crea el registro. Si ya existe la organización, devuelve 409 `ORGANIZATION_ALREADY_INITIALIZED`. No se permite enviar campos extra como `nit`, `legal_entity`, `branch_id` o `owner_user_id`.

### Actualización parcial

`PATCH /api/organization`

Acepta uno o más campos del contrato de alta, con objeto estricto. Los valores opcionales pueden enviarse como `null` para limpiar el campo. Un objeto vacío se rechaza. Solo el propietario registrado puede actualizar; otro administrador recibe 403 `ORGANIZATION_OWNER_REQUIRED`.

## 5. Seguridad y límites

- La identidad autenticada proviene de la sesión validada en backend; el actor no se acepta desde el cuerpo HTTP.
- El rol heredado `admin` solo sirve como requisito del bootstrap inicial; no es autoridad permanente sobre la organización.
- La propiedad se comprueba en el caso de uso y de nuevo en la función de escritura PostgreSQL.
- La tabla no permite DML directo desde el rol de ejecución.
- No se expone el identificador interno del propietario en el DTO público.
- No se confía en IDs de organización proporcionados por el cliente: esta instalación tiene un único slot.
- La dirección de sede es información corporativa general, no una dirección fiscal por entidad legal.
- No se ha creado una tabla de auditoría histórica completa. `updated_by_user_id` y timestamps son estado actual; N09-F1.5 y la auditoría transversal siguen pendientes.

## 6. Fuera de alcance

Esta subfase no implementa ni autoriza:

- Entidades legales, NIT, datos tributarios o relación N:M sucursal-entidad legal (N09-F1.2).
- Alta/configuración/apertura/suspensión/cierre de sucursales (N09-F1.3).
- Zona horaria, calendario, moneda funcional, moneda operativa, conversiones o reglas de corte (N09-F1.4 y decisiones D0 pendientes).
- Almacenes, usuarios y asignaciones RBAC, roles corporativos/locales ni selector de sucursal (N09-F3).
- Migración o backfill de ventas, mesas, productos, reservas, pedidos o datos productivos.
- Cambios al workflow de despliegue, scripts de paquete o infraestructura.

## 7. Trazabilidad requisito → implementación → prueba

| Requisito | Implementación | Prueba |
|---|---|---|
| Una organización por instalación | UNIQUE + CHECK sobre `installation_slot` | Bootstrap repetido devuelve cero filas |
| Solo administrador activo puede inicializar | Función `SECURITY DEFINER` valida `app_users` | Rechazo SQL con usuario staff |
| Alta inicial atómica | INSERT con conflicto controlado | Ejecuciones de bootstrap concurrentes y resultado único |
| Propietario explícito | `owner_user_id` se asigna en bootstrap | Se comprueba el propietario almacenado |
| No permitir DML directo | GRANT SELECT solamente | Privilegios y UPDATE/DELETE rechazados para rol runtime |
| Solo propietario edita | Caso de uso + función SQL filtra por owner | Unit tests e intento de actualización con no propietario |
| Contrato estricto | Schemas Zod `.strict()` | Casos de email, teléfono, URL, país, campos extra y PATCH vacío |
| Migración reproducible | Runner versionado y transaccional | Migración desde vacío e idempotencia en PG 16/17 |

## 8. Validación y restricciones de despliegue

El workflow de PR debe ejecutar backend, frontend, build y PostgreSQL 16/17 desde una base vacía, incluyendo segunda ejecución idempotente y las pruebas del rol runtime restringido. La subfase no se declara completada hasta que los checks pasen para el HEAD final.

La migración se incorpora únicamente a CI/entornos aislados en esta etapa. **No ejecutar `006_create_organization_profile.sql` en producción** como parte de este trabajo: la inspección productiva y la restauración real de un backup siguen pendientes en Fase 0. No hubo conexión, migración, backfill, despliegue ni modificación de producción en esta subfase.
