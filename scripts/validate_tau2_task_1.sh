#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly TAU2_DATA_DIR="${PROJECT_DIR}/.tau2/tau2-bench/data"

if [[ ! -d "${TAU2_DATA_DIR}" || ! -x "${PROJECT_DIR}/.venv/bin/python" ]]; then
  echo "Run 'npm run setup:tau2' first." >&2
  exit 1
fi

export TAU2_DATA_DIR
export LITELLM_LOCAL_MODEL_COST_MAP=True
"${PROJECT_DIR}/.venv/bin/python" "${SCRIPT_DIR}/validate_tau2_task_1.py"

