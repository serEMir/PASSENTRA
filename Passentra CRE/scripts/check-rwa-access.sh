#!/usr/bin/env bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/../Passentra contracts"

APPROVED_PAYLOAD="${ROOT_DIR}/workflow/http_payload_approved.json"
REJECTED_PAYLOAD="${ROOT_DIR}/workflow/http_payload_rejected.json"

SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
ARB_SEPOLIA_RPC_URL="${ARB_SEPOLIA_RPC_URL:-https://arbitrum-sepolia-rpc.publicnode.com}"

APPROVED_USER=""
REJECTED_USER=""

USE_COLOR=0
if [[ "${FORCE_COLOR:-0}" == "1" ]]; then
  USE_COLOR=1
elif [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  USE_COLOR=1
fi

if [[ "${USE_COLOR}" == "1" ]]; then
  C_RESET=$'\033[0m'
  C_RULE=$'\033[1;36m'
  C_HEADER=$'\033[1;33m'
  C_PASS=$'\033[1;32m'
  C_FAIL=$'\033[1;31m'
  C_META=$'\033[0;36m'
else
  C_RESET=""
  C_RULE=""
  C_HEADER=""
  C_PASS=""
  C_FAIL=""
  C_META=""
fi

print_color_line() {
  local color="$1"
  shift
  printf "%b%s%b\n" "${color}" "$*" "${C_RESET}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT_DIR="$2"
      CONTRACTS_DIR="${ROOT_DIR}/../Passentra contracts"
      shift 2
      ;;
    --contracts-dir)
      CONTRACTS_DIR="$2"
      shift 2
      ;;
    --approved-user)
      APPROVED_USER="$2"
      shift 2
      ;;
    --rejected-user)
      REJECTED_USER="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd cast
require_cmd jq

if [[ ! -f "${APPROVED_PAYLOAD}" ]]; then
  echo "Missing approved payload: ${APPROVED_PAYLOAD}" >&2
  exit 1
fi

if [[ ! -f "${REJECTED_PAYLOAD}" ]]; then
  echo "Missing rejected payload: ${REJECTED_PAYLOAD}" >&2
  exit 1
fi

if [[ -z "${APPROVED_USER}" ]]; then
  APPROVED_USER="$(jq -r '.userAddress' "${APPROVED_PAYLOAD}" | tr '[:upper:]' '[:lower:]')"
fi

if [[ -z "${REJECTED_USER}" ]]; then
  REJECTED_USER="$(jq -r '.userAddress' "${REJECTED_PAYLOAD}" | tr '[:upper:]' '[:lower:]')"
fi

SEPOLIA_BROADCAST="${CONTRACTS_DIR}/broadcast/DeployPassportSystem.s.sol/11155111/run-latest.json"
ARB_BROADCAST="${CONTRACTS_DIR}/broadcast/DeployPassportSystem.s.sol/421614/run-latest.json"

if [[ ! -f "${SEPOLIA_BROADCAST}" || ! -f "${ARB_BROADCAST}" ]]; then
  echo "Missing deployment broadcast files under ${CONTRACTS_DIR}/broadcast/DeployPassportSystem.s.sol" >&2
  exit 1
fi

SEPOLIA_GATE="$(jq -r '.transactions[] | select(.contractName=="RwaAccessGate") | .contractAddress' "${SEPOLIA_BROADCAST}" | tail -n 1 | tr '[:upper:]' '[:lower:]')"
ARB_GATE="$(jq -r '.transactions[] | select(.contractName=="RwaAccessGate") | .contractAddress' "${ARB_BROADCAST}" | tail -n 1 | tr '[:upper:]' '[:lower:]')"

if [[ -z "${SEPOLIA_GATE}" || "${SEPOLIA_GATE}" == "null" || -z "${ARB_GATE}" || "${ARB_GATE}" == "null" ]]; then
  echo "Could not resolve RwaAccessGate addresses from broadcast files." >&2
  exit 1
fi

ROWS_FILE="$(mktemp -t passentra-gate-rows-XXXXXX)"
trap 'rm -f "${ROWS_FILE}"' EXIT

append_row() {
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" >>"${ROWS_FILE}"
}

