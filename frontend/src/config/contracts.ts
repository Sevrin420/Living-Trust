import { avalanche, avalancheFuji } from "wagmi/chains";

// ── Pharaoh V3 Token Addresses (Avalanche C-Chain 43114) ──────────────────────
// Confirmed via DeFiLlama dimension-adapters and on-chain data:
export const PHAR_ADDRESS = "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7" as const;
export const XPHAR_ADDRESS = "0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A" as const;

// VoteModule + Voter: read from xPHAR contract on Snowscan
//   https://snowscan.xyz/address/0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A#readContract
//   Call VOTE_MODULE() and VOTER()
export const VOTE_MODULE_ADDRESS = "0x0000000000000000000000000000000000000000" as const; // TODO
export const VOTER_ADDRESS = "0x0000000000000000000000000000000000000000" as const; // TODO

// ── Factory Address ───────────────────────────────────────────────────────────
// Deploy with: cd contracts && npm run deploy:avax
// Then paste the deployed address here.
export const FACTORY_ADDRESS: Record<number, `0x${string}`> = {
  [avalanche.id]: "0x0000000000000000000000000000000000000000", // TODO: paste after deploy
  [avalancheFuji.id]: "0x0000000000000000000000000000000000000000",
};

// ── Common Avalanche tokens (reward tokens for FeeDistributors) ───────────────
export const WAVAX_ADDRESS = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" as const;
export const USDC_ADDRESS = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6" as const;
export const USDT_ADDRESS = "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7" as const;

// ── Factory ABI ───────────────────────────────────────────────────────────────
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

// ── Vault ABI ─────────────────────────────────────────────────────────────────
export const VAULT_ABI = [
  // ── View ──────────────────────────────────────────────────────────────────
  { inputs: [], name: "controller", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "yieldReceiver", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "creator", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "createdAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "stakedBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "unstakedBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "avaxBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getFeeDistributors", outputs: [{ name: "", type: "address[]" }], stateMutability: "view", type: "function" },
  // Auto-claim view
  { inputs: [], name: "autoClaimEnabled", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "claimInterval", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastClaimAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "nextClaimAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "gasRefund", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "", type: "bytes" }], name: "checkUpkeep", outputs: [{ name: "upkeepNeeded", type: "bool" }, { name: "", type: "bytes" }], stateMutability: "view", type: "function" },

  // ── Staking ───────────────────────────────────────────────────────────────
  { inputs: [], name: "stakeAll", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "stake", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "unstakeAll", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "unstake", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Voting ────────────────────────────────────────────────────────────────
  {
    inputs: [
      { name: "_pools", type: "address[]" },
      { name: "_weights", type: "uint256[]" },
    ],
    name: "vote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── Yield claiming ────────────────────────────────────────────────────────
  {
    inputs: [
      { name: "_feeDistributors", type: "address[]" },
      { name: "_tokens", type: "address[][]" },
    ],
    name: "claimYield",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "claimStoredYield", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "autoClaimYield", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── FeeDistributor management ─────────────────────────────────────────────
  {
    inputs: [{ name: "fd", type: "address" }, { name: "tokens", type: "address[]" }],
    name: "addFeeDistributor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "index", type: "uint256" }],
    name: "removeFeeDistributor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── Auto-claim config ─────────────────────────────────────────────────────
  { inputs: [{ name: "enabled", type: "bool" }], name: "setAutoClaimEnabled", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "interval", type: "uint256" }], name: "setClaimInterval", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "setGasRefund", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "withdrawAvax", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Config ────────────────────────────────────────────────────────────────
  { inputs: [{ name: "newController", type: "address" }], name: "setController", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "newReceiver", type: "address" }], name: "setYieldReceiver", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "rescueToken", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount", type: "uint256" }], name: "convertPharToXPhar", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Events ────────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "pools", type: "address[]" },
      { indexed: false, name: "weights", type: "uint256[]" },
    ],
    name: "Voted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "receiver", type: "address" }],
    name: "YieldClaimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "executor", type: "address" },
      { indexed: false, name: "refundPaid", type: "uint256" },
    ],
    name: "AutoClaimed",
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
