// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FloatVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable usyc; // Tokenized yield fund

    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;

    event Parked(address indexed agent, uint256 amount);
    event Withdrawn(address indexed agent, uint256 amount);

    constructor(address _usdc, address _usyc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        usyc = IERC20(_usyc);
    }

    // Agent parks idle USDC into the vault
    function park(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        totalDeposits += amount;
        
        // In a real implementation on Arc, we'd route this USDC to mint USYC
        // For the hackathon demo, we might just hold it or simulate the USYC interaction
        // Example: usdc.approve(address(usyc), amount); usyc.mint(amount);
        
        emit Parked(msg.sender, amount);
    }

    // Agent withdraws USDC from the vault instantly
    function withdraw(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(deposits[msg.sender] >= amount, "Insufficient deposit");
        
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;

        // In a real implementation, we'd redeem USYC for USDC here before transferring
        // Example: usyc.redeem(amount);

        usdc.safeTransfer(msg.sender, amount);
        
        emit Withdrawn(msg.sender, amount);
    }
    
    // Function to calculate and distribute simulated yield for demo purposes
    function distributeSimulatedYield(address agent, uint256 yieldAmount) external onlyOwner {
        // In reality, USYC appreciates in value. For demo, we just add to deposit.
        deposits[agent] += yieldAmount;
        totalDeposits += yieldAmount;
    }
}