check_access() {
  local chain="$1"
  local gate="$2"
  local rpc="$3"
  local user_label="$4"
  local user_addr="$5"
  local expected="$6"

  local output
  output="$(
    cast call \
      "${gate}" \
      "accessStatus(address)(bool,uint64,uint64,string)" \
      "${user_addr}" \
      --rpc-url "${rpc}" 2>&1
  )"
  local exit_code=$?

  local actual
  local reason="n/a"
  if [[ ${exit_code} -eq 0 ]]; then
    if [[ "${output}" == *"true"* ]]; then
      actual="allowed"
    else
      actual="denied"
    fi
    reason="$(echo "${output}" | grep -Eo 'OK|NO_STAMP|EXPIRED|NOT_ELIGIBLE' | head -n 1 || true)"
    if [[ -z "${reason}" ]]; then
      reason="unknown"
    fi
  else
    # Backward-compatible fallback for older deployments.
    output="$(cast call "${gate}" "accessRestrictedAction()(bool)" --from "${user_addr}" --rpc-url "${rpc}" 2>&1)"
    exit_code=$?
    if [[ ${exit_code} -eq 0 && "${output}" == *"true"* ]]; then
      actual="allowed"
      reason="OK"
    else
      actual="denied"
      reason="LEGACY_REVERT"
    fi
  fi

  local verdict="FAIL"
  if [[ "${actual}" == "${expected}" ]]; then
    verdict="PASS"
  fi

  append_row "${chain}" "${user_label}" "${user_addr}" "${actual}" "${reason}" "${expected}" "${verdict}" "${gate}"
}

check_access "sepolia" "${SEPOLIA_GATE}" "${SEPOLIA_RPC_URL}" "approved_user" "${APPROVED_USER}" "allowed"
check_access "sepolia" "${SEPOLIA_GATE}" "${SEPOLIA_RPC_URL}" "rejected_user" "${REJECTED_USER}" "denied"
check_access "arbitrum_sepolia" "${ARB_GATE}" "${ARB_SEPOLIA_RPC_URL}" "approved_user" "${APPROVED_USER}" "allowed"
check_access "arbitrum_sepolia" "${ARB_GATE}" "${ARB_SEPOLIA_RPC_URL}" "rejected_user" "${REJECTED_USER}" "denied"

render_table() {
  local headers=("Chain" "User" "Address" "Actual" "Reason" "Expected" "Verdict" "Gate")
  local widths=()
  local i

  for i in "${!headers[@]}"; do
    widths[$i]=${#headers[$i]}
  done

  while IFS=$'\t' read -r c1 c2 c3 c4 c5 c6 c7 c8; do
    [[ -z "${c1}" ]] && continue
    local cols=("${c1}" "${c2}" "${c3}" "${c4}" "${c5}" "${c6}" "${c7}" "${c8}")
    for i in "${!cols[@]}"; do
      if (( ${#cols[$i]} > widths[$i] )); then
        widths[$i]=${#cols[$i]}
      fi
    done
  done <"${ROWS_FILE}"

  format_sep() {
    local sep="+"
    local w
    for w in "${widths[@]}"; do
      sep+="$(printf '%*s' $((w + 2)) '' | tr ' ' '-')+"
    done
    printf "%s" "${sep}"
  }

  format_row() {
    local cols=("$@")
    local row="|"
    local idx
    for idx in "${!widths[@]}"; do
      row+=" $(printf "%-${widths[$idx]}s" "${cols[$idx]}") |"
    done
    printf "%s" "${row}"
  }

  local sep_line
  sep_line="$(format_sep)"
  local header_line
  header_line="$(format_row "${headers[@]}")"

  if [[ "${USE_COLOR}" == "1" ]]; then
    print_color_line "${C_RULE}" "${sep_line}"
    print_color_line "${C_HEADER}" "${header_line}"
    print_color_line "${C_RULE}" "${sep_line}"
  else
    echo "${sep_line}"
    echo "${header_line}"
    echo "${sep_line}"
  fi

  while IFS=$'\t' read -r c1 c2 c3 c4 c5 c6 c7 c8; do
    [[ -z "${c1}" ]] && continue
    local data_line
    data_line="$(format_row "${c1}" "${c2}" "${c3}" "${c4}" "${c5}" "${c6}" "${c7}" "${c8}")"
    if [[ "${USE_COLOR}" != "1" ]]; then
      echo "${data_line}"
    elif [[ "${c7}" == "PASS" ]]; then
      print_color_line "${C_PASS}" "${data_line}"
    else
      print_color_line "${C_FAIL}" "${data_line}"
    fi
  done <"${ROWS_FILE}"

  if [[ "${USE_COLOR}" == "1" ]]; then
    print_color_line "${C_RULE}" "${sep_line}"
  else
    echo "${sep_line}"
  fi
}

if [[ "${USE_COLOR}" == "1" ]]; then
  print_color_line "${C_HEADER}" "RWA Access Gate Integration Check"
  print_color_line "${C_META}" "Approved user: ${APPROVED_USER}"
  print_color_line "${C_META}" "Rejected user: ${REJECTED_USER}"
else
  echo "RWA Access Gate Integration Check"
  echo "Approved user: ${APPROVED_USER}"
  echo "Rejected user: ${REJECTED_USER}"
fi
echo
render_table
