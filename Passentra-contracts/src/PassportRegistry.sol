// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PassportRegistry
 * @notice Stores minimal, privacy-preserving passport attestations written by CRE reports.
 */
contract PassportRegistry {
    /*//////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Thrown when a caller that is not the owner attempts an owner-only action.
     */
    error OnlyOwner();
    /**
     * @notice Thrown when a non-forwarder caller attempts to submit a report.
     * @param reporter Unauthorized reporter address.
     */
    error UnauthorizedReporter(address reporter);
    /**
     * @notice Thrown when a report contains the zero address as subject.
     */
    error InvalidSubject();
    /**
     * @notice Thrown when a nullifier has already been used by a previous report.
     * @param nullifierHash Reused World ID nullifier hash.
     */
    error NullifierAlreadyUsed(bytes32 nullifierHash);
    /**
     * @notice Thrown when a request ID hash has already been processed.
     * @param requestIdHash Reused request hash.
     */
    error RequestAlreadyProcessed(bytes32 requestIdHash);

    /*//////////////////////////////////////////////////////////////
                            TYPES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Minimal onchain attestation state for a wallet.
     * @dev Stores only commitments and eligibility metadata to avoid leaking raw compliance data.
     */
    struct PassportStamp {
        bool eligible;
        uint64 expiresAt;
        bytes32 attestationHash;
        bytes32 nullifierHash;
        bytes32 requestIdHash;
        bytes32 decisionHash;
        bytes32 policyVersionHash;
        uint64 updatedAt;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Maps account address to latest stamped passport state.
     */
    mapping(address account => PassportStamp stamp) private s_stamps;
    /**
     * @notice True if a nullifier hash has already been consumed.
     */
    mapping(bytes32 nullifierHash => bool used) public usedNullifierHashes;
    /**
     * @notice True if a request hash has already been consumed.
     */
    mapping(bytes32 requestIdHash => bool used) public usedRequestIdHashes;

    /**
     * @notice Owner address set at deployment.
     */
    address public immutable i_owner;
    /**
     * @notice Authorized report forwarder; zero address disables reporter restriction.
     */
    address public trustedForwarder;

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Emitted when the trusted report forwarder is changed.
     * @param oldForwarder Previous forwarder address.
     * @param newForwarder New forwarder address.
     */
    event TrustedForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);

    /**
     * @notice Emitted when a new passport stamp is written.
     * @param account Subject wallet address.
     * @param eligible Eligibility decision at write time.
     * @param expiresAt Expiry timestamp for eligibility.
     * @param nullifierHash World ID nullifier hash.
     * @param requestIdHash Request hash used for replay protection.
     * @param attestationHash Commitment hash over stamped fields.
     */
    event PassportStamped(
        address indexed account,
        bool eligible,
        uint64 expiresAt,
        bytes32 indexed nullifierHash,
        bytes32 indexed requestIdHash,
        bytes32 attestationHash
    );

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOwner() {
        if (msg.sender != i_owner) revert OnlyOwner();
        _;
    }

    modifier onlyAuthorizedReporter() {
        if (trustedForwarder != address(0) && msg.sender != trustedForwarder) {
            revert UnauthorizedReporter(msg.sender);
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deploys the registry and sets the initial trusted forwarder.
     * @param initialTrustedForwarder Initial authorized forwarder (or zero address).
     */
    constructor(address initialTrustedForwarder) {
        i_owner = msg.sender;
        trustedForwarder = initialTrustedForwarder;
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Updates the trusted forwarder.
     * @dev Set to zero address to disable caller restriction on `onReport`.
     * @param newTrustedForwarder The new authorized forwarder address.
     */
    function setTrustedForwarder(address newTrustedForwarder) external onlyOwner {
        address oldForwarder = trustedForwarder;
        trustedForwarder = newTrustedForwarder;
        emit TrustedForwarderUpdated(oldForwarder, newTrustedForwarder);
    }

    /**
     * @notice CRE entrypoint that receives a signed report payload and updates passport state.
     * @dev Report ABI:
     * `(address subject, bytes32 nullifierHash, bool eligible, uint64 expiresAt, bytes32 decisionHash, bytes32 requestIdHash, bytes32 policyVersionHash)`.
     * @param report ABI-encoded report payload consumed by this registry.
     */
    function onReport(bytes calldata, bytes calldata report) external onlyAuthorizedReporter {
        (
            address subject,
            bytes32 nullifierHash,
            bool eligible,
            uint64 expiresAt,
            bytes32 decisionHash,
            bytes32 requestIdHash,
            bytes32 policyVersionHash
        ) = abi.decode(report, (address, bytes32, bool, uint64, bytes32, bytes32, bytes32));

        if (subject == address(0)) revert InvalidSubject();
        if (usedNullifierHashes[nullifierHash]) revert NullifierAlreadyUsed(nullifierHash);
        if (usedRequestIdHashes[requestIdHash]) revert RequestAlreadyProcessed(requestIdHash);

        usedNullifierHashes[nullifierHash] = true;
        usedRequestIdHashes[requestIdHash] = true;

        bytes32 attestationHash = keccak256(
            abi.encode(subject, nullifierHash, eligible, expiresAt, decisionHash, requestIdHash, policyVersionHash)
        );

        s_stamps[subject] = PassportStamp({
            eligible: eligible,
            expiresAt: expiresAt,
            attestationHash: attestationHash,
            nullifierHash: nullifierHash,
            requestIdHash: requestIdHash,
            decisionHash: decisionHash,
            policyVersionHash: policyVersionHash,
            updatedAt: uint64(block.timestamp)
        });

        emit PassportStamped(subject, eligible, expiresAt, nullifierHash, requestIdHash, attestationHash);
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Returns the stored passport stamp for an account.
     * @param account The account to query.
     * @return stamp The full passport stamp struct.
     */
    function getStamp(address account) external view returns (PassportStamp memory) {
        return s_stamps[account];
    }

    /**
     * @notice Computes current eligibility status for an account.
     * @param account The account to query.
     * @return eligible True if stamp is eligible and not expired.
     * @return expiresAt UNIX timestamp at which eligibility expires.
     * @return attestationHash Commitment hash of the stamped payload.
     */
    function isEligible(address account)
        external
        view
        returns (bool eligible, uint64 expiresAt, bytes32 attestationHash)
    {
        PassportStamp memory stamp = s_stamps[account];
        bool currentlyEligible = stamp.eligible && stamp.expiresAt >= block.timestamp;
        return (currentlyEligible, stamp.expiresAt, stamp.attestationHash);
    }
}
