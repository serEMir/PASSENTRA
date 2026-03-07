#!/usr/bin/env bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${TARGET:-staging-write-dual-settings}"
BROADCAST="${BROADCAST:-1}"
SAVE_ARTIFACTS="${SAVE_ARTIFACTS:-0}"
CHECK_GATE="${CHECK_GATE:-1}"

APPROVED_SOURCE="${ROOT_DIR}/workflow/http_payload_approved.json"
REJECTED_SOURCE="${ROOT_DIR}/workflow/http_payload_rejected.json"

USE_COLOR=0
if [[ "${FORCE_COLOR:-0}" == "1" ]]; then
  USE_COLOR=1
elif [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  USE_COLOR=1
fi

if [[ "${USE_COLOR}" == "1" ]]; then
  C_RESET=$'\033[0m'
  C_RULE=$'\033[1;36m'
  C_SUBRULE=$'\033[0;36m'
  C_TITLE=$'\033[1;33m'
  C_PASS=$'\033[1;32m'
  C_FAIL=$'\033[1;31m'
  C_WARN=$'\033[1;35m'
else
  C_RESET=""
  C_RULE=""
  C_SUBRULE=""
  C_TITLE=""
  C_PASS=""
  C_FAIL=""
  C_WARN=""
fi

print_color_line() {
  local color="$1"
  shift
  printf "%b%s%b\n" "${color}" "$*" "${C_RESET}"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd cre
require_cmd jq
require_cmd python3
require_cmd curl
require_cmd cast

if [[ -z "${WORLD_ID_VERIFIER_API_KEY_ALL:-}" ]]; then
  echo "WORLD_ID_VERIFIER_API_KEY_ALL is not set." >&2
  exit 1
fi

if [[ -z "${COMPLIANCE_ADAPTER_API_KEY_ALL:-}" ]]; then
  echo "COMPLIANCE_ADAPTER_API_KEY_ALL is not set." >&2
  exit 1
fi

if ! curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1; then
  echo "Compliance adapter is not reachable at http://127.0.0.1:8787/healthz" >&2
  exit 1
fi

if [[ ! -f "${APPROVED_SOURCE}" ]]; then
  echo "Missing payload: ${APPROVED_SOURCE}" >&2
  exit 1
fi

if [[ ! -f "${REJECTED_SOURCE}" ]]; then
  echo "Missing payload: ${REJECTED_SOURCE}" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d -t passentra-demo-XXXXXX)"
cleanup() {
  if [[ "${SAVE_ARTIFACTS}" != "1" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

RUN_SUFFIX="$(date -u +%Y%m%d%H%M%S)"
APPROVED_PAYLOAD="${WORK_DIR}/approved.payload.json"
REJECTED_PAYLOAD="${WORK_DIR}/rejected.payload.json"
REPLAY_PAYLOAD="${WORK_DIR}/replay.payload.json"

jq --arg requestId "req-approved-${RUN_SUFFIX}" '.requestId = $requestId' \
  "${APPROVED_SOURCE}" >"${APPROVED_PAYLOAD}"
jq --arg requestId "req-rejected-${RUN_SUFFIX}" '.requestId = $requestId' \
  "${REJECTED_SOURCE}" >"${REJECTED_PAYLOAD}"
jq --arg requestId "req-replay-${RUN_SUFFIX}" '.requestId = $requestId' \
  "${APPROVED_PAYLOAD}" >"${REPLAY_PAYLOAD}"

if [[ "${BROADCAST}" == "1" ]]; then
  EXPECTED_REPLAY_STAMP="onchain_reverted"
else
  EXPECTED_REPLAY_STAMP="onchain_written"
fi

SUMMARY_FILE="${WORK_DIR}/summary.md"
cat >"${SUMMARY_FILE}" <<EOF
# Passentra Demo Run

- Time (UTC): $(date -u +"%Y-%m-%d %H:%M:%S")
- Target: \`${TARGET}\`
- Broadcast: \`${BROADCAST}\`
- Approved requestId: \`$(jq -r '.requestId' "${APPROVED_PAYLOAD}")\`
- Replay requestId: \`$(jq -r '.requestId' "${REPLAY_PAYLOAD}")\`
EOF

ROWS_FILE="${WORK_DIR}/summary.rows.tsv"
touch "${ROWS_FILE}"

append_summary_row() {
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" >>"${ROWS_FILE}"
}

repeat_char() {
  local char="$1"
  local count="$2"
  printf '%*s' "${count}" '' | tr ' ' "${char}"
}

normalize_value() {
  local value="$1"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  printf "%s" "${value}" | tr -s ' '
}

truncate_value() {
  local value="$1"
  local max_len="$2"
  if (( ${#value} <= max_len )); then
    printf "%s" "${value}"
    return
  fi
  printf "%s..." "${value:0:$((max_len - 3))}"
}

print_block_row() {
  local key="$1"
  local value="$2"
  local color="${3:-}"

  local normalized truncated line
  normalized="$(normalize_value "${value}")"
  truncated="$(truncate_value "${normalized}" 80)"
  line="$(printf "| %-13s | %-80s |" "${key}" "${truncated}")"

  if [[ -n "${color}" && "${USE_COLOR}" == "1" ]]; then
    print_color_line "${color}" "${line}"
  else
    echo "${line}"
  fi
}

print_scenario_block() {
  local name="$1"
  local parsed_file="$2"
  local expected="$3"
  local verdict="$4"
  local log_file="$5"

  local separator
  separator="+$(repeat_char "-" 15)+$(repeat_char "-" 82)+"

  print_color_line "${C_RULE}" "${separator}"
  print_color_line "${C_TITLE}" "$(printf "| %-13s | %-80s |" "Field" "Value")"
  print_color_line "${C_RULE}" "${separator}"

  local parsed
  parsed="$(jq -r '.parsed' "${parsed_file}")"
  print_block_row "Scenario" "${name^^}" "${C_TITLE}"
  print_block_row "Parsed" "${parsed}"

  if [[ "${parsed}" != "true" ]]; then
    local parse_error
    parse_error="$(jq -r '.error // "unknown parse failure"' "${parsed_file}")"
    print_block_row "Parse Error" "${parse_error}" "${C_FAIL}"
    print_block_row "Expected" "${expected}"
    print_block_row "Verdict" "${verdict}" "${C_FAIL}"
    print_block_row "Raw Log" "${log_file}"
    print_color_line "${C_RULE}" "${separator}"
    return
  fi

  local request_id user requested_chain write_targets world_verified world_status
  local decision stamp reason_codes chain_writes
  request_id="$(jq -r '.result.requestId // "n/a"' "${parsed_file}")"
  user="$(jq -r '.result.userAddress // "n/a"' "${parsed_file}")"
  requested_chain="$(jq -r '.result.requestedTargetChain // .result.targetChain // "n/a"' "${parsed_file}")"
  write_targets="$(jq -r '(.result.writeTargets // []) | if length==0 then "none" else join(", ") end' "${parsed_file}")"
  world_verified="$(jq -r '.result.worldIdVerified // false' "${parsed_file}")"
  decision="$(jq -r '.result.decision // "n/a"' "${parsed_file}")"
  stamp="$(jq -r '.result.stampStatus // "n/a"' "${parsed_file}")"
  reason_codes="$(jq -r '(.result.reasonCodes // []) | if length==0 then "none" else join(", ") end' "${parsed_file}")"
  chain_writes="$(jq -r '(.result.chainWrites // []) | if length==0 then "none" else map("\(.chainSelectorName):\(.txStatus)\(if .errorMessage then "(" + .errorMessage + ")" else "" end)") | join("; ") end' "${parsed_file}")"

  if [[ "${world_verified}" == "true" ]]; then
    world_status="VERIFIED"
  else
    world_status="FAILED (${reason_codes})"
  fi

  print_block_row "Request ID" "${request_id}"
  print_block_row "User" "${user}"
  print_block_row "Target" "${requested_chain}"
  print_block_row "Writes To" "${write_targets}"
  if [[ "${world_verified}" == "true" ]]; then
    print_block_row "World ID" "${world_status}" "${C_PASS}"
  else
    print_block_row "World ID" "${world_status}" "${C_FAIL}"
  fi
  if [[ "${decision}" == "approved" ]]; then
    print_block_row "Decision" "${decision}" "${C_PASS}"
  else
    print_block_row "Decision" "${decision}" "${C_FAIL}"
  fi
  if [[ "${stamp}" == "onchain_written" ]]; then
    print_block_row "Stamp" "${stamp}" "${C_PASS}"
  elif [[ "${stamp}" == "onchain_reverted" ]]; then
    print_block_row "Stamp" "${stamp}" "${C_FAIL}"
  else
    print_block_row "Stamp" "${stamp}" "${C_WARN}"
  fi
  print_block_row "Reasons" "${reason_codes}"
  print_block_row "Chain Write" "${chain_writes}"
  print_block_row "Expected" "${expected}"
  if [[ "${verdict}" == "PASS" ]]; then
    print_block_row "Verdict" "${verdict}" "${C_PASS}"
  else
    print_block_row "Verdict" "${verdict}" "${C_FAIL}"
  fi
  print_block_row "Raw Log" "${log_file}"
  print_color_line "${C_RULE}" "${separator}"
}

print_rule() {
  local line
  line="$(printf '%*s' 100 '' | tr ' ' '=')"
  print_color_line "${C_RULE}" "${line}"
}

print_subrule() {
  local line
  line="$(printf '%*s' 100 '' | tr ' ' '-')"
  print_color_line "${C_SUBRULE}" "${line}"
}

print_colored_table() {
  local table_file="$1"
  while IFS= read -r line; do
    if [[ "${USE_COLOR}" != "1" ]]; then
      echo "${line}"
      continue
    fi

    if [[ "${line}" == +* ]]; then
      print_color_line "${C_RULE}" "${line}"
    elif [[ "${line}" == "| Scenario "* ]]; then
      print_color_line "${C_TITLE}" "${line}"
    elif [[ "${line}" == *"PASS"* ]]; then
      print_color_line "${C_PASS}" "${line}"
    elif [[ "${line}" == *"FAIL"* ]]; then
      print_color_line "${C_FAIL}" "${line}"
    else
      echo "${line}"
    fi
  done <"${table_file}"
}

render_summary_table() {
  local headers=("Scenario" "Exit" "Parsed" "Decision" "Stamp Status" "Expected" "Verdict")
  local widths=()
  local i

  for i in "${!headers[@]}"; do
    widths[$i]=${#headers[$i]}
  done

  while IFS=$'\t' read -r c1 c2 c3 c4 c5 c6 c7; do
    [[ -z "${c1}" ]] && continue
    local cols=("${c1}" "${c2}" "${c3}" "${c4}" "${c5}" "${c6}" "${c7}")
    for i in "${!cols[@]}"; do
      if (( ${#cols[$i]} > widths[$i] )); then
        widths[$i]=${#cols[$i]}
      fi
    done
  done <"${ROWS_FILE}"

  print_separator() {
    local sep="+"
    local w
    for w in "${widths[@]}"; do
      sep+="$(printf '%*s' $((w + 2)) '' | tr ' ' '-')+"
    done
    echo "${sep}"
  }

  print_row() {
    local cols=("$@")
    local row="|"
    local idx
    for idx in "${!widths[@]}"; do
      row+=" $(printf "%-${widths[$idx]}s" "${cols[$idx]}") |"
    done
    echo "${row}"
  }

  print_separator
  print_row "${headers[@]}"
  print_separator
  while IFS=$'\t' read -r c1 c2 c3 c4 c5 c6 c7; do
    [[ -z "${c1}" ]] && continue
    print_row "${c1}" "${c2}" "${c3}" "${c4}" "${c5}" "${c6}" "${c7}"
  done <"${ROWS_FILE}"
  print_separator
}

run_gate_check() {
  if [[ "${CHECK_GATE}" != "1" ]]; then
    return
  fi

  local gate_script="${ROOT_DIR}/scripts/check-rwa-access.sh"
  if [[ ! -x "${gate_script}" ]]; then
    print_color_line "${C_WARN}" "Skipping gate check (missing script: ${gate_script})."
    return
  fi

  echo
  print_rule
  print_color_line "${C_TITLE}" "RWA ACCESS GATE CHECK"
  print_subrule

  local approved_user rejected_user
  approved_user="$(jq -r '.userAddress' "${APPROVED_PAYLOAD}" | tr '[:upper:]' '[:lower:]')"
  rejected_user="$(jq -r '.userAddress' "${REJECTED_PAYLOAD}" | tr '[:upper:]' '[:lower:]')"

  if "${gate_script}" \
    --root "${ROOT_DIR}" \
    --approved-user "${approved_user}" \
    --rejected-user "${rejected_user}"; then
    print_subrule
    print_color_line "${C_PASS}" "RWA ACCESS GATE CHECK: COMPLETED"
  else
    print_subrule
    print_color_line "${C_FAIL}" "RWA ACCESS GATE CHECK: FAILED"
  fi
  print_rule
}

run_scenario() {
  local name="$1"
  local payload="$2"
  local expected_decision="$3"
  local expected_stamp="$4"

  local log_file="${WORK_DIR}/${name}.log"
  local parsed_file="${WORK_DIR}/${name}.result.json"

  local -a cmd=(
    cre workflow simulate ./workflow
    --target="${TARGET}"
    --trigger-index=0
    --non-interactive
    --http-payload="${payload}"
  )

  if [[ "${BROADCAST}" == "1" ]]; then
    cmd+=(--broadcast)
  fi

  echo
  print_rule
  print_color_line "${C_TITLE}" "SCENARIO: ${name^^}"
  print_color_line "${C_TITLE}" "EXPECTED: decision=${expected_decision}, stampStatus=${expected_stamp}"
  print_subrule
  echo "Command: ${cmd[*]}"
  echo "Payload: ${payload}"
  print_subrule
  echo "Command: ${cmd[*]}" >"${WORK_DIR}/${name}.command.txt"
  echo "Payload: ${payload}" >>"${WORK_DIR}/${name}.command.txt"

  "${cmd[@]}" 2>&1 | tee "${log_file}"
  local exit_code=${PIPESTATUS[0]}

  python3 "${ROOT_DIR}/scripts/extract_sim_result.py" "${log_file}" "${parsed_file}"

  local parsed decision stamp verdict expected
  parsed="$(jq -r '.parsed' "${parsed_file}")"
  decision="$(jq -r '.result.decision // "n/a"' "${parsed_file}")"
  stamp="$(jq -r '.result.stampStatus // "n/a"' "${parsed_file}")"
  expected="${expected_decision}/${expected_stamp}"

  local has_replay_revert
  has_replay_revert="$(jq -r 'any(.result.chainWrites[]?; (.errorMessage // "") | startswith("REPLAY_DETECTED"))' "${parsed_file}")"

  verdict="FAIL"
  if [[ "${parsed}" == "true" && "${decision}" == "${expected_decision}" ]]; then
    if [[ "${stamp}" == "${expected_stamp}" ]]; then
      verdict="PASS"
    elif [[ "${name}" == "rejected" && "${stamp}" == "onchain_reverted" && "${has_replay_revert}" == "true" ]]; then
      expected="${expected_decision}/onchain_written|onchain_reverted(REPLAY_DETECTED)"
      verdict="PASS"
    fi
  fi

  append_summary_row "${name}" "${exit_code}" "${parsed}" "${decision}" "${stamp}" "${expected}" "${verdict}"

  if [[ "${name}" == "approved" && "${verdict}" == "FAIL" && "${decision}" == "approved" && "${stamp}" == "onchain_reverted" ]]; then
    print_color_line "${C_WARN}" "Hint: approved scenario reverted; likely nullifier already used. Generate a fresh World ID proof."
  fi

  print_subrule
  if [[ "${verdict}" == "PASS" ]]; then
    print_color_line "${C_PASS}" "SCENARIO RESULT: decision=${decision}, stampStatus=${stamp}, verdict=${verdict}"
  else
    print_color_line "${C_FAIL}" "SCENARIO RESULT: decision=${decision}, stampStatus=${stamp}, verdict=${verdict}"
  fi
  print_scenario_block "${name}" "${parsed_file}" "${expected}" "${verdict}" "${log_file}"
  print_rule
}

cd "${ROOT_DIR}" || exit 1

run_scenario "approved" "${APPROVED_PAYLOAD}" "approved" "onchain_written"
run_scenario "rejected" "${REJECTED_PAYLOAD}" "rejected" "onchain_written"
run_scenario "replay" "${REPLAY_PAYLOAD}" "approved" "${EXPECTED_REPLAY_STAMP}"

echo
print_color_line "${C_TITLE}" "=== Demo Summary ==="
cat "${SUMMARY_FILE}"
echo
TABLE_FILE="${WORK_DIR}/summary.table.txt"
render_summary_table >"${TABLE_FILE}"
print_colored_table "${TABLE_FILE}"
cat "${TABLE_FILE}" >> "${SUMMARY_FILE}"

run_gate_check

if [[ "${SAVE_ARTIFACTS}" == "1" ]]; then
  OUT_DIR="${ROOT_DIR}/demo-output/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "${OUT_DIR}"
  cp "${WORK_DIR}"/*.log "${OUT_DIR}/" 2>/dev/null || true
  cp "${WORK_DIR}"/*.result.json "${OUT_DIR}/" 2>/dev/null || true
  cp "${WORK_DIR}"/*.command.txt "${OUT_DIR}/" 2>/dev/null || true
  cp "${WORK_DIR}"/*.payload.json "${OUT_DIR}/" 2>/dev/null || true
  cp "${SUMMARY_FILE}" "${OUT_DIR}/summary.md"
  echo
  echo "Saved artifacts to: ${OUT_DIR}"
else
  echo
  echo "Artifacts not saved (SAVE_ARTIFACTS=0)."
  echo "Set SAVE_ARTIFACTS=1 to persist logs/results under demo-output/."
fi
