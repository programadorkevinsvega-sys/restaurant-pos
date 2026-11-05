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

shared_directory="$deploy_path/shared"
release_directory="$deploy_path/releases/$release_sha"
current_link="$deploy_path/current"

for command_name in node pnpm pm2 curl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing on the VM: $command_name" >&2
    exit 1
  fi
done

if [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  echo "Node.js 22 or newer is required on the VM." >&2
  exit 1
fi

if [[ ! -s "$shared_directory/backend.env" ]]; then
  echo "Create $shared_directory/backend.env with the production backend environment before deployment." >&2
  exit 1
fi

mkdir -p "$deploy_path/releases"
mkdir -p "$release_directory"
tar -xzf "$artifact_path" -C "$release_directory"
ln -sfn -- "$shared_directory/backend.env" "$release_directory/backend/.env"

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

rollback() {
  if [[ -n "$previous_release" ]]; then
    echo "Rolling back to the previous release." >&2
    activate_release "$previous_release"
    if ! pm2 startOrReload "$previous_release/ecosystem.config.cjs" --env production --update-env; then
      echo "Could not restart the previous release automatically." >&2
    fi
  else
    echo "No previous release exists; stop the failed first deployment manually if needed." >&2
  fi
}

activate_release "$release_directory"
if ! pm2 startOrReload "$current_link/ecosystem.config.cjs" --env production --update-env; then
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

  if curl --fail --silent http://127.0.0.1:3000/ >/dev/null 2>&1; then
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
