// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PassportRegistry} from "../src/PassportRegistry.sol";

contract PassportRegistryTest is Test {
    PassportRegistry internal registry;

    address internal reporter = address(0xA11CE);
    address internal user = address(0xBEEF);

    bytes32 internal constant NULLIFIER_A = bytes32(uint256(1));
    bytes32 internal constant NULLIFIER_B = bytes32(uint256(2));
    bytes32 internal constant REQUEST_A = bytes32(uint256(101));
    bytes32 internal constant REQUEST_B = bytes32(uint256(102));
    bytes32 internal constant DECISION_HASH = keccak256("decision");
    bytes32 internal constant POLICY_HASH = keccak256("policy-v1");

    function setUp() public {
        registry = new PassportRegistry(reporter);
    }

    function _encodeReport(
        address subject,
        bytes32 nullifierHash,
        bool eligible,
        uint64 expiresAt,
        bytes32 decisionHash,
        bytes32 requestIdHash,
        bytes32 policyVersionHash
    ) internal pure returns (bytes memory) {
        return abi.encode(subject, nullifierHash, eligible, expiresAt, decisionHash, requestIdHash, policyVersionHash);
    }

    function test_onReportApprove_updatesStampAndEligibility() public {
        uint64 expiresAt = uint64(block.timestamp + 7 days);
        bytes memory report = _encodeReport(user, NULLIFIER_A, true, expiresAt, DECISION_HASH, REQUEST_A, POLICY_HASH);

        vm.prank(reporter);
        registry.onReport("", report);

        (bool eligible,, bytes32 attestationHash) = registry.isEligible(user);
        assertTrue(eligible);
        assertTrue(attestationHash != bytes32(0));

        PassportRegistry.PassportStamp memory stamp = registry.getStamp(user);
        assertEq(stamp.eligible, true);
        assertEq(stamp.expiresAt, expiresAt);
        assertEq(stamp.nullifierHash, NULLIFIER_A);
        assertEq(stamp.requestIdHash, REQUEST_A);
        assertEq(stamp.decisionHash, DECISION_HASH);
        assertEq(stamp.policyVersionHash, POLICY_HASH);
    }

    function test_onReportReject_storesStampButNotEligible() public {
        bytes memory report = _encodeReport(user, NULLIFIER_A, false, 0, DECISION_HASH, REQUEST_A, POLICY_HASH);

        vm.prank(reporter);
        registry.onReport("", report);

        (bool eligible,,) = registry.isEligible(user);
        assertFalse(eligible);
    }

    function test_onReportReverts_whenRequestIdReused() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        bytes memory reportA = _encodeReport(user, NULLIFIER_A, true, expiresAt, DECISION_HASH, REQUEST_A, POLICY_HASH);
        bytes memory reportB =
            _encodeReport(address(0xCAFE), NULLIFIER_B, true, expiresAt, DECISION_HASH, REQUEST_A, POLICY_HASH);

        vm.startPrank(reporter);
        registry.onReport("", reportA);

        vm.expectRevert(abi.encodeWithSelector(PassportRegistry.RequestAlreadyProcessed.selector, REQUEST_A));
        registry.onReport("", reportB);
        vm.stopPrank();
    }

    function test_onReportReverts_whenNullifierReused() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        bytes memory reportA = _encodeReport(user, NULLIFIER_A, true, expiresAt, DECISION_HASH, REQUEST_A, POLICY_HASH);
        bytes memory reportB =
            _encodeReport(address(0xCAFE), NULLIFIER_A, true, expiresAt, DECISION_HASH, REQUEST_B, POLICY_HASH);

        vm.startPrank(reporter);
        registry.onReport("", reportA);

        vm.expectRevert(abi.encodeWithSelector(PassportRegistry.NullifierAlreadyUsed.selector, NULLIFIER_A));
        registry.onReport("", reportB);
        vm.stopPrank();
    }

    function test_onReportReverts_whenUnauthorizedReporter() public {
        bytes memory report = _encodeReport(
            user, NULLIFIER_A, true, uint64(block.timestamp + 1 days), DECISION_HASH, REQUEST_A, POLICY_HASH
        );

        vm.expectRevert(abi.encodeWithSelector(PassportRegistry.UnauthorizedReporter.selector, address(this)));
        registry.onReport("", report);
    }
}
