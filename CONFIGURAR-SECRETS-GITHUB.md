# Configurar secretos de GitHub Actions

Esta guía configura el acceso del workflow de producción a Supabase y a la VM. El workflow solo corre al hacer `push` a `main`; primero valida y compila, después aplica migraciones y, si estas terminan bien, despliega por Tailscale/SSH.

> **No pegues claves, contraseñas, cadenas de conexión ni archivos `.pem` en el repositorio, issues, logs o chats.** Los secretos se ingresan directamente en la interfaz de GitHub.

## 1. Abrir el entorno de producción

En GitHub, abre el repositorio `programadorkevinsvega-sys/restaurant-pos` y navega a:

**Settings → Environments → production**

Agrega los siguientes valores en **Environment secrets**. No los agregues como variables:

| Secret | Valor |
|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL de Supabase para el job de migraciones. |
| `TS_AUTHKEY` | Auth key dedicada de Tailscale para conectar el runner de GitHub Actions. |
| `DEPLOY_SSH_KEY` | Clave privada SSH dedicada a GitHub Actions. |
| `DEPLOY_KNOWN_HOSTS` | Clave pública de host SSH de la VM, después de verificar su huella. |

El entorno `production` ya está creado. El workflow de migraciones y el de despliegue usan este entorno.

## 2. Obtener `DATABASE_URL` de Supabase

1. Abre el proyecto Supabase de Restaurant POS.
2. En **Connect**, busca la conexión PostgreSQL y elige **Session pooler** si la conexión directa no es accesible desde GitHub Actions.
3. Usa el modo **Session**, no **Transaction**: el migrador utiliza un advisory lock de sesión.
4. Copia la cadena PostgreSQL completa y guárdala en GitHub como `DATABASE_URL`.
5. Si Supabase te muestra una contraseña como marcador, reemplaza el marcador localmente antes de guardarla. Nunca la compartas ni la imprimas en la terminal.

La cadena debe apuntar al mismo proyecto de Supabase que usa la aplicación. Este secreto se utiliza para las migraciones; no es una variable del frontend.

## 3. Crear la Auth key de Tailscale

1. En la consola de administración de Tailscale, abre **Settings → Keys** (`https://console.tailscale.com/admin/settings/keys`).
2. Crea una **Auth key** dedicada para este workflow. No crees ni uses un **API access token**: ese token sirve para llamar a la API de administración de Tailscale y no conecta el runner al tailnet.
3. Configura la Auth key con el tag `tag:ci` y con expiración corta razonable. Si aparece la opción **Ephemeral**, actívala para que los runners temporales de GitHub no queden como dispositivos permanentes. No la hagas reusable salvo que tu flujo de rotación lo requiera.
4. Copia la Auth key directamente al secret `TS_AUTHKEY` de GitHub. Tailscale la muestra una sola vez; no la pegues en el repositorio, terminales compartidas o chats.
5. En la política de acceso de Tailscale, permite que `tag:ci` llegue por TCP/22 únicamente a la VM de aplicación. Usa o asigna a esa VM el tag de destino apropiado. No autorices acceso general al tailnet.

Si ya generaste una Auth key para otro despliegue, es más seguro crear una dedicada para Restaurant POS para poder revocarla sin afectar otros servicios.

## 4. Crear una clave SSH dedicada para el deploy

En tu PC, genera una clave separada de `servidor-07.pem`; no reutilices ni subas la clave personal:

```bash
ssh-keygen -t ed25519 -C "restaurant-pos-github-actions" -f restaurant-pos-actions -N ""
```

Se crean dos archivos:

- `restaurant-pos-actions`: **privado**. Copia su contenido completo directamente al secret `DEPLOY_SSH_KEY` en GitHub. Es una clave sin passphrase para que Actions pueda usarla automáticamente; protégela estrictamente en GitHub.
- `restaurant-pos-actions.pub`: **público**. Instala su única línea en `/home/ubuntu/.ssh/authorized_keys` en la VM:

```bash
mkdir -p /home/ubuntu/.ssh
chmod 700 /home/ubuntu/.ssh
printf '%s\n' 'PEGA_AQUI_LA_LINEA_PUBLICA_DE_restaurant-pos-actions.pub' >> /home/ubuntu/.ssh/authorized_keys
chmod 600 /home/ubuntu/.ssh/authorized_keys
```

