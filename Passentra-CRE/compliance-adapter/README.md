# Compliance Adapter (Mock-Only)

HTTP adapter consumed by the CRE workflow:

- `POST /v1/compliance/evaluate`
- `GET /healthz`

It validates payloads, enforces bearer auth, caches by `requestId`, and returns a normalized decision:

```json
{
  "decision": "approved",
  "reasonCodes": [],
  "ttlSeconds": 2592000
}
```

## Policy Engine

This demo adapter is intentionally **mock-only** (deterministic local rules):

- reject when `worldId.verified = false`
- reject blocked countries (`COMPLIANCE_BLOCKED_COUNTRIES`)
- reject retail in unsupported countries
- reject institution when verification level is not `orb`
- otherwise approve

## Setup

```bash
cp .env.example .env
bun install
bun run typecheck
```

Required `.env` values:

```bash
PORT=8787
COMPLIANCE_ADAPTER_API_KEY=replace-me
COMPLIANCE_DEFAULT_TTL_SECONDS=2592000
COMPLIANCE_BLOCKED_COUNTRIES=IR,KP
```

Important key mapping:

- `COMPLIANCE_ADAPTER_API_KEY` in this adapter must match
- `COMPLIANCE_ADAPTER_API_KEY_ALL` in `Passentra-CRE/.env`

## Run

```bash
bun run dev
```

## Test Call

```bash
curl -X POST http://localhost:8787/v1/compliance/evaluate \
  -H "content-type: application/json" \
  -H "authorization: Bearer $COMPLIANCE_ADAPTER_API_KEY" \
  -d '{
    "requestId":"req-1",
    "userAddress":"0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
    "targetChain":"ethereum-testnet-sepolia",
    "countryCode":"US",
    "credentialType":"accredited",
    "worldId":{
      "verified":true,
      "nullifierHash":"0x1111111111111111111111111111111111111111111111111111111111111111",
      "verificationLevel":"orb"
    }
  }'
```
