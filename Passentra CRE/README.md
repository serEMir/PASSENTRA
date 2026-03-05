# Passentra CRE

This folder contains the CRE side of Passentra:

- workflow orchestration (`workflow/`)
- mock compliance adapter (`compliance-adapter/`)
- terminal demo and validation scripts (`scripts/`)

## What It Does

- verifies World ID proof via CRE Confidential HTTP
- evaluates compliance policy via CRE Confidential HTTP
- signs a CRE report and writes eligibility stamps to `PassportRegistry`
- enforces replay resistance through `requestIdHash` and `nullifierHash`

## Quick Start

Run from `Passentra CRE/`.

1. Install dependencies:

```bash
cd workflow && bun install
cd ../compliance-adapter && bun install
cd ..
```

2. Configure env files:

```bash
cp .env.example .env
cp compliance-adapter/.env.example compliance-adapter/.env
```

3. Set matching compliance keys:

- `.env`: `COMPLIANCE_ADAPTER_API_KEY_ALL=<value>`
- `compliance-adapter/.env`: `COMPLIANCE_ADAPTER_API_KEY=<same-value>`

4. Start adapter in terminal A:

```bash
cd compliance-adapter
bun run dev
```

5. Run full demo in terminal B:

```bash
cd 'Passentra CRE'
set -a && source .env && set +a
TARGET=staging-write-dual-settings BROADCAST=1 CHECK_GATE=1 ./scripts/run-demo.sh
```

For a fresh approved path, replace `workflow/http_payload_approved.json` with a new proof from `../worldid-proof-capture/`.

## Useful Variants

- single chain mode: `TARGET=staging-write-settings`
- simulation only: `BROADCAST=0`
- persist artifacts: `SAVE_ARTIFACTS=1`
- skip gate check: `CHECK_GATE=0`

## Documentation

- Judge pack: [`DEMO.md`](DEMO.md)
- Integration guide: [`INTEGRATION.md`](INTEGRATION.md)
- Architecture diagram source: [`docs/architecture.mmd`](docs/architecture.mmd)
- Workflow details: [`workflow/README.md`](workflow/README.md)
- Adapter details: [`compliance-adapter/README.md`](compliance-adapter/README.md)

## Chainlink File Index

Core CRE workflow:
- [`workflow/main.ts`](workflow/main.ts)
- [`workflow/src/handler.ts`](workflow/src/handler.ts)
- [`workflow/src/http.ts`](workflow/src/http.ts)
- [`workflow/src/world-id.ts`](workflow/src/world-id.ts)
- [`workflow/src/compliance.ts`](workflow/src/compliance.ts)
- [`workflow/src/onchain.ts`](workflow/src/onchain.ts)
- [`workflow/src/attestation.ts`](workflow/src/attestation.ts)

CRE config and wiring:
- [`workflow/workflow.yaml`](workflow/workflow.yaml)
- [`project.yaml`](project.yaml)
- [`workflow/config.staging.write.json`](workflow/config.staging.write.json)
- [`workflow/config.staging.write.dual.json`](workflow/config.staging.write.dual.json)
- [`workflow/config.production.json`](workflow/config.production.json)
- [`secrets.yaml`](secrets.yaml)

CRE scripts:
- [`scripts/run-demo.sh`](scripts/run-demo.sh)
- [`scripts/check-rwa-access.sh`](scripts/check-rwa-access.sh)
- [`scripts/extract_sim_result.py`](scripts/extract_sim_result.py)

## Security Notes

- `.env` files are local-only and ignored by Git.
- Do not commit API keys or private keys.
