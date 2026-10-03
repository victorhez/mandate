// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal stablecoin with a public faucet. Testnet only.
contract MockUSDG is ERC20 {
    uint256 public constant DRIP = 1_000e6;
    uint256 public constant COOLDOWN = 1 hours;
    mapping(address => uint256) public lastDrip;

    error TooSoon();

    constructor() ERC20("Mock Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        if (block.timestamp < lastDrip[msg.sender] + COOLDOWN) revert TooSoon();
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, DRIP);
    }
}
