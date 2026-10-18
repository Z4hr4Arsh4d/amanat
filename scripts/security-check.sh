#!/usr/bin/env bash
# Amanat security check — 401 / 403 / 404, masking, CSRF (PLAN §2.3).
# Usage: ./scripts/security-check.sh [BASE_URL] [--bruteforce]
# Works anywhere Node 18+ is installed (on Windows: `node scripts/security-check.mjs`).
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/security-check.mjs "$@"
