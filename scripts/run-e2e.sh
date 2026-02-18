#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -n "${NVM_BIN:-}" && -x "${NVM_BIN}/node" ]]; then
  node_bin="${NVM_BIN}/node"
else
  node_bin="$(command -v node)"
fi

exec "$node_bin" ./node_modules/@playwright/test/cli.js test apps/web/e2e/core-flow.spec.ts "$@"
