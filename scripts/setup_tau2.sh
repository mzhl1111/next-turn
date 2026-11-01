#!/usr/bin/env bash
set -euo pipefail

readonly TAU2_COMMIT="fc0055dc4e0a316c3f83133267fbd6faaa770992"
readonly TAU2_REPOSITORY="https://github.com/sierra-research/tau2-bench.git"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly UPSTREAM_DIR="${PROJECT_DIR}/.tau2/tau2-bench"
readonly PYTHON_BIN="${PYTHON_BIN:-/opt/homebrew/opt/python@3.13/bin/python3.13}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Python 3.12 or 3.13 is required; not found at ${PYTHON_BIN}" >&2
  exit 1
fi

if [[ ! -d "${UPSTREAM_DIR}/.git" ]]; then
  mkdir -p "$(dirname "${UPSTREAM_DIR}")"
  git clone --depth 1 --branch v1.0.1 "${TAU2_REPOSITORY}" "${UPSTREAM_DIR}"
fi

actual_commit="$(git -C "${UPSTREAM_DIR}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${TAU2_COMMIT}" ]]; then
  echo "Expected tau2 commit ${TAU2_COMMIT}, found ${actual_commit}" >&2
  exit 1
fi

verify_hash() {
  local relative_path="$1"
  local expected_hash="$2"
  local actual_hash
  actual_hash="$(shasum -a 256 "${UPSTREAM_DIR}/${relative_path}" | awk '{print $1}')"
  if [[ "${actual_hash}" != "${expected_hash}" ]]; then
    echo "Hash mismatch for ${relative_path}" >&2
    exit 1
  fi
}

verify_hash "data/tau2/domains/retail/tasks.json" "8e03ebce7901bd6218e7a7dc3105faa9324091a68058f7fe61c65262868812e8"
verify_hash "data/tau2/domains/retail/policy.md" "2c9652afbce57d6e087768d37cda64d31c53d50b3e3225cfdb791bac66466467"
verify_hash "pyproject.toml" "23d59670b4ad7bbc0f57420fd9643a8d9188c24abe4f29c9c965544d8cc4cb8d"
verify_hash "LICENSE" "e67c5aa0074dfcaefd3c3a1aedb94cb539234aecd15d5a972574e3200e6252fe"

if [[ ! -x "${PROJECT_DIR}/.venv/bin/python" ]]; then
  "${PYTHON_BIN}" -m venv "${PROJECT_DIR}/.venv"
fi

"${PROJECT_DIR}/.venv/bin/pip" install -r "${PROJECT_DIR}/requirements/tau2.txt"
echo "tau2 ${TAU2_COMMIT} is ready."

