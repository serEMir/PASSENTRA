#!/usr/bin/env python3
"""Extracts CRE workflow simulation result JSON from a log file."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


def extract_json_object(text: str, start_index: int) -> str | None:
    in_string = False
    escaped = False
    depth = 0
    end_index = None

    for idx in range(start_index, len(text)):
        ch = text[idx]

        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end_index = idx + 1
                break

    if end_index is None:
        return None

    return text[start_index:end_index]


def build_output(log_text: str) -> dict[str, Any]:
    marker = "Workflow Simulation Result:"
    marker_index = log_text.rfind(marker)

    tx_hashes = re.findall(r'"txHash"\s*:\s*"(0x[a-fA-F0-9]{64})"', log_text)
    tx_hashes = list(dict.fromkeys(tx_hashes))

    output: dict[str, Any] = {
        "parsed": False,
        "result": None,
        "txHashes": tx_hashes,
        "error": None,
    }

    if marker_index == -1:
        output["error"] = "MARKER_NOT_FOUND"
        return output

    json_start = log_text.find("{", marker_index)
    if json_start == -1:
        output["error"] = "RESULT_JSON_START_NOT_FOUND"
        return output

    json_blob = extract_json_object(log_text, json_start)
    if json_blob is None:
        output["error"] = "RESULT_JSON_TRUNCATED"
        return output

    try:
        parsed = json.loads(json_blob)
    except json.JSONDecodeError:
        output["error"] = "RESULT_JSON_DECODE_FAILED"
        return output

    output["parsed"] = True
    output["result"] = parsed
    return output


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: extract_sim_result.py <log_file> <out_file>", file=sys.stderr)
        return 1

    log_file = Path(sys.argv[1])
    out_file = Path(sys.argv[2])

    if not log_file.exists():
        print(f"log file not found: {log_file}", file=sys.stderr)
        return 1

    log_text = log_file.read_text(encoding="utf-8", errors="replace")
    parsed_output = build_output(log_text)
    out_file.write_text(json.dumps(parsed_output, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
