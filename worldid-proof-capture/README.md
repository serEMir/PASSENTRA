# World ID 4 Proof Capture Helper

This utility does two jobs:

1. Runs a local signer endpoint that returns RP context signatures (`/api/rp-signature`).
2. Runs a browser UI that creates an IDKit v4 request, polls completion, and outputs a paste-ready CRE payload (`worldProofV4`).

This helper is intentionally locked to `staging` environment.

## Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Fill in at least:
- `WORLD_ID_RP_ID`
- `WORLD_ID_RP_SIGNING_KEY`
- `VITE_WORLD_ID_APP_ID` (`app_staging_...`)
- `VITE_WORLD_ID_ACTION` (must match the action expected by your workflow payloads)

3. Install dependencies:

```bash
bun install
```

## Run

Terminal 1:

```bash
bun run signer
```

Terminal 2:

```bash
bun run dev
```

Open the Vite URL, click `Start Verification`, complete the flow in World App, then copy the generated workflow payload into:

- `Passentra CRE/workflow/http_payload_approved.json`

If you are running replay tests, keep the same `nullifier` and change only `requestId`.

Notes:
- In World ID 4 preview, legacy presets may return `protocol_version: "3.0"`.
- This helper keeps that protocol version and fills missing `signal_hash` with the
  default empty-signal hash so verifier payloads remain valid.

## Signer API

`POST /api/rp-signature`

Body:

```json
{
  "action": "human-verifier",
  "ttlSeconds": 300
}
```

Response:

```json
{
  "rp_id": "rp_xxx",
  "sig": "0x...",
  "nonce": "0x...",
  "created_at": 1735689600,
  "expires_at": 1735689900
}
```
