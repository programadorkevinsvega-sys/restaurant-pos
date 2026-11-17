# CI/CD y despliegue en la VM

El workflow `.github/workflows/deploy.yml` solo se ejecuta en `push` a `main`: instala dependencias con los lockfiles, corre las pruebas/checks y compila Next.js. Después aplica las migraciones versionadas de PostgreSQL y, solo si terminan correctamente, publica el artefacto por Tailscale/SSH y activa la versión con PM2. El despliegue se bloquea si una migración falla.

## Arquitectura de red

- El dominio público sirve el frontend en `https://post.vegtrixgroup.com`.
- El frontend solicita la API en `https://post.vegtrixgroup.com/api`; Nginx en la VM de proxy reenvía `/api` a `http://IP_PRIVADA_VM_APP:3001` y el resto a `http://IP_PRIVADA_VM_APP:3002`.
- El backend no debe exponerse directamente a Internet. En el firewall de la VM de aplicación permite los puertos de aplicación únicamente desde la VM Nginx y SSH desde Tailscale.
- En el entorno de backend de producción, `CORS_ORIGINS` debe contener el origen exacto del frontend (`https://post.vegtrixgroup.com`). Mantén `AUTH_COOKIE_SAME_SITE=Lax`.
- `TRUSTED_PROXY_IP` debe ser la IP privada exacta de la VM Nginx que conecta con el backend (en la topología actual: `10.0.2.82`). El limitador solo usa `CF-Connecting-IP` cuando la conexión TCP proviene de esa IP; Nginx debe preservar el encabezado que Cloudflare envía. No habilites `trust proxy=true` ni confíes en encabezados reenviados de clientes directos.
- CORS controla qué páginas pueden leer respuestas desde un navegador; no autentica clientes ni sustituye el firewall. La restricción de red de los puertos de aplicación es la que mantiene privado el backend.
- La ruta principal muestra el formulario de inicio de sesión cuando no existe una sesión válida. No hay registro público: crea las cuentas mediante `pnpm user:create <correo> [staff|admin]` después de aplicar las migraciones.

En el `server` HTTPS existente de Nginx, configura los locations con el IP privado real de la VM de aplicación:

```nginx
location = /api {
    proxy_pass http://IP_PRIVADA_VM_APP:3001/api;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /api/ {
    proxy_pass http://IP_PRIVADA_VM_APP:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://IP_PRIVADA_VM_APP:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Valida la configuración y recarga Nginx después de instalar los locations. No abras los puertos `3000` ni `3001` a Internet.

## Preparar la VM de aplicación (una sola vez)

Usa un usuario dedicado de despliegue (la configuración indicada es `ubuntu`) y prepara:

- Node.js 24 o superior, pnpm 12.15.0, PM2, `curl` y `tar`.
- El directorio `/opt/apps/restaurant-pos`, escribible por el usuario de despliegue.
- `/etc/apps/restaurant-pos/restaurant-pos.env`, con los valores de producción requeridos por el backend. El archivo queda fuera de las versiones desplegadas y nunca se copia desde GitHub Actions; el script crea un enlace simbólico desde cada release.
- Los servicios PM2 deben poder persistir tras reiniciar la VM: ejecuta una vez `pm2 startup` y luego `pm2 save` con el usuario de despliegue.

El archivo de entorno de la VM requiere `NODE_ENV=production`, `PORT=3001`, `DATABASE_URL` con el rol `restaurant_pos_app`, un `AUTH_CSRF_SECRET` aleatorio de al menos 32 caracteres, `CORS_ORIGINS=https://post.vegtrixgroup.com`, `AUTH_COOKIE_SAME_SITE=Lax`, `REDIS_URL` y `TRUSTED_PROXY_IP=10.0.2.82` (ajústala si cambia la IP privada de Nginx). Para Sentry, añade el `SENTRY_DSN` del proyecto Node.js de la API y, opcionalmente, `SENTRY_TRACES_SAMPLE_RATE` y `SENTRY_PROFILES_SAMPLE_RATE` (ambos predeterminados en `0.1`). No configures el DSN del backend como variable `NEXT_PUBLIC_*`. En cada despliegue, el workflow entrega ese mismo `CORS_ORIGINS` al proceso de backend mediante el entorno de PM2. Protege el archivo como `root:ubuntu` con modo `640` y el directorio como `root:ubuntu` con modo `750`, para que solo root lo modifique y el usuario de despliegue pueda leerlo.

