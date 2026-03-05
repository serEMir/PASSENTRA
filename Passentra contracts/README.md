# Passentra Contracts

This package contains the onchain contracts used by the Passentra CRE workflow.

## Contracts

- `src/PassportRegistry.sol`
  - receives signed CRE reports
  - stores eligibility stamp per address
  - enforces replay protection (`requestIdHash` and `nullifierHash`)

- `src/RwaAccessGate.sol`
  - consumes `PassportRegistry`
  - exposes `accessStatus(address)` for read diagnostics
  - exposes `executeRwaAction(bytes32)` for gated execution

## Structure

- `src/`: contract sources
- `test/`: Foundry tests
- `script/DeployPassportSystem.s.sol`: deployment script
- `broadcast/DeployPassportSystem.s.sol/<chain-id>/run-latest.json`: latest deploy artifacts

## Prerequisites

- Foundry (`forge`, `cast`)
- chain RPC URL
- deployer private key

## Install

```bash
forge install
forge build
```

## Test

```bash
forge test
```

Focused gate test:

```bash
forge test --match-contract RwaAccessGateTest
```

## Deploy

The deploy script supports:

- Sepolia (`11155111`)
- Arbitrum Sepolia (`421614`)

Set env vars:

```bash
export PRIVATE_KEY=0x...
```

Deploy example:

```bash
forge script script/DeployPassportSystem.s.sol:DeployPassportSystem \
  --rpc-url <RPC_URL> \
  --broadcast
```

The script logs:

- `PassportRegistry` address
- `RwaAccessGate` address
- selected trusted forwarder

## Integration with CRE Demo

`Passentra CRE/scripts/check-rwa-access.sh` reads:

- `broadcast/DeployPassportSystem.s.sol/11155111/run-latest.json`
- `broadcast/DeployPassportSystem.s.sol/421614/run-latest.json`

It resolves `RwaAccessGate` addresses from those files and runs access checks for approved and rejected users.

If you redeploy, `run-latest.json` updates and the CRE demo scripts will automatically use the latest addresses.
