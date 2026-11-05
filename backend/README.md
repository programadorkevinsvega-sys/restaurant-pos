# Restaurant POS API

Backend modular con DDD, Clean Architecture, arquitectura hexagonal y SOLID. Los módulos mantienen los límites de dominio y las dependencias apuntan hacia adentro:

```text
src/
  modules/
    catalog|orders|operations|accounting/
      domain/          # Contratos y reglas del dominio
      application/     # Casos de uso
      infrastructure/  # Adaptadores Supabase
      presentation/    # Rutas HTTP, validación y autorización
  shared/
    domain/            # Errores de aplicación
    infrastructure/    # Configuración, logging y proveedores externos
    presentation/      # Middleware HTTP
  migrations/
```

`src/app.js` es la composition root: conecta adaptadores, casos de uso y rutas. Los casos de uso dependen de contratos, no de Express ni de Supabase; Supabase y Redis son adaptadores intercambiables.

## Desarrollo

1. Copia `.env.example` a `.env`, configura las credenciales del backend y sustituye `CORS_ORIGINS` por el origen exacto del frontend (esquema, host y puerto, sin ruta). En el frontend configura `NEXT_PUBLIC_API_URL` con la URL del backend terminada en `/api`. No hay URLs locales predeterminadas; ambos valores deben configurarse explícitamente. Las claves de Supabase solo se usan en el servidor; nunca las pongas en el frontend.
2. Instala y ejecuta:

   ```sh
   pnpm install
   pnpm dev
   ```

3. API: el origen configurado en `NEXT_PUBLIC_API_URL`; health: `GET /api/health`.
4. Ejecuta las pruebas con `pnpm test`.

Para producción, configura `NODE_ENV=production`, `CORS_ORIGINS` con orígenes explícitos y `REDIS_URL`. Redis comparte el rate limit entre instancias; el fallback en memoria solo es para desarrollo de una instancia. Define `DATABASE_URL` únicamente en el entorno que ejecuta migraciones, y usa una conexión PostgreSQL privada/de pooler apropiada.

## Autenticación y permisos

- El frontend se comunica exclusivamente con la API. Login, renovación y cierre de sesión usan `POST /api/auth/login`, `POST /api/auth/refresh` y `POST /api/auth/logout`; `GET /api/auth/me` devuelve la identidad actual.
- El frontend solo requiere `NEXT_PUBLIC_API_URL` en su propio entorno; no necesita URL, publishable key ni otra credencial de Supabase.
- Los tokens de Supabase se guardan en cookies `HttpOnly`; en producción son `Secure` y usan el prefijo `__Host-`. `AUTH_COOKIE_SAME_SITE` admite `Strict`, `Lax` (predeterminado) o `None`.
- Las solicitudes que modifican datos requieren el token CSRF obtenido en `GET /api/auth/csrf`. El cliente HTTP del frontend lo solicita automáticamente, envía cookies y renueva la sesión una vez ante un 401.
- `CORS_ORIGINS` es obligatoria en todos los entornos y solo acepta los orígenes exactos del frontend, separados por comas. Los orígenes no autorizados se rechazan; producción requiere HTTPS. Las solicitudes sin `Origin` no reciben encabezados CORS, para permitir tráfico same-origin y health checks.
- Si frontend y API están en sitios distintos, configura `AUTH_COOKIE_SAME_SITE=None` y HTTPS en ambos.
- CORS limita el acceso desde navegadores, pero no sustituye autenticación ni autorización: clientes no-browser pueden falsificar el encabezado `Origin`.

- Público: `GET /api/health`, `GET /api/categories` y `GET /api/products`.
- `staff` o `admin` en el claim `app_metadata.role`: pedidos, mesas, reservaciones y entregas.
- Solo `admin` en `app_metadata.role`: administración de catálogo, configuración e informes contables.
- El rol se lee únicamente de `app_metadata`; nunca se acepta `user_metadata` como autorización. Asigna el rol desde un entorno administrativo confiable mediante Supabase Auth.
- Los datos personales de reservaciones y entregas no se exponen en las rutas públicas.

Los pedidos `A domicilio` también deben enviar `delivery_address` y `delivery_phone`.

## Migraciones

`pnpm migrate` aplica archivos SQL en orden, dentro de una transacción por archivo, guarda versiones en `schema_migrations`, toma un advisory lock y termina con error si una migración falla. Requiere `DATABASE_URL`; no usa un RPC SQL no estándar ni afirma éxito si no se aplicó.

La migración `004_secure_access_and_use_cases.sql` retira las políticas permisivas existentes, restringe RLS a lectura pública de catálogo y añade funciones transaccionales con permisos limitados para creación de pedidos, asignación de repartidores e informes. Revisa y respalda tu base de datos antes de aplicar cambios a un entorno existente.
