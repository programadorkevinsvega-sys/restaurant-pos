# CI/CD y despliegue en la VM

El workflow `.github/workflows/deploy.yml` solo se ejecuta en `push` a `main`: instala dependencias con los lockfiles, corre las pruebas/checks y compila Next.js. Después aplica las migraciones versionadas de PostgreSQL y, solo si terminan correctamente, publica el artefacto por Tailscale/SSH y activa la versión con PM2. El despliegue se bloquea si una migración falla.

## Arquitectura de red

- El dominio público sirve el frontend en `https://sistemapost.jnmtortas.com`.
- El frontend solicita la API en `https://sistemapost.jnmtortas.com/api`; Nginx en la VM de proxy reenvía `/api` a `http://IP_PRIVADA_VM_APP:3001` y el resto a `http://IP_PRIVADA_VM_APP:3002`.
- El backend no debe exponerse directamente a Internet. En el firewall de la VM de aplicación permite los puertos de aplicación únicamente desde la VM Nginx y SSH desde Tailscale.
- En el entorno de backend de producción, `CORS_ORIGINS` debe contener el origen exacto del frontend (`https://sistemapost.jnmtortas.com`). Mantén `AUTH_COOKIE_SAME_SITE=Lax`.
- CORS controla qué páginas pueden leer respuestas desde un navegador; no autentica clientes ni sustituye el firewall. La restricción de red de los puertos de aplicación es la que mantiene privado el backend.

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
- `/etc/apps/restaurant-post-supabase/restaurant-post-supabase.env`, con los valores de producción requeridos por el backend. El archivo queda fuera de las versiones desplegadas y nunca se copia desde GitHub Actions; el script crea un enlace simbólico desde cada release.
- Los servicios PM2 deben poder persistir tras reiniciar la VM: ejecuta una vez `pm2 startup` y luego `pm2 save` con el usuario de despliegue.

El archivo de entorno de la VM requiere `NODE_ENV=production`, `PORT=3001`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS` con el origen exacto del frontend, `AUTH_COOKIE_SAME_SITE=Lax` y `REDIS_URL`. `DATABASE_URL` va únicamente como secreto del entorno `production` en GitHub Actions para las migraciones; no es necesaria para arrancar la API. Protege el archivo como `root:ubuntu` con modo `640` y el directorio como `root:ubuntu` con modo `750`, para que solo root lo modifique y el usuario de despliegue pueda leerlo.

Los nombres PM2 creados por `ecosystem.config.cjs` son `restaurant-pos-backend` (puerto 3001) y `restaurant-pos-frontend` (puerto 3002, porque el 3000 ya está ocupado en tu VM). El BFF existente en `8080` no se modifica. PM2 escucha en la VM; controla el acceso a esos puertos mediante firewall.

## Preparar GitHub

Sube el proyecto a un repositorio GitHub y establece `main` como rama de producción. En **Settings → Secrets and variables → Actions**, configura estas variables:

Para obtener y cargar secretos, generar y verificar las claves SSH, y preparar la VM paso a paso, consulta [CONFIGURAR-SECRETS-GITHUB.md](./CONFIGURAR-SECRETS-GITHUB.md).

| Variable | Valor |
|---|---|
| `DEPLOY_HOST` | IP o nombre Tailscale de la VM de aplicación |
| `DEPLOY_USER` | `ubuntu` (o el usuario de despliegue elegido) |
| `DEPLOY_PATH` | `/opt/apps/restaurant-pos` |
| `FRONTEND_ORIGIN` | `https://sistemapost.jnmtortas.com` |
| `NEXT_PUBLIC_API_URL` | `https://sistemapost.jnmtortas.com/api` |

Configura estos secretos de Actions:

| Secreto | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL de Supabase para el job de migraciones. Usa el pooler en modo **Session** si la conexión directa no es accesible; no uses Transaction mode porque el migrador toma un advisory lock de sesión. |
| `TS_AUTHKEY` | Auth key dedicada de Tailscale con el tag `tag:ci`; no es un API access token |
| `DEPLOY_SSH_KEY` | Clave privada de despliegue dedicada; no reutilices una clave personal |
| `DEPLOY_KNOWN_HOSTS` | Entrada de `known_hosts` verificada para la VM de destino |

Genera `TS_AUTHKEY` desde **Tailscale → Settings → Keys** como Auth key, con `tag:ci` y expiración configurada; una key ephemeral es adecuada para runners temporales. No uses un API access token. Autoriza en la ACL de Tailscale que `tag:ci` alcance únicamente SSH de la VM de aplicación. Instala la clave pública correspondiente a `DEPLOY_SSH_KEY` en `~ubuntu/.ssh/authorized_keys` (o en el usuario elegido). Obtén la huella SSH de la VM por un canal confiable para construir `DEPLOY_KNOWN_HOSTS`; no confíes sin verificar en la salida de `ssh-keyscan`.

En **Settings → Environments**, crea el entorno `production`; opcionalmente exige aprobación antes del despliegue. Cada push a `main` que pase checks construirá y desplegará automáticamente.

El secreto `DATABASE_URL` debe apuntar al mismo proyecto Supabase que utiliza la aplicación. Nunca lo pongas en variables públicas, archivos versionados ni en `NEXT_PUBLIC_*`. El job solo necesita acceso al esquema para ejecutar migraciones; no pases las claves de Supabase Auth/`service_role` a GitHub Actions.

## Despliegue y rollback

Cada artefacto se instala en una carpeta versionada dentro de `releases/`; `current` apunta a la versión activa. El script valida el backend y frontend después de activar PM2 y revierte al release anterior si no responden. Revisa la salida de la acción y los logs PM2 si falla.

Las migraciones se ejecutan automáticamente antes del despliegue. El migrador registra cada archivo aplicado en `public.schema_migrations`, toma un advisory lock y ejecuta cada archivo pendiente dentro de una transacción. Revisa y prueba los archivos SQL antes de fusionarlos a `main`; para cambios destructivos, usa un backup y migraciones compatibles con el release actual.
