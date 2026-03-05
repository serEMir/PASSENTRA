# Passentra Monorepo

Passentra is a privacy-preserving onchain eligibility rail built with Chainlink CRE and World ID.

## Repository Layout

- `Passentra CRE/`: CRE workflow, compliance adapter, demo scripts, judge docs.
- `Passentra contracts/`: `PassportRegistry` and `RwaAccessGate` contracts with Foundry tests and deploy scripts.
- `worldid-proof-capture/`: local helper app to generate `worldProofV4` payloads for workflow inputs.

## Prerequisites

- `bun`
- `cre` CLI
- `cast` (Foundry)
- `jq`
- `python3`
- `curl`

## End-to-End CLI Demo

Run from repository root.

1. Install dependencies:

```bash
(cd 'Passentra CRE/workflow' && bun install)
(cd 'Passentra CRE/compliance-adapter' && bun install)
```

2. Configure local env files:

```bash
cp 'Passentra CRE/.env.example' 'Passentra CRE/.env'
cp 'Passentra CRE/compliance-adapter/.env.example' 'Passentra CRE/compliance-adapter/.env'
```

3. Set matching compliance API keys in both files:

- `Passentra CRE/.env`: `COMPLIANCE_ADAPTER_API_KEY_ALL=<same-value>`
- `Passentra CRE/compliance-adapter/.env`: `COMPLIANCE_ADAPTER_API_KEY=<same-value>`

4. Start compliance adapter in terminal A:

```bash
cd 'Passentra CRE/compliance-adapter'
bun run dev
```

5. Run demo in terminal B:

```bash
cd 'Passentra CRE'
set -a && source .env && set +a
TARGET=staging-write-dual-settings BROADCAST=1 CHECK_GATE=1 ./scripts/run-demo.sh
```

For a non-persistent simulation, use `BROADCAST=0`.
For a fresh approved path, replace `Passentra CRE/workflow/http_payload_approved.json` with a new proof from `worldid-proof-capture/`.

## Submission Assets

- Judge walkthrough: `Passentra CRE/DEMO.md`
- Architecture diagram source: `Passentra CRE/docs/architecture.mmd`
- Integration guide: `Passentra CRE/INTEGRATION.md`
- Demo runner: `Passentra CRE/scripts/run-demo.sh`

## Chainlink File Index

Core CRE workflow files:
- `Passentra CRE/workflow/main.ts`
- `Passentra CRE/workflow/src/handler.ts`
- `Passentra CRE/workflow/src/http.ts`
- `Passentra CRE/workflow/src/world-id.ts`
- `Passentra CRE/workflow/src/compliance.ts`
- `Passentra CRE/workflow/src/onchain.ts`
- `Passentra CRE/workflow/src/attestation.ts`

CRE config and wiring:
- `Passentra CRE/project.yaml`
- `Passentra CRE/workflow/workflow.yaml`
- `Passentra CRE/workflow/config.staging.write.json`
- `Passentra CRE/workflow/config.staging.write.dual.json`
- `Passentra CRE/workflow/config.production.json`
- `Passentra CRE/secrets.yaml`

CRE execution and validation scripts:
- `Passentra CRE/scripts/run-demo.sh`
- `Passentra CRE/scripts/check-rwa-access.sh`
- `Passentra CRE/scripts/extract_sim_result.py`

Dependency declaration:
- `Passentra CRE/workflow/package.json`

## Security Notes

- `.env` files and other secret-bearing local files are ignored by Git.
- Do not commit private keys or API keys.
