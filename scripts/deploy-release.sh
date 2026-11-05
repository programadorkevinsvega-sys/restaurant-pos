#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path=${1:?DEPLOY_PATH argument is required}
release_sha=${2:?release SHA argument is required}
artifact_path=${3:?release artifact argument is required}
frontend_origin=${4:?FRONTEND_ORIGIN argument is required}

if [[ ! "$deploy_path" =~ ^/opt/apps/[a-zA-Z0-9._-]+$ || "$deploy_path" == "/opt/apps/." || "$deploy_path" == "/opt/apps/.." ]]; then
  echo "DEPLOY_PATH must be a dedicated application directory under /opt/apps." >&2
  exit 1
fi

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release identifier must be a full Git commit SHA." >&2
  exit 1
fi

if [[ ! "$frontend_origin" =~ ^https://[^/]+$ ]]; then
  echo "FRONTEND_ORIGIN must be the exact HTTPS frontend origin." >&2
  exit 1
fi

backend_env_file="/etc/apps/restaurant-post-supabase/restaurant-post-supabase.env"
release_directory="$deploy_path/releases/$release_sha"
current_link="$deploy_path/current"

for command_name in node pnpm pm2 curl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing on the VM: $command_name" >&2
    exit 1
  fi
done

if [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]]; then
  echo "Node.js 24 or newer is required on the VM." >&2
  exit 1
fi

if [[ ! -s "$backend_env_file" || ! -r "$backend_env_file" ]]; then
  echo "Create $backend_env_file and ensure the deployment user can read it before deployment." >&2
  exit 1
fi

mkdir -p "$deploy_path/releases"
mkdir -p "$release_directory"
tar -xzf "$artifact_path" -C "$release_directory"
ln -sfn -- "$backend_env_file" "$release_directory/backend/.env"

pnpm --dir "$release_directory/backend" install --prod --frozen-lockfile
pnpm --dir "$release_directory/frontend" install --prod --frozen-lockfile

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release=$(readlink -f "$current_link")
fi

activate_release() {
  local target=$1
  local temporary_link="$deploy_path/current.next"
  rm -f "$temporary_link"
  ln -s "$target" "$temporary_link"
  mv -Tf "$temporary_link" "$current_link"
}

start_release() {
  local release=$1

  for app_name in restaurant-pos-backend restaurant-pos-frontend; do
    if pm2 describe "$app_name" >/dev/null 2>&1; then
      pm2 delete "$app_name"
    fi
  done

  pm2 start "$release/ecosystem.config.cjs" --env production --update-env
  EXPECTED_RELEASE="$release" pm2 jlist | node -e '
    let output = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => { output += chunk })
    process.stdin.on("end", () => {
      const apps = JSON.parse(output)
      const expected = process.env.EXPECTED_RELEASE
      const expectedApps = new Map([
        ["restaurant-pos-backend", `${expected}/backend`],
        ["restaurant-pos-frontend", `${expected}/frontend`],
      ])
      for (const [name, cwd] of expectedApps) {
        const app = apps.find((entry) => entry.name === name)
        if (!app || app.pm2_env.status !== "online" || app.pm2_env.pm_cwd !== cwd) {
          console.error(`PM2 did not start ${name} from the new release.`)
          process.exitCode = 1
          return
        }
      }
    })
  '
}

rollback() {
  if [[ -n "$previous_release" ]]; then
    echo "Rolling back to the previous release." >&2
    activate_release "$previous_release"
    if ! start_release "$previous_release"; then
      echo "Could not restart the previous release automatically." >&2
    fi
  else
    echo "No previous release exists; stop the failed first deployment manually if needed." >&2
  fi
}

activate_release "$release_directory"
if ! start_release "$release_directory"; then
  rollback
  exit 1
fi

backend_ready=false
frontend_ready=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error \
    --header "Origin: $frontend_origin" \
    http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    backend_ready=true
  fi

  if curl --fail --silent http://127.0.0.1:3002/ >/dev/null 2>&1; then
    frontend_ready=true
  fi

  if [[ "$backend_ready" == true && "$frontend_ready" == true ]]; then
    break
  fi
  sleep 2
done

if [[ "$backend_ready" != true || "$frontend_ready" != true ]]; then
  echo "Health check failed for the new release." >&2
  rollback
  exit 1
fi

pm2 save
rm -f "$artifact_path"
echo "Deployed release $release_sha successfully."
