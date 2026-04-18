import { avalanche, avalancheFuji } from "wagmi/chains";

// ── Contract Addresses ────────────────────────────────────────────────────────
// Update FACTORY_ADDRESS after deploying XPharVaultFactory.
// Run: cd contracts && npm run deploy:avax
//
// Pharaoh Exchange token addresses on Avalanche C-Chain (43114):
//   xPHAR and the gauge/staking contract can be found at https://pharaoh.exchange
//   or their official GitHub / documentation.

export const FACTORY_ADDRESS: Record<number, `0x${string}`> = {
  [avalanche.id]: "0x0000000000000000000000000000000000000000", // TODO: deploy and paste here
  [avalancheFuji.id]: "0x0000000000000000000000000000000000000000",
};

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const FACTORY_ABI = [
  {
    inputs: [
      { name: "controller", type: "address" },
      { name: "yieldReceiver", type: "address" },
    ],
    name: "createVault",
    outputs: [{ name: "vault", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "vaultCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllVaults",
    outputs: [
      {
        components: [
          { name: "vault", type: "address" },
          { name: "creator", type: "address" },
          { name: "controller", type: "address" },
          { name: "yieldReceiver", type: "address" },
          { name: "createdAt", type: "uint256" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "controller", type: "address" }],
    name: "getVaultsByController",
    outputs: [
      {
        components: [
          { name: "vault", type: "address" },
          { name: "creator", type: "address" },
          { name: "controller", type: "address" },
          { name: "yieldReceiver", type: "address" },
          { name: "createdAt", type: "uint256" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "creator", type: "address" }],
    name: "getVaultsByCreator",
    outputs: [
      {
        components: [
          { name: "vault", type: "address" },
          { name: "creator", type: "address" },
          { name: "controller", type: "address" },
          { name: "yieldReceiver", type: "address" },
          { name: "createdAt", type: "uint256" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "vaultId", type: "uint256" },
      { indexed: true, name: "vault", type: "address" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "controller", type: "address" },
      { indexed: false, name: "yieldReceiver", type: "address" },
    ],
    name: "VaultCreated",
    type: "event",
  },
] as const;

export const VAULT_ABI = [
  // View
  { inputs: [], name: "controller", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "yieldReceiver", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "creator", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "createdAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "stakedBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "unstakedBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "token", type: "address" }], name: "claimableYield", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getRewardTokens", outputs: [{ name: "", type: "address[]" }], stateMutability: "view", type: "function" },
  // Auto-claim view
  { inputs: [], name: "autoClaimEnabled", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "claimInterval", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastClaimAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "nextClaimAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "gasRefund", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "avaxBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "", type: "bytes" }], name: "checkUpkeep", outputs: [{ name: "upkeepNeeded", type: "bool" }, { name: "", type: "bytes" }], stateMutability: "view", type: "function" },
  // Write – staking
  { inputs: [], name: "stakeAll", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "stake", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "unstakeAll", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "unstake", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "claimYield", outputs: [], stateMutability: "nonpayable", type: "function" },
  // Write – auto-claim
  { inputs: [], name: "autoClaimYield", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "enabled", type: "bool" }], name: "setAutoClaimEnabled", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "interval", type: "uint256" }], name: "setClaimInterval", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "setGasRefund", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "withdrawAvax", outputs: [], stateMutability: "nonpayable", type: "function" },
  // Write – config
  { inputs: [{ name: "newController", type: "address" }], name: "setController", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "newReceiver", type: "address" }], name: "setYieldReceiver", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "rescueToken", outputs: [], stateMutability: "nonpayable", type: "function" },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "oldController", type: "address" },
      { indexed: true, name: "newController", type: "address" },
    ],
    name: "ControllerChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "tokens", type: "address[]" },
      { indexed: false, name: "amounts", type: "uint256[]" },
      { indexed: true, name: "receiver", type: "address" },
    ],
    name: "YieldClaimed",
    type: "event",
  },
] as const;

export const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;
