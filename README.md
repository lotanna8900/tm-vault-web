# TM Vault - Web3 Investment Interface

## Live Demo
[[Insert Vercel URL](https://tm-vault-web.vercel.app/)]

## Features Implemented
- ✅ Privy wallet authentication
- ✅ Multi-vault selection (Stable/Growth/Turbo)
- ✅ Two-step Approve → Deposit flow
- ✅ Real-time balance tracking
- ✅ Transaction history with event logs
- ✅ Withdraw functionality
- ✅ Network validation
- ✅ Confetti animation on success
- ✅ Error handling for edge cases

## Tech Stack
- **React + Vite** - Fast dev environment
- **Wagmi + Viem** - Type-safe Ethereum interactions
- **Privy** - Seamless wallet onboarding
- **TailwindCSS** - Utility-first styling

## Design Decisions
**Why Web Instead of Mobile:**
Initially started with React Native + Expo, but encountered SDK compatibility issues with the Web3 stack. Pivoted to web to prioritize delivering a working product over debugging tooling conflicts.

**Approve → Deposit Flow:**
Implemented as two separate buttons with clear visual feedback. The approve button disables after success, and the deposit button only activates post-approval.

**Error Handling:**
Added user-friendly messages for common failures (rejected tx, insufficient funds, network errors) instead of raw blockchain errors.

## Running Locally
```bash
npm install
npm run dev
```

## Smart Contract Addresses
- USDC Token: `0x9Eb7D564a9385AB25bfCe2603fa5ed81B79546B2`
- Vault: `0xcd2d4c637E606C41714C434436775fB5E7264820`
- Network: Sepolia Testnet

## Future Improvements
- Add APY calculation based on real vault performance
- Implement pull-to-refresh for balances
- Add transaction confirmation modals
- Support multiple wallet connectors