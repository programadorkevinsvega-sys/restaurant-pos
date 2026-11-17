# Configurar secretos de GitHub Actions

Esta guía configura el acceso del workflow de producción a PostgreSQL y a la VM. El workflow solo corre al hacer `push` a `main`; primero valida y compila, después aplica migraciones y, si estas terminan bien, despliega por Tailscale/SSH.

> **No pegues claves, contraseñas, cadenas de conexión ni archivos `.pem` en el repositorio, issues, logs o chats.** Los secretos se ingresan directamente en la interfaz de GitHub.

## 1. Abrir el entorno de producción

En GitHub, abre el repositorio privado `restaurant-pos` y navega a:

**Settings → Environments → production**

Agrega los siguientes valores en **Environment secrets**. No los agregues como variables:

| Secret | Valor |
|---|---|
| `MIGRATIONS_DATABASE_URL` | Conexión como `restaurant_pos_migrator` a la base PostgreSQL independiente. |
| `TS_AUTHKEY` | Auth key dedicada de Tailscale para conectar el runner de GitHub Actions. |
| `DEPLOY_SSH_KEY` | Clave privada SSH dedicada a GitHub Actions. |
| `DEPLOY_KNOWN_HOSTS` | Clave pública de host SSH de la VM, después de verificar su huella. |

El entorno `production` ya está creado. El workflow de migraciones y el de despliegue usan este entorno.

## 2. Configurar `MIGRATIONS_DATABASE_URL`

1. Usa la base `restaurant_pos` y el usuario `restaurant_pos_migrator` creados por `backend/scripts/provision-postgres.sql`.
2. Construye la URL con el host de PostgreSQL y codifica los caracteres reservados de la contraseña para URL.
3. Guarda la URL directamente como secreto `MIGRATIONS_DATABASE_URL` del entorno `production`; nunca la imprimas en terminales compartidas ni la agregues a Git.
4. No uses la cuenta `restaurant_pos_app` para el job de migraciones; esa cuenta es exclusiva del proceso API.

## 3. Crear la Auth key de Tailscale

1. En la consola de administración de Tailscale, abre **Settings → Keys** (`https://console.tailscale.com/admin/settings/keys`).
2. Crea una **Auth key** dedicada para este workflow. No crees ni uses un **API access token**: ese token sirve para llamar a la API de administración de Tailscale y no conecta el runner al tailnet.
3. Configura la Auth key con el tag `tag:ci` y con expiración corta razonable. Si aparece la opción **Ephemeral**, actívala para que los runners temporales de GitHub no queden como dispositivos permanentes. No la hagas reusable salvo que tu flujo de rotación lo requiera.
4. Copia la Auth key directamente al secret `TS_AUTHKEY` de GitHub. Tailscale la muestra una sola vez; no la pegues en el repositorio, terminales compartidas o chats.
5. En la política de acceso de Tailscale, permite que `tag:ci` llegue por TCP/22 únicamente a la VM de aplicación. Usa o asigna a esa VM el tag de destino apropiado. No autorices acceso general al tailnet.

Si ya generaste una Auth key para otro despliegue, es más seguro crear una dedicada para Restaurant POS para poder revocarla sin afectar otros servicios.

## 4. Crear una clave SSH dedicada para el deploy

En tu PC, genera una clave separada de `servidor-07.pem`, guardándola fuera del repositorio; no reutilices ni subas la clave personal:

```bash
ssh-keygen -t ed25519 -C "restaurant-pos-github-actions" -f ~/.ssh/restaurant-pos-actions -N ""
```

Se crean dos archivos:

- `~/.ssh/restaurant-pos-actions`: **privado**. Copia su contenido completo directamente al secret `DEPLOY_SSH_KEY` en GitHub. Es una clave sin passphrase para que Actions pueda usarla automáticamente; protégela estrictamente en GitHub.
- `~/.ssh/restaurant-pos-actions.pub`: **público**. Instálalo en la VM. Ejecuta este comando desde tu PC:

```bash
ssh-copy-id -i ~/.ssh/restaurant-pos-actions.pub \
  -o IdentityFile=/RUTA/COMPLETA/servidor-07.pem \
  -o IdentitiesOnly=yes \
  ubuntu@100.64.183.123
```

Reemplaza `/RUTA/COMPLETA/servidor-07.pem` por la ruta absoluta de la llave PEM que ya usas para entrar. `ssh-copy-id` inicia sesión con esa llave y agrega la clave pública a `/home/ubuntu/.ssh/authorized_keys` en la VM. No ejecutes comandos que escriban en `/home/ubuntu` directamente en tu PC.

Antes de probar el acceso, confirma que la llave privada y la pública nuevas forman el mismo par. Ejecuta en tu PC:

```bash
ssh-keygen -lf ~/.ssh/restaurant-pos-actions.pub
ssh-keygen -y -f ~/.ssh/restaurant-pos-actions | ssh-keygen -lf -
```

Ambos comandos deben mostrar la misma huella. Luego prueba la conexión:

```bash
ssh -i ~/.ssh/restaurant-pos-actions -o IdentitiesOnly=yes ubuntu@100.64.183.123 'whoami'
```

