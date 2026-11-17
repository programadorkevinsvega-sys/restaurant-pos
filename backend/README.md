# Restaurant POS API

Backend modular con DDD, Clean Architecture, arquitectura hexagonal y SOLID. Los módulos mantienen los límites de dominio y las dependencias apuntan hacia adentro:

```text
src/
  modules/
    auth|catalog|orders|operations|accounting/
      domain/          # Contratos y reglas del dominio
      application/     # Casos de uso
      infrastructure/  # Adaptadores PostgreSQL
      presentation/    # Rutas HTTP, validación y autorización
  shared/
    domain/            # Errores de aplicación
    infrastructure/    # Configuración, logging y proveedores externos
    presentation/      # Middleware HTTP
  migrations/
```

`src/app.js` es la composition root: conecta adaptadores, casos de uso y rutas. Los módulos de negocio y autenticación persisten en PostgreSQL mediante repositorios; Redis se usa para rate limiting distribuido.

## Desarrollo

1. Copia `.env.example` a `.env`, configura `DATABASE_URL`, `MIGRATIONS_DATABASE_URL`, `REDIS_URL`, genera un `AUTH_CSRF_SECRET` único de al menos 32 caracteres y sustituye `CORS_ORIGINS` por el origen exacto del frontend. En el frontend configura `NEXT_PUBLIC_API_URL` con la URL del backend terminada en `/api`. No hay URLs locales predeterminadas. Las credenciales de servicios solo se usan en el backend; nunca las pongas en el frontend.
2. Instala y ejecuta:

   ```sh
   pnpm install
   pnpm dev
   ```

3. API: el origen configurado en `NEXT_PUBLIC_API_URL`; health: `GET /api/health`.
4. Ejecuta las pruebas con `pnpm test`.

Para producción, configura `NODE_ENV=production`, `CORS_ORIGINS` con orígenes explícitos y `REDIS_URL`. Redis comparte el rate limit entre instancias y guarda en caché lecturas públicas de categorías/productos con TTL de 60 segundos. Las escrituras del catálogo avanzan una versión de caché para invalidar las entradas anteriores. Si la caché no está disponible, se registra el fallo y se consulta PostgreSQL; PostgreSQL sigue siendo la fuente de verdad.

La configuración separa `DATABASE_URL` (rol de runtime) de `MIGRATIONS_DATABASE_URL` (rol de migraciones). El runner exige la segunda; nunca usa las credenciales de runtime para aplicar DDL. Las URLs usan usuarios PostgreSQL distintos y no se deben intercambiar.

## Observabilidad con Sentry

- Crea un proyecto Sentry para la API, seleccionando la plataforma **Node.js**, y configura su DSN como `SENTRY_DSN` en el entorno privado del backend. Sin DSN, Sentry no envía eventos.
- Se capturan errores 5xx, trazas de Express/HTTP y consultas PostgreSQL. `SENTRY_TRACES_SAMPLE_RATE` controla el muestreo y tiene un valor predeterminado de `0.1`.
- Se habilita Profiling ligado a las trazas; `SENTRY_PROFILES_SAMPLE_RATE` también tiene un valor predeterminado de `0.1` para limitar el overhead. Ambos valores aceptan números entre `0` y `1`.
- Los logs estructurados de Pino incluyen `trace_id` cuando existe una traza activa. Solo los niveles `warn` y `error` se envían a Sentry Logs; los logs de solicitud `info` permanecen en la salida local.
- Las métricas de Node se recogen cada 30 segundos: memoria del proceso (RSS/heap), CPU del proceso, event loop y uptime. No son métricas completas de la VM y no incluyen temperatura.
- Se deshabilita la recolección automática de identidad, cookies, headers, cuerpos HTTP, query params y parámetros/resultados de consultas SQL. Los atributos de logs con nombres sensibles también se filtran.

## Autenticación y permisos

- El frontend se comunica exclusivamente con la API. Login, renovación y cierre de sesión usan `POST /api/auth/login`, `POST /api/auth/refresh` y `POST /api/auth/logout`; `GET /api/auth/me` devuelve la identidad actual.
- El frontend solo requiere `NEXT_PUBLIC_API_URL` en su propio entorno; no necesita credenciales de PostgreSQL o Redis.
- Las sesiones opacas se guardan en cookies `HttpOnly`; en producción son `Secure` y usan el prefijo `__Host-`. Los access tokens duran 15 minutos y los refresh tokens se rotan y vencen a los 30 días. `AUTH_COOKIE_SAME_SITE` admite `Strict`, `Lax` (predeterminado) o `None`.
- Las solicitudes que modifican datos requieren el token CSRF obtenido en `GET /api/auth/csrf`. El cliente HTTP del frontend lo solicita automáticamente, envía cookies y renueva la sesión una vez ante un 401.
- Los usuarios, hashes de contraseñas y sesiones residen en PostgreSQL. Las contraseñas se hashean con scrypt; el servidor guarda hashes de los tokens y no los valores de sesión.
- No hay registro público. Después de aplicar las migraciones, crea cuentas desde una terminal interactiva con `pnpm user:create admin@example.com admin` o `pnpm user:create staff@example.com staff`; la contraseña se solicita sin mostrarla.
- Genera `AUTH_CSRF_SECRET` de forma aleatoria y mantenlo fuera del repositorio. La clave no debe compartirse entre instalaciones no confiables.
- `CORS_ORIGINS` es obligatoria en todos los entornos y solo acepta los orígenes exactos del frontend, separados por comas. Los orígenes no autorizados se rechazan; producción requiere HTTPS. Las solicitudes sin `Origin` no reciben encabezados CORS, para permitir tráfico same-origin y health checks.
- Si frontend y API están en sitios distintos, configura `AUTH_COOKIE_SAME_SITE=None` y HTTPS en ambos.
- CORS limita el acceso desde navegadores, pero no sustituye autenticación ni autorización: clientes no-browser pueden falsificar el encabezado `Origin`.

- Público: `GET /api/health`, `GET /api/categories` y `GET /api/products`.
- `staff` o `admin` almacenados en PostgreSQL: pedidos, mesas, reservaciones y entregas.
- Solo `admin` almacenado en PostgreSQL: administración de catálogo, configuración e informes contables.
- Los datos personales de reservaciones y entregas no se exponen en las rutas públicas.

Los pedidos `A domicilio` también deben enviar `delivery_address` y `delivery_phone`.

## Migraciones

`pnpm migrate` aplica archivos SQL en orden, dentro de una transacción por archivo, guarda versiones en `schema_migrations`, toma un advisory lock y termina con error si una migración falla. Requiere `MIGRATIONS_DATABASE_URL`; no usa un RPC SQL no estándar ni afirma éxito si no se aplicó.

La migración `004_secure_access_and_use_cases.sql` deshabilita RLS porque solo el backend accede a las tablas, otorga permisos DML al rol `restaurant_pos_app` y concede explícitamente las funciones transaccionales de pedidos, entregas e informes. La migración `005_create_auth_tables.sql` crea usuarios y sesiones. Las migraciones no insertan usuarios, catálogo ni datos de demostración; `backend/scripts/02_insert_sample_data.sql` queda como seed manual opcional.
