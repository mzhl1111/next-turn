#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

load_env_value() {
  local name="$1"
  local file="${PROJECT_DIR}/.env"
  if [[ -f "${file}" ]]; then
    local value
    value="$(sed -n "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*//p" "${file}" | tail -n 1)"
    value="${value%$'\r'}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf '%s' "${value}"
  fi
}

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  OPENROUTER_API_KEY="$(load_env_value OPENROUTER_API_KEY)"
  export OPENROUTER_API_KEY
fi
if [[ -z "${OPENROUTER_API_KEY}" ]]; then
  echo "OPENROUTER_API_KEY is required in the environment or ignored .env file." >&2
  exit 1
fi

OPENROUTER_MODEL="${OPENROUTER_MODEL:-$(load_env_value OPENROUTER_MODEL)}"
OPENROUTER_MODEL="${OPENROUTER_MODEL:-z-ai/glm-5.3-flash}"
TAU2_TIMEOUT_SECONDS="${TAU2_TIMEOUT_SECONDS:-$(load_env_value TAU2_TIMEOUT_SECONDS)}"
TAU2_TIMEOUT_SECONDS="${TAU2_TIMEOUT_SECONDS:-360}"
if [[ ! "${TAU2_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "TAU2_TIMEOUT_SECONDS must be a positive integer." >&2
  exit 1
fi
readonly LITELLM_MODEL="openrouter/${OPENROUTER_MODEL#openrouter/}"
readonly TAU2_TIMEOUT_SECONDS
readonly TAU2_DATA_DIR="${PROJECT_DIR}/.tau2/tau2-bench/data"
readonly SAVE_NAME="${TAU2_SAVE_TO:-next-turn-glm-task-1-$(date -u +%Y%m%dT%H%M%SZ)}"
readonly RESULT_FILE="${TAU2_DATA_DIR}/simulations/${SAVE_NAME}/results.json"

archive_result() {
  if [[ -f "${RESULT_FILE}" ]]; then
    node --import tsx "${SCRIPT_DIR}/archive_runs.ts" || \
      echo "Warning: the tau2 result exists but could not be archived." >&2
  fi
}
trap archive_result EXIT

if [[ ! -x "${PROJECT_DIR}/.venv/bin/tau2" || ! -d "${TAU2_DATA_DIR}" ]]; then
  echo "Run 'npm run setup:tau2' first." >&2
  exit 1
fi

export TAU2_DATA_DIR
export LITELLM_LOCAL_MODEL_COST_MAP=True

"${PROJECT_DIR}/.venv/bin/tau2" run \
  --domain retail \
  --task-ids 1 \
  --num-trials 1 \
  --agent-llm "${LITELLM_MODEL}" \
  --user-llm "${LITELLM_MODEL}" \
  --max-concurrency 1 \
  --max-steps 24 \
  --timeout "${TAU2_TIMEOUT_SECONDS}" \
  --max-retries 0 \
  --save-to "${SAVE_NAME}" \
  --seed 300 \
  --log-level INFO

"${PROJECT_DIR}/.venv/bin/python" \
  "${SCRIPT_DIR}/summarize_tau2_run.py" "${RESULT_FILE}"
