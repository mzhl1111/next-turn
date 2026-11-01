#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

load_env_value() {
  local name="$1"
  local file="${PROJECT_DIR}/.env"
  if [[ -f "${file}" ]]; then
    sed -n "s/^${name}=//p" "${file}" | tail -n 1
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
readonly LITELLM_MODEL="openrouter/${OPENROUTER_MODEL#openrouter/}"
readonly TAU2_DATA_DIR="${PROJECT_DIR}/.tau2/tau2-bench/data"
readonly SAVE_NAME="${TAU2_SAVE_TO:-next-turn-glm-task-1-$(date -u +%Y%m%dT%H%M%SZ)}"
readonly RESULT_FILE="${TAU2_DATA_DIR}/simulations/${SAVE_NAME}/results.json"

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
  --timeout 180 \
  --max-retries 0 \
  --save-to "${SAVE_NAME}" \
  --seed 300 \
  --log-level INFO

"${PROJECT_DIR}/.venv/bin/python" \
  "${SCRIPT_DIR}/summarize_tau2_run.py" "${RESULT_FILE}"