Debe responder `ubuntu`. Si `ssh-copy-id` indica que la clave ya existe pero la prueba da `Permission denied (publickey)`, entra con la llave PEM existente y revisa en la VM que `~/.ssh/authorized_keys` contenga la huella de `restaurant-pos-actions.pub` y que `~/.ssh` y `authorized_keys` pertenezcan a `ubuntu`, con permisos `700` y `600`, respectivamente. Si falta la clave, vuelve a instalarla con `ssh-copy-id -f` y la ruta absoluta correcta del PEM. Si `ssh-copy-id` no está instalado, conéctate primero a la VM usando el PEM y agrega allí el contenido de `~/.ssh/restaurant-pos-actions.pub`; pega solo la clave pública, nunca la privada.

Si ya generaste los archivos dentro del directorio del repositorio, muévelos a `~/.ssh/` en tu PC antes de continuar. El `.gitignore` de este proyecto excluye esos dos nombres para evitar que se agreguen por accidente, pero mantenerlos fuera del proyecto es más seguro. Como respondiste `y` al reemplazar una clave existente, si esa clave antigua se usaba en algún otro servicio, ese servicio ya no coincidirá con el archivo privado nuevo: actualiza allí la clave pública o restaura el par anterior desde una copia segura.

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

3. En la VM, compara con la huella de su clave de host que consultaste directamente. La huella que reporte este comando en tu PC, por sí sola, **no verifica** que sea legítima:

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

El dominio de producción queda definido en `.github/workflows/deploy.yml`: `FRONTEND_ORIGIN=https://post.vegtrixgroup.com` y `NEXT_PUBLIC_API_URL=https://post.vegtrixgroup.com/api`. No necesitas crear variables de Actions para esos dos valores. El workflow también pasa `CORS_ORIGINS` al proceso del backend al iniciar PM2, usando el mismo origen.

## 7. Preparar la VM antes del primer despliegue

En la VM de aplicación, el usuario `ubuntu` debe tener instalados Node.js 24 o superior, pnpm 12.15.0, PM2, `curl` y `tar`.

Crea la ruta privada de configuración. El directorio queda accesible solo para `root` y el grupo `ubuntu`; el archivo solo puede modificarse por `root`, y `ubuntu` puede leerlo para ejecutar el backend:

```bash
sudo install -d -o root -g ubuntu -m 750 /etc/apps
sudo install -d -o root -g ubuntu -m 750 /etc/apps/restaurant-pos
sudo install -o root -g ubuntu -m 640 /dev/null /etc/apps/restaurant-pos/restaurant-pos.env
```

Edita `/etc/apps/restaurant-pos/restaurant-pos.env` en la VM con `sudoedit` y agrega las variables de producción del backend:

- `NODE_ENV=production`
- `PORT=3001`
- `DATABASE_URL` con el rol de runtime `restaurant_pos_app`
- `AUTH_CSRF_SECRET` aleatorio de al menos 32 caracteres
- `CORS_ORIGINS=https://post.vegtrixgroup.com`
- `REDIS_URL` (obligatoria en producción)
- `AUTH_COOKIE_SAME_SITE=Lax`
- `TRUSTED_PROXY_IP` con la IP privada del proxy, si aplica.
- `SENTRY_DSN` del proyecto Sentry **Node.js de la API** (opcional hasta completar el proyecto)
- `SENTRY_TRACES_SAMPLE_RATE=0.1` (opcional; es el valor predeterminado)
- `SENTRY_PROFILES_SAMPLE_RATE=0.1` (opcional; es el valor predeterminado)

Genera `AUTH_CSRF_SECRET` con un generador criptográfico (por ejemplo, `openssl rand -base64 32`) y guárdalo solo en el archivo privado de la VM. No uses el mismo valor en otros entornos ni lo agregues a GitHub Actions. El usuario de runtime y la URL de conexión nunca deben llegar al frontend.

Configura la persistencia de PM2 una sola vez para el usuario `ubuntu`, usando `pm2 startup` y luego `pm2 save`. No detengas ni reemplaces los servicios existentes de otros proyectos.

## 8. Crear la primera cuenta administrativa

Después del primer despliegue exitoso (que aplica las migraciones) y desde la VM, ejecuta el comando con el usuario de despliegue:

```bash
pnpm --dir /opt/apps/restaurant-pos/current/backend user:create admin@example.com admin
```

El proceso solicita la contraseña dos veces sin mostrarla. Crea usuarios adicionales con el mismo comando, usando el rol `staff` si no necesitan permisos administrativos. No existe registro público.

## 9. Ejecutar y revisar el workflow

Después de configurar los cuatro secretos de GitHub, haz un `push` a `main` o vuelve a ejecutar el workflow desde **Actions**. El orden es:

1. Tests, typecheck, lint y build.
2. Migraciones versionadas de PostgreSQL.
3. Despliegue por Tailscale/SSH y verificación de salud.

Si una migración falla, el workflow se detiene antes del despliegue. Consulta **Actions → Build and deploy production** para ver el error; nunca agregues una línea que imprima `DATABASE_URL` o una clave.

La VM actualmente tiene ocupado el puerto 3000. Este proyecto usa backend `3001` y frontend `3002`; el Nginx de proxy debe enviar `/api` al puerto `3001` y el resto al `3002`. El workflow no modifica Nginx ni los procesos existentes.
