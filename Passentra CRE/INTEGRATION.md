# Integration Guide

This project is best understood as an **eligibility rail**, not a standalone end-user app.

A partner product integrates once to:
- collect a user's wallet and World ID proof,
- submit an activation request into the CRE workflow,
- reuse the resulting onchain passport attestation across gated actions.

## 1. Integration Surfaces

There are three integration surfaces:

1. **Issuance**
   - Partner app or backend submits a passport activation payload.
   - CRE privately verifies World ID and compliance through Confidential HTTP.

2. **Registry**
   - CRE writes a minimal attestation to `PassportRegistry`.
   - No raw KYC documents or World ID proof data are stored onchain.

3. **Enforcement**
   - Partner contracts read `PassportRegistry` directly or use `RwaAccessGate`.
   - The partner app gates minting, trading, onboarding, or other protected actions.

## 2. Why This Matters

This rail separates **issuance** from **consumption**:
- issuance happens once through private offchain verification,
- consumption can happen many times across multiple products and chains,
- protocols only need an onchain eligibility signal, not the user's raw personal data.

That is the core composability claim of the project.

## 3. Issuance Flow

Reference flow:

1. User completes World ID proof generation offchain.
2. Partner app collects:
   - `userAddress`
   - `targetChain`
   - `countryCode`
   - `credentialType`
   - `worldProofV4`
3. Partner backend submits the activation payload into the workflow rail.
4. CRE:
   - verifies World ID through Confidential HTTP,
   - evaluates compliance through Confidential HTTP,
   - signs a CRE report,
   - writes a passport stamp to `PassportRegistry`.
5. Downstream products reuse that attestation for access control.

## 4. Activation Payload

Payload schema is enforced in [`workflow/src/schema.ts`](workflow/src/schema.ts).

Example payload:

```json
{
  "requestId": "req-v4-1772728972118",
  "userAddress": "0xbFaB953A4Ad220853745942C0656988bfEcb99Cc",
  "targetChain": "ethereum-testnet-sepolia",
  "countryCode": "US",
  "credentialType": "accredited",
  "worldProofV4": {
    "action": "human-verifier-v4",
    "environment": "staging",
    "nonce": "0x0093fba1172fca937aefdcfc2e8f7390e802da0dea57c3f0a34c85b5963a1bba",
    "protocol_version": "3.0",
    "responses": [
      {
        "identifier": "orb",
        "merkle_root": "0x2e9ded73757bb0eecb87b41b5bd3a91e7e765bef09e24960652e1f9b3832bef3",
        "nullifier": "0x12b3069a602b36607dcae44737b2ad80c43661a34a1e434e0d4dc6018fd09ef1",
        "proof": "0x...",
        "signal_hash": "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4"
      }
    ]
  }
}
```

Notes:
- `requestId` must be unique per activation attempt.
- `targetChain` is the primary issuance chain.
- `worldProofV4.responses[0].nullifier` is later used for replay protection.

## 5. Onchain Output

The workflow writes only minimal attestation state into [`PassportRegistry.sol`](../Passentra%20contracts/src/PassportRegistry.sol):

- `eligible`
- `expiresAt`
- `attestationHash`
- `nullifierHash`
- `requestIdHash`
- `decisionHash`
- `policyVersionHash`
- `updatedAt`

This is privacy-preserving, not fully private:
- observers can see that a wallet has a passport stamp,
- observers cannot see the user's raw compliance data or World ID proof payload.

## 6. Supported Chains

Current deployed testnet contracts:

| Chain | PassportRegistry | RwaAccessGate |
|---|---|---|
| `ethereum-testnet-sepolia` | `0x3BDd1CF11C1E8A5580c1346C3afDA49E375C8c32` | `0x90b2AccCbbc392bd59d9fE34F1d9543687eECE0A` |
| `ethereum-testnet-sepolia-arbitrum-1` | `0xcf0fe75aB3238DdFCe4b0f3AA7341D55Cd0B1cDE` | `0x29d13E6A5ba5293Ed959d6dFD9de65569114fB15` |

## 7. Write Modes

Current write modes:

- `single`
  - writes only to the requested `targetChain`
- `dual_on_approve`
  - approved users are written to all configured chains
  - rejected users are written only to the requested `targetChain`

This gives integrators a clean tradeoff:
- minimal writes when they only need one chain,
- portable eligibility when they want broader coverage.

## 8. Solidity Integration

### Option A: Read registry directly

```solidity
interface IPassportRegistry {
    function isEligible(address account)
        external
        view
        returns (bool eligible, uint64 expiresAt, bytes32 attestationHash);
}

contract Consumer {
    IPassportRegistry public immutable registry;

    constructor(address registryAddress) {
        registry = IPassportRegistry(registryAddress);
    }

    function canUserAccess(address user) external view returns (bool) {
        (bool eligible,,) = registry.isEligible(user);
        return eligible;
    }
}
```

### Option B: Use the gate contract

[`RwaAccessGate.sol`](../Passentra%20contracts/src/RwaAccessGate.sol) exposes:

- `accessStatus(address)` for rich read diagnostics
- `executeRwaAction(bytes32 actionId)` for auditable gated execution

Example:

```solidity
interface IRwaAccessGate {
    function accessStatus(address account)
        external
        view
        returns (bool allowed, uint64 expiresAt, uint64 secondsRemaining, string memory reason);

    function executeRwaAction(bytes32 actionId) external returns (bool executed);
}
```

The gate pattern is useful when a protocol wants:
- a standard eligibility check,
- better UX diagnostics (`NO_STAMP`, `EXPIRED`, `NOT_ELIGIBLE`, `OK`),
- an emitted event proving that access was granted using a valid attestation.

## 9. Replay Guarantees

Replay protection exists at two layers:

1. **Workflow layer**
   - CRE checks `usedRequestIdHashes` and `usedNullifierHashes` before writing.

2. **Registry layer**
   - `PassportRegistry` reverts if either hash was already consumed.

Result:
- the same proof cannot be reused to mint multiple valid passport stamps.

## 10. Judge Framing

For judges, the clean explanation is:

> This project is a reusable eligibility rail.  
> CRE handles private verification and policy evaluation offchain, then writes a minimal onchain passport that any protocol can consume without re-running onboarding or exposing raw user data.

That is the product boundary:
- not "yet another RWA frontend",
- a portable issuance-and-consumption rail for onchain access.
