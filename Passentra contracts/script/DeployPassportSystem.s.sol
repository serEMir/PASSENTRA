// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PassportRegistry} from "../src/PassportRegistry.sol";
import {RwaAccessGate} from "../src/RwaAccessGate.sol";

contract DeployPassportSystem is Script {
    address arbitrumSepoliaForwarder = 0xD41263567DdfeAd91504199b8c6c87371e83ca5d;
    address sepoliaForwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external {
        address trustedForwarder = getTrustedForwarder();

        vm.startBroadcast();
        PassportRegistry registry = new PassportRegistry(trustedForwarder);
        RwaAccessGate gate = new RwaAccessGate(address(registry));
        vm.stopBroadcast();

        console2.log("PassportRegistry:", address(registry));
        console2.log("RwaAccessGate:", address(gate));
        console2.log("TrustedForwarder:", trustedForwarder);
    }

    function getTrustedForwarder() internal view returns (address) {
        if (block.chainid == 11155111) {
            return sepoliaForwarder;
        } else if (block.chainid == 421614) {
            return arbitrumSepoliaForwarder;
        } else {
            revert("Unsupported chain");
        }
    }
}
