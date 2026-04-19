import { avalanche, avalancheFuji } from "wagmi/chains";

// ── Pharaoh V3 Token Addresses (Avalanche C-Chain 43114) ──────────────────────
export const PHAR_ADDRESS    = "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7" as const;
export const XPHAR_ADDRESS   = "0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A" as const;
// Auto-voting xPHAR staking gauge (TODO: find address on Snowscan)
export const STAKING_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ── Factory Address ───────────────────────────────────────────────────────────
export const FACTORY_ADDRESS: Record<number, `0x${string}`> = {
  [avalanche.id]:     "0x0000000000000000000000000000000000000000", // TODO: paste after deploy
  [avalancheFuji.id]: "0x0000000000000000000000000000000000000000",
};

// ── Factory ABI ───────────────────────────────────────────────────────────────
export const FACTORY_ABI = [
  {
    inputs: [
      { name: "controller",    type: "address" },
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
    outputs: [{
      components: [
        { name: "vault",         type: "address" },
        { name: "creator",       type: "address" },
        { name: "controller",    type: "address" },
        { name: "yieldReceiver", type: "address" },
        { name: "createdAt",     type: "uint256" },
      ],
      name: "",
      type: "tuple[]",
    }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "controller", type: "address" }],
    name: "getVaultsByController",
    outputs: [{
      components: [
        { name: "vault",         type: "address" },
        { name: "creator",       type: "address" },
        { name: "controller",    type: "address" },
        { name: "yieldReceiver", type: "address" },
        { name: "createdAt",     type: "uint256" },
      ],
      name: "",
      type: "tuple[]",
    }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "creator", type: "address" }],
    name: "getVaultsByCreator",
    outputs: [{
      components: [
        { name: "vault",         type: "address" },
        { name: "creator",       type: "address" },
        { name: "controller",    type: "address" },
        { name: "yieldReceiver", type: "address" },
        { name: "createdAt",     type: "uint256" },
      ],
      name: "",
      type: "tuple[]",
    }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "vaultId",      type: "uint256" },
      { indexed: true,  name: "vault",         type: "address" },
      { indexed: true,  name: "creator",       type: "address" },
      { indexed: false, name: "controller",    type: "address" },
      { indexed: false, name: "yieldReceiver", type: "address" },
    ],
    name: "VaultCreated",
    type: "event",
  },
] as const;

// ── Vault ABI ─────────────────────────────────────────────────────────────────
export const VAULT_ABI = [
  // ── Immutables / state ────────────────────────────────────────────────────
  { inputs: [], name: "staking",            outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "phar",               outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "xphar",              outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "factory",            outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "creator",            outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "createdAt",          outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "controller",         outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "yieldReceiver",      outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "principal",          outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "autoHarvestEnabled", outputs: [{ name: "", type: "bool"    }], stateMutability: "view", type: "function" },
  { inputs: [], name: "harvestInterval",    outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lastHarvestAt",      outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "gasRefund",          outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },

  // ── View functions ────────────────────────────────────────────────────────
  { inputs: [], name: "stakedBalance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "pendingGains",  outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "avaxBalance",   outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "nextHarvestAt", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  {
    inputs: [],
    name: "positionSummary",
    outputs: [
      { name: "staked",     type: "uint256" },
      { name: "pending",    type: "uint256" },
      { name: "cost",       type: "uint256" },
      { name: "rewardTok",  type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes" }],
    name: "checkUpkeep",
    outputs: [{ name: "upkeepNeeded", type: "bool" }, { name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },

  // ── Deposits ──────────────────────────────────────────────────────────────
  { inputs: [{ name: "pharAmount", type: "uint256" }], name: "depositPhar",  outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount",     type: "uint256" }], name: "depositXPhar", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Harvesting ────────────────────────────────────────────────────────────
  { inputs: [],                             name: "harvestGains",     outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [],                             name: "autoHarvestGains", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "", type: "bytes" }],  name: "performUpkeep",    outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Principal management ──────────────────────────────────────────────────
  { inputs: [{ name: "xpharAmount", type: "uint256" }, { name: "to", type: "address" }], name: "withdrawPrincipal", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "to", type: "address" }], name: "withdrawAll", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Auto-harvest config ───────────────────────────────────────────────────
  { inputs: [{ name: "enabled",  type: "bool"    }], name: "setAutoHarvestEnabled", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "interval", type: "uint256" }], name: "setHarvestInterval",    outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount",   type: "uint256" }], name: "setGasRefund",          outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "amount",   type: "uint256" }, { name: "to", type: "address" }], name: "withdrawAvax", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Governance ────────────────────────────────────────────────────────────
  { inputs: [{ name: "newController", type: "address" }], name: "setController",    outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "newReceiver",   type: "address" }], name: "setYieldReceiver", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "rescueToken", outputs: [], stateMutability: "nonpayable", type: "function" },

  // ── Events ────────────────────────────────────────────────────────────────
  { anonymous: false, inputs: [{ indexed: false, name: "xpharStaked",    type: "uint256" }, { indexed: false, name: "xpharPrincipal", type: "uint256" }, { indexed: false, name: "totalPrincipal", type: "uint256" }], name: "Deposited",         type: "event" },
  { anonymous: false, inputs: [{ indexed: false, name: "rewardAmount",   type: "uint256" }, { indexed: true,  name: "rewardToken",    type: "address"  }, { indexed: true, name: "receiver", type: "address" }],        name: "GainsHarvested",   type: "event" },
  { anonymous: false, inputs: [{ indexed: false, name: "xpharAmount",    type: "uint256" }, { indexed: true,  name: "to",             type: "address"  }], name: "PrincipalWithdrawn", type: "event" },
  { anonymous: false, inputs: [{ indexed: true,  name: "executor",       type: "address" }, { indexed: false, name: "refundPaid",     type: "uint256"  }], name: "AutoHarvested",      type: "event" },
  { anonymous: false, inputs: [{ indexed: true,  name: "oldController",  type: "address" }, { indexed: true,  name: "newController",  type: "address"  }], name: "ControllerChanged",     type: "event" },
  { anonymous: false, inputs: [{ indexed: true,  name: "oldReceiver",    type: "address" }, { indexed: true,  name: "newReceiver",    type: "address"  }], name: "YieldReceiverChanged",  type: "event" },
] as const;

// ── ERC20 ABI (for PHAR approve/balance/allowance reads) ─────────────────────
export const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf",  outputs: [{ name: "", type: "uint256" }], stateMutability: "view",        type: "function" },
  { inputs: [],                                      name: "decimals",   outputs: [{ name: "", type: "uint8"   }], stateMutability: "view",        type: "function" },
  { inputs: [],                                      name: "symbol",     outputs: [{ name: "", type: "string"  }], stateMutability: "view",        type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve",  outputs: [{ name: "", type: "bool"    }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "to",      type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool"    }], stateMutability: "nonpayable", type: "function" },
] as const;
