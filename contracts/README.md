# contracts/

**Solidity contracts for FLOAT.**

A minimal `FloatVault` contract that accepts USDC park / withdraw from agent wallets, plus the supporting Hardhat + Foundry tooling.

---

## Deployed addresses

| Network       | Contract     | Address                                       |
|---------------|--------------|-----------------------------------------------|
| Arc Testnet   | `FloatVault` | `0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6`  |
| Arc Testnet   | USDC         | `0x3600000000000000000000000000000000000000`  |

---

## What's here

```
contracts/
├── contracts/
│   └── FloatVault.sol            ← the core contract
├── scripts/                       ← Hardhat deployment + helper scripts
├── lib/                           ← Foundry-managed dependencies (OpenZeppelin)
├── foundry.toml
├── hardhat.config.ts
└── package.json
```

This is a **hybrid** Hardhat + Foundry setup. Hardhat handles deploys and TypeScript scripting; Foundry handles fast testing with `forge`.

---

## FloatVault.sol — the API

A thin wrapper around USDC that tracks per-agent deposits and stages them for downstream USYC routing.

```solidity
contract FloatVault is Ownable {
    IERC20 public immutable usdc;
    IERC20 public immutable usyc;            // tokenized yield fund

    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;

    function park(uint256 amount) external;       // safeTransferFrom → credits deposits[msg.sender]
    function withdraw(uint256 amount) external;   // debits deposits[msg.sender] → safeTransfer
}
```

### `park(uint256 amount)`

Pulls `amount` USDC from `msg.sender` (requires prior `approve()`), credits `deposits[msg.sender]`, increments `totalDeposits`, emits `Parked(agent, amount)`.

In the full production implementation, this would `approve()` the USYC contract and call `usyc.mint(amount)` to actually start earning yield. For the hackathon demo, the USDC is held flat (the SDK still reports the target yield based on USYC's external APY for the demo).

### `withdraw(uint256 amount)`

Requires `deposits[msg.sender] >= amount`. Debits the deposit, decrements `totalDeposits`, sends `amount` USDC back to `msg.sender`, emits `Withdrawn(agent, amount)`.

In production this would `usyc.redeem(amount)` first.

---

## Why this design

The vault is intentionally minimal. The smart contract is **not** where the FLOAT logic lives — that's all in the off-chain orchestrator (`dashboard/src/lib/float/`) and the SDK (`sdk/`). The on-chain surface is just:

1. A deterministic deposit ledger per agent (no oracle, no shared state)
2. A safe `transferFrom` / `transfer` mechanism (uses OpenZeppelin's `SafeERC20`)
3. An event stream that lets the FLOAT Second Brain build its narrative

The off-chain layer decides *when* to call `park` / `withdraw`; the on-chain layer guarantees the balance math is correct.

---

## Build

```bash
npm install
forge build
```

Or with Hardhat:

```bash
npx hardhat compile
```

---

## Test

```bash
forge test
```

Or:

```bash
npx hardhat test
```

---

## Deploy to Arc Testnet

```bash
npx hardhat run scripts/deploy.ts --network arc-testnet
```

The current Arc Testnet deployment is already wired into the SDK and dashboard via the addresses above. Redeploy only if you're forking.

---

## Security notes

- Uses `SafeERC20` from OpenZeppelin (handles non-standard ERC-20 return values)
- Single-owner (`Ownable`) — owner can pause/rotate USYC routing in a future version
- No reentrancy guard yet — `safeTransferFrom` and `safeTransfer` are the only external calls and they happen before/after state mutations correctly, but a `ReentrancyGuard` would be a defense-in-depth addition for v1
- No upgradability — intentional. If we need a new version, we deploy fresh and migrate via SDK

---

## License

MIT — see the repo root.
