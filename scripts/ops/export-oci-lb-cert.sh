#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/ops/export-oci-lb-cert.sh <hostname> [output_dir]

Examples:
  ./scripts/ops/export-oci-lb-cert.sh voxora.integraretech.com.br
  ./scripts/ops/export-oci-lb-cert.sh voxora.integraretech.com.br .secrets/oci-lb-custom
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

hostname="$1"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
source_dir="/etc/letsencrypt/live/$hostname"
base_output_dir="${2:-$repo_root/.secrets/oci-lb}"
target_dir="$base_output_dir/$hostname"

if ! sudo test -d "$source_dir"; then
  echo "Certificate source not found: $source_dir" >&2
  exit 1
fi

install -d -m 700 "$base_output_dir"
install -d -m 700 "$target_dir"

sudo install -m 644 "$source_dir/cert.pem" "$target_dir/cert.pem"
sudo install -m 644 "$source_dir/chain.pem" "$target_dir/chain.pem"
sudo install -m 644 "$source_dir/fullchain.pem" "$target_dir/fullchain.pem"
sudo install -m 600 "$source_dir/privkey.pem" "$target_dir/privkey.pem"
sudo chown -R "$(id -un)":"$(id -gn)" "$target_dir"

cat <<EOF2
Export completed:
- $target_dir/cert.pem
- $target_dir/chain.pem
- $target_dir/fullchain.pem
- $target_dir/privkey.pem
EOF2