Ejecuta esos comandos en la VM como `ubuntu` o con permisos administrativos, sustituyendo el marcador por la línea del archivo `.pub`. La clave privada no se copia a la VM.

El usuario `ubuntu` debe poder escribir en `/opt/apps/restaurant-pos` y ejecutar PM2 sin interacción. No des permisos `sudo` más amplios de los necesarios.

## 5. Verificar la huella y configurar `DEPLOY_KNOWN_HOSTS`

Este paso verifica la identidad SSH de la VM para evitar confiar ciegamente en `ssh-keyscan`.

1. Conéctate directamente a la VM por el canal que ya usas y, allí, consulta la huella de su clave pública:

   ```bash
   sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   ```

2. Desde tu PC, obtiene la entrada SSH de la VM por su dirección Tailscale:

   ```bash
   ssh-keyscan -t ed25519 100.64.183.123
   ```

3. Compara la huella SHA256 de esa entrada con la que obtuviste directamente en la VM:

   ```bash
   ssh-keyscan -t ed25519 100.64.183.123 | ssh-keygen -lf -
   ```

4. **Solo si coinciden**, copia la línea completa de `ssh-keyscan` —la que empieza con `100.64.183.123 ssh-ed25519`— al secret `DEPLOY_KNOWN_HOSTS`.

Si no coinciden, no agregues el secret: confirma la clave por un canal confiable antes de continuar.

## 6. Confirmar las variables no secretas

En **Settings → Secrets and variables → Actions → Variables**, verifica:

| Variable | Valor esperado |
|---|---|
| `DEPLOY_HOST` | `100.64.183.123` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_PATH` | `/opt/apps/restaurant-pos` |
| `FRONTEND_ORIGIN` | `https://sistemapost.jnmtortas.com` |
| `NEXT_PUBLIC_API_URL` | `https://sistemapost.jnmtortas.com/api` |

Estas son configuraciones, no contraseñas. `NEXT_PUBLIC_API_URL` es pública por diseño; **no pongas ninguna clave Supabase, contraseña ni `DATABASE_URL` en una variable `NEXT_PUBLIC_*`**.

## 7. Preparar la VM antes del primer despliegue

En la VM de aplicación, el usuario `ubuntu` debe tener instalados Node.js 22 o superior, pnpm 12.15.0, PM2, `curl` y `tar`.

Crea el directorio de configuración privada:

```bash
sudo install -d -o ubuntu -g ubuntu -m 750 /opt/apps/restaurant-pos/shared
sudo install -o ubuntu -g ubuntu -m 600 /dev/null /opt/apps/restaurant-pos/shared/backend.env
```

Edita `/opt/apps/restaurant-pos/shared/backend.env` en la VM y agrega las variables de producción del backend:

- `NODE_ENV=production`
- `PORT=3001`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS=https://sistemapost.jnmtortas.com`
- `REDIS_URL` (obligatoria en producción)
- `AUTH_COOKIE_SAME_SITE=Lax`

El backend utiliza la clave `service_role` solo en el servidor; nunca la agregues a GitHub Actions, al frontend ni a este repositorio. `DATABASE_URL` no es necesaria en `backend.env` para iniciar la API; el workflow la recibe como secreto únicamente para migraciones.

Configura la persistencia de PM2 una sola vez para el usuario `ubuntu`, usando `pm2 startup` y luego `pm2 save`. No detengas ni reemplaces los servicios existentes de otros proyectos.

## 8. Ejecutar y revisar el workflow

Después de configurar los cinco secretos, haz un `push` a `main` o vuelve a ejecutar el workflow desde **Actions**. El orden es:

1. Tests, typecheck, lint y build.
2. Migraciones pendientes de Supabase.
3. Despliegue por Tailscale/SSH y verificación de salud.

Si una migración falla, el workflow se detiene antes del despliegue. Consulta **Actions → Build and deploy production** para ver el error; nunca agregues una línea que imprima `DATABASE_URL` o una clave.

La VM actualmente tiene ocupado el puerto 3000. Este proyecto usa backend `3001` y frontend `3002`; el Nginx de proxy debe enviar `/api` al puerto `3001` y el resto al `3002`. El workflow no modifica Nginx ni los procesos existentes.