El workflow exige `MIGRATIONS_DATABASE_URL` con el rol `restaurant_pos_migrator`; la API usa `DATABASE_URL` con `restaurant_pos_app`. Nunca uses el usuario de runtime para migraciones ni el de migraciones en la API.

Los nombres PM2 creados por `ecosystem.config.cjs` son `restaurant-pos-backend` (puerto 3001) y `restaurant-pos-frontend` (puerto 3002, porque el 3000 ya está ocupado en tu VM). El BFF existente en `8080` no se modifica. PM2 escucha en la VM; controla el acceso a esos puertos mediante firewall.

## Preparar GitHub

Sube el proyecto a un repositorio GitHub y establece `main` como rama de producción. En **Settings → Secrets and variables → Actions**, configura estas variables:

Para obtener y cargar secretos, generar y verificar las claves SSH, y preparar la VM paso a paso, consulta [CONFIGURAR-SECRETS-GITHUB.md](./CONFIGURAR-SECRETS-GITHUB.md).

| Variable | Valor |
|---|---|
| `DEPLOY_HOST` | IP o nombre Tailscale de la VM de aplicación |
| `DEPLOY_USER` | `ubuntu` (o el usuario de despliegue elegido) |
| `DEPLOY_PATH` | `/opt/apps/restaurant-pos` |

El workflow define `FRONTEND_ORIGIN=https://post.vegtrixgroup.com` y `NEXT_PUBLIC_API_URL=https://post.vegtrixgroup.com/api` directamente. No son variables de Actions que debas mantener por separado.

Configura estos secretos de Actions:

| Secreto | Uso |
|---|---|
| `MIGRATIONS_DATABASE_URL` | Rol `restaurant_pos_migrator` para la base PostgreSQL independiente. |
| `TS_AUTHKEY` | Auth key dedicada de Tailscale con el tag `tag:ci`; no es un API access token |
| `DEPLOY_SSH_KEY` | Clave privada de despliegue dedicada; no reutilices una clave personal |
| `DEPLOY_KNOWN_HOSTS` | Entrada de `known_hosts` verificada para la VM de destino |

Genera `TS_AUTHKEY` desde **Tailscale → Settings → Keys** como Auth key, con `tag:ci` y expiración configurada; una key ephemeral es adecuada para runners temporales. No uses un API access token. Autoriza en la ACL de Tailscale que `tag:ci` alcance únicamente SSH de la VM de aplicación. Instala la clave pública correspondiente a `DEPLOY_SSH_KEY` en `~ubuntu/.ssh/authorized_keys` (o en el usuario elegido). Obtén la huella SSH de la VM por un canal confiable para construir `DEPLOY_KNOWN_HOSTS`; no confíes sin verificar en la salida de `ssh-keyscan`.

En **Settings → Environments**, crea el entorno `production`; opcionalmente exige aprobación antes del despliegue. Cada push a `main` que pase checks construirá y desplegará automáticamente.

Los secretos de base de datos nunca deben ponerse en variables públicas, archivos versionados ni en `NEXT_PUBLIC_*`. El job solo necesita la conexión de migración; `DATABASE_URL` y `AUTH_CSRF_SECRET` se configuran únicamente en el entorno privado de la VM. El runner requiere una conexión con soporte de advisory locks de sesión, no un pooler en modo Transaction.

## Despliegue y rollback

El workflow `.github/workflows/deploy.yml` contiene los pasos del despliegue: instala cada artefacto en una carpeta versionada dentro de `releases/`, actualiza `current`, reinicia PM2 y valida el backend y frontend. Si la activación o las comprobaciones de salud fallan, restaura el release anterior. Revisa la salida de la acción y los logs PM2 si falla.

Las migraciones se ejecutan automáticamente antes del despliegue. El migrador registra cada archivo aplicado en `public.schema_migrations`, toma un advisory lock y ejecuta cada archivo pendiente dentro de una transacción. Revisa y prueba los archivos SQL antes de fusionarlos a `main`; para cambios destructivos, usa un backup y migraciones compatibles con el release actual.
