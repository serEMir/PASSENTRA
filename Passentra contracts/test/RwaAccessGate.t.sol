// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PassportRegistry} from "../src/PassportRegistry.sol";
import {RwaAccessGate} from "../src/RwaAccessGate.sol";

contract RwaAccessGateTest is Test {
    PassportRegistry internal registry;
    RwaAccessGate internal gate;

    address internal reporter = address(0xA11CE);
    address internal user = address(0xBEEF);

    bytes32 internal constant NULLIFIER_A = bytes32(uint256(1));
    bytes32 internal constant REQUEST_A = bytes32(uint256(101));
    bytes32 internal constant DECISION_HASH = keccak256("decision");
    bytes32 internal constant POLICY_HASH = keccak256("policy-v1");
    bytes32 internal constant ACTION_ID = keccak256("BUY_RWA");

    function setUp() public {
        registry = new PassportRegistry(reporter);
        gate = new RwaAccessGate(address(registry));
    }

    function _writeStamp(bool eligible, uint64 expiresAt) internal {
        bytes memory report = abi.encode(user, NULLIFIER_A, eligible, expiresAt, DECISION_HASH, REQUEST_A, POLICY_HASH);

        vm.prank(reporter);
        registry.onReport("", report);
    }

    function test_accessStatus_returnsNoStampForUnknownAccount() public view {
        (bool allowed, uint64 expiresAt, uint64 secondsRemaining, string memory reason) =
            gate.accessStatus(address(0xCAFE));
        assertFalse(allowed);
        assertEq(expiresAt, 0);
        assertEq(secondsRemaining, 0);
        assertEq(reason, "NO_STAMP");
    }

    function test_accessStatus_returnsOkForEligibleAccount() public {
        uint64 expectedExpiry = uint64(block.timestamp + 1 days);
        _writeStamp(true, expectedExpiry);

        (bool allowed, uint64 expiresAt, uint64 secondsRemaining, string memory reason) = gate.accessStatus(user);
        assertTrue(allowed);
        assertEq(expiresAt, expectedExpiry);
        assertGt(secondsRemaining, 0);
        assertEq(reason, "OK");
    }

    function test_accessStatus_returnsExpiredForExpiredStamp() public {
        vm.warp(1 days);
        uint64 expiredAt = uint64(block.timestamp - 1);
        _writeStamp(true, expiredAt);

        (bool allowed, uint64 expiresAt, uint64 secondsRemaining, string memory reason) = gate.accessStatus(user);
        assertFalse(allowed);
        assertEq(expiresAt, expiredAt);
        assertEq(secondsRemaining, 0);
        assertEq(reason, "EXPIRED");
    }

    function test_accessStatus_returnsNotEligibleForRejectedStamp() public {
        _writeStamp(false, 0);

        (bool allowed, uint64 expiresAt, uint64 secondsRemaining, string memory reason) = gate.accessStatus(user);
        assertFalse(allowed);
        assertEq(expiresAt, 0);
        assertEq(secondsRemaining, 0);
        assertEq(reason, "NOT_ELIGIBLE");
    }

    function test_executeRwaAction_emitsAccessGrantedForEligibleAccount() public {
        _writeStamp(true, uint64(block.timestamp + 1 days));
        (, uint64 expiresAt, bytes32 attestationHash) = registry.isEligible(user);

        vm.expectEmit(true, true, true, true, address(gate));
        emit RwaAccessGate.AccessGranted(user, ACTION_ID, attestationHash, expiresAt);

        vm.prank(user);
        bool executed = gate.executeRwaAction(ACTION_ID);
        assertTrue(executed);
    }

    function test_executeRwaAction_revertsForIneligibleAccount() public {
        _writeStamp(false, 0);

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(RwaAccessGate.NotPassportEligible.selector, user));
        gate.executeRwaAction(ACTION_ID);
    }
}
