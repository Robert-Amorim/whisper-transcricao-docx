#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/ops/render-nginx-lb-app.sh \
    --app <app_name> \
    --server-name <hostname> \
    --web-root <path> \
    --upstream-server <host:port> \
    [--output-dir <dir>]

Example:
  ./scripts/ops/render-nginx-lb-app.sh \
    --app voxora \
    --server-name voxora.integraretech.com.br \
    --web-root /var/www/voxora \
    --upstream-server 127.0.0.1:62011
USAGE
}

app_name=""
server_name=""
web_root=""
upstream_server=""
output_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      app_name="${2:-}"
      shift 2
      ;;
    --server-name)
      server_name="${2:-}"
      shift 2
      ;;
    --web-root)
      web_root="${2:-}"
      shift 2
      ;;
    --upstream-server)
      upstream_server="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$app_name" || -z "$server_name" || -z "$web_root" || -z "$upstream_server" ]]; then
  usage
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
template_dir="$repo_root/infra/templates"
output_dir="${output_dir:-$repo_root/infra/generated/$app_name}"

app_key="$(printf '%s' "$app_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')"
forwarded_proto_var="${app_key}_forwarded_proto"
upstream_name="${app_key}_api"
locations_snippet="/etc/nginx/snippets/${app_key}-locations.conf"

mkdir -p "$output_dir"

escape_sed() {
  printf '%s' "$1" | sed 's/[\/&]/\\&/g'
}

render() {
  local template="$1"
  sed \
    -e "s/__FORWARDED_PROTO_VAR__/$(escape_sed "$forwarded_proto_var")/g" \
    -e "s/__UPSTREAM_NAME__/$(escape_sed "$upstream_name")/g" \
    -e "s/__UPSTREAM_SERVER__/$(escape_sed "$upstream_server")/g" \
    -e "s/__SERVER_NAME__/$(escape_sed "$server_name")/g" \
    -e "s/__LOCATIONS_SNIPPET__/$(escape_sed "$locations_snippet")/g" \
    -e "s/__WEB_ROOT__/$(escape_sed "$web_root")/g" \
    "$template"
}

render "$template_dir/nginx-lb-site.conf.template" > "$output_dir/site.conf"
render "$template_dir/nginx-lb-locations.conf.template" > "$output_dir/locations.conf"

cat <<EOF2
Rendered files:
- $output_dir/site.conf
- $output_dir/locations.conf

Suggested install targets:
- /etc/nginx/sites-available/$app_key
- /etc/nginx/snippets/${app_key}-locations.conf
EOF2
