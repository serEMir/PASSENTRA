# Passentra Workflow

This workflow is **confidential-HTTP only** for both external integrations:

- World ID verification call
- Compliance adapter call

No standard HTTP fallback path exists in workflow code.

## Flow

1. HTTP trigger receives passport activation payload.
2. Workflow verifies World ID via Confidential HTTP.
3. Workflow evaluates compliance via Confidential HTTP.
4. Workflow builds a signed CRE report and writes to `PassportRegistry`.
5. Replay checks block reused `requestIdHash` and `nullifierHash`.

## Code Layout

- `main.ts` - runner bootstrap.
- `src/schema.ts` - config/request schemas.
- `src/handler.ts` - orchestration callback.
- `src/http.ts` - Confidential HTTP helper.
- `src/world-id.ts` - World ID verification step.
- `src/compliance.ts` - compliance adapter step.
- `src/attestation.ts` - decision hashing + report payload encoding.
- `src/onchain.ts` - replay checks and chain writes.

## Targets

- `staging-write-settings` -> `config.staging.write.json` (single-chain write mode)
- `staging-write-dual-settings` -> `config.staging.write.dual.json` (dual-chain write mode)
- `production-settings` -> `config.production.json`

## Required Setup

1. Install workflow dependencies:

```bash
bun install
```

2. Start compliance adapter (from a second terminal):

```bash
cd ../compliance-adapter
bun run dev
```

3. Set secret values for simulation (`_ALL` env vars):

- `WORLD_ID_VERIFIER_API_KEY_ALL`
- `COMPLIANCE_ADAPTER_API_KEY_ALL`

4. (For persistent onchain replay tests) set project root `.env`:

```bash
CRE_ETH_PRIVATE_KEY=0x...
```

## Run Scenarios

Run from `Passentra CRE` root.

### Single-chain write mode

```bash
cre workflow simulate ./workflow \
  --target=staging-write-settings \
  --trigger-index 0 \
  --non-interactive \
  --broadcast \
  --http-payload @./workflow/http_payload_approved.json
```

### Dual-chain write mode

```bash
cre workflow simulate ./workflow \
  --target=staging-write-dual-settings \
  --trigger-index 0 \
  --non-interactive \
  --broadcast \
  --http-payload @./workflow/http_payload_approved.json
```

### Rejected scenario

```bash
cre workflow simulate ./workflow \
  --target=staging-write-dual-settings \
  --trigger-index 0 \
  --non-interactive \
  --broadcast \
  --http-payload @./workflow/http_payload_rejected.json
```

### Replay scenario

Use a payload with:

- new `requestId`
- same World ID `nullifier`

Then run:

```bash
cre workflow simulate ./workflow \
  --target=staging-write-dual-settings \
  --trigger-index 0 \
  --non-interactive \
  --broadcast \
  --http-payload @./workflow/your_generated_replay_payload.json
```

Expected replay behavior:

- chain-level write result returns `txStatus: "reverted"` with `REPLAY_DETECTED:...`
- overall `stampStatus` becomes `onchain_reverted`

## One-Command Demo Runner

Run all three scenarios (`approved`, `rejected`, `replay`) with terminal-first summary:

```bash
WORLD_ID_VERIFIER_API_KEY_ALL=your_world_api_key \
COMPLIANCE_ADAPTER_API_KEY_ALL=your_adapter_api_key \
./scripts/run-demo.sh
```

Notes:

- Default target is `staging-write-dual-settings`.
- Set `TARGET=staging-write-settings` to run single-write mode.
- Set `BROADCAST=0` to run non-persistent simulation.
- Replay payload is auto-generated from approved payload with a fresh `requestId`.
- Scenario verdicts (`PASS`/`FAIL`) are printed directly in terminal.
- RWA access integration check runs after summary by default (`CHECK_GATE=1`):
  - approved user should be `allowed`
  - rejected user should be `denied`
- Set `CHECK_GATE=0` to skip gate checks.
- Set `SAVE_ARTIFACTS=1` to persist logs/results under `demo-output/<timestamp>/`.
