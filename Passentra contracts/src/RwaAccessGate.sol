// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPassportRegistry {
    /**
     * @notice Returns whether an account is currently eligible.
     * @param account The account to query.
     * @return eligible True when the account has a valid, non-expired passport stamp.
     * @return expiresAt Passport expiration timestamp.
     * @return attestationHash Commitment hash for the stored stamp.
     */
    function isEligible(address account)
        external
        view
        returns (bool eligible, uint64 expiresAt, bytes32 attestationHash);
}

/**
 * @title RwaAccessGate
 * @notice Example gate that only allows users with an active passport stamp.
 */
contract RwaAccessGate {
    /*//////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Thrown when an account is not currently eligible.
     * @param account The account that failed eligibility check.
     */
    error NotPassportEligible(address account);
    /**
     * @notice Thrown when the registry address is zero.
     */
    error InvalidRegistry();

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Emitted when a gated action is executed by an eligible account.
     * @param account Account that executed the action.
     * @param actionId Caller-provided action correlation id.
     * @param attestationHash Passport attestation hash used for the gate decision.
     * @param expiresAt Passport expiration timestamp.
     */
    event AccessGranted(
        address indexed account, bytes32 indexed actionId, bytes32 indexed attestationHash, uint64 expiresAt
    );

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Passport registry used to verify account eligibility.
     */
    IPassportRegistry public immutable passportRegistry;

    /*//////////////////////////////////////////////////////////////
                            FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deploys the gate with a target passport registry.
     * @param registry The PassportRegistry contract address.
     */
    constructor(address registry) {
        if (registry == address(0)) revert InvalidRegistry();
        passportRegistry = IPassportRegistry(registry);
    }

    /**
     * @notice Returns access diagnostics for any account.
     * @param account The account to evaluate.
     * @return allowed True when account currently has an active passport stamp.
     * @return expiresAt Passport expiration timestamp returned by registry.
     * @return secondsRemaining Seconds until expiration (0 when already expired or ineligible).
     * @return reason Access reason code (`OK`, `NO_STAMP`, `EXPIRED`, `NOT_ELIGIBLE`).
     */
    function accessStatus(address account)
        external
        view
        returns (bool allowed, uint64 expiresAt, uint64 secondsRemaining, string memory reason)
    {
        (bool eligible, uint64 stampExpiresAt, bytes32 attestationHash) = passportRegistry.isEligible(account);
        if (eligible) {
            return (true, stampExpiresAt, stampExpiresAt - uint64(block.timestamp), "OK");
        }

        if (attestationHash == bytes32(0) && stampExpiresAt == 0) {
            return (false, 0, 0, "NO_STAMP");
        }

        if (stampExpiresAt != 0 && stampExpiresAt < block.timestamp) {
            return (false, stampExpiresAt, 0, "EXPIRED");
        }

        return (false, stampExpiresAt, 0, "NOT_ELIGIBLE");
    }

    /**
     * @notice Executes a gated RWA action and emits an auditable access event.
     * @param actionId Caller-provided action correlation id.
     * @return executed Always true when the caller is eligible and event is emitted.
     */
    function executeRwaAction(bytes32 actionId) external returns (bool executed) {
        (bool eligible, uint64 expiresAt, bytes32 attestationHash) = passportRegistry.isEligible(msg.sender);
        if (!eligible) revert NotPassportEligible(msg.sender);

        emit AccessGranted(msg.sender, actionId, attestationHash, expiresAt);
        return true;
    }
}
