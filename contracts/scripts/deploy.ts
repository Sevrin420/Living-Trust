import hre from "hardhat";

// ── Pharaoh V3 on Avalanche C-Chain (43114) ───────────────────────────────────
// Confirmed from DeFiLlama dimension-adapters and official sources:
//   PHAR:       https://snowscan.xyz/token/0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7
//   xPHAR:      https://snowscan.xyz/token/0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A
//
// VoteModule, Voter: read these from xPHAR contract's public immutables on Snowscan:
//   https://snowscan.xyz/address/0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A#readContract
//   (call VOTE_MODULE() and VOTER() getters)
//
// After deploying, submit vault addresses to Pharaoh's exemptTo whitelist:
//   Discord: discord.com/invite/Pharaoh   Twitter: @PharaohExchange

const ADDRESSES: Record<number, {
  phar: string;
  xphar: string;
  voteModule: string;
  voter: string;
}> = {
  // ── Avalanche Mainnet ──────────────────────────────────────────────────────
  43114: {
    phar:       "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7",  // confirmed
    xphar:      "0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A",  // confirmed
    voteModule: "0x0000000000000000000000000000000000000000",   // TODO: read from xPHAR.VOTE_MODULE()
    voter:      "0x0000000000000000000000000000000000000000",   // TODO: read from xPHAR.VOTER()
  },
  // ── Fuji Testnet (no Pharaoh deployment) ──────────────────────────────────
  43113: {
    phar:       "0x0000000000000000000000000000000000000000",
    xphar:      "0x0000000000000000000000000000000000000000",
    voteModule: "0x0000000000000000000000000000000000000000",
    voter:      "0x0000000000000000000000000000000000000000",
  },
};

async function main() {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const cfg = ADDRESSES[chainId];

  if (!cfg) throw new Error(`No config for chain ${chainId}`);

  const missing = Object.entries(cfg)
    .filter(([, v]) => v === hre.ethers.ZeroAddress)
    .map(([k]) => k);

  if (missing.length) {
    console.error("\nMissing addresses:", missing.join(", "));
    console.error("\nTo find VoteModule and Voter addresses:");
    console.error("1. Go to https://snowscan.xyz/address/0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A#readContract");
    console.error("2. Call VOTE_MODULE() → paste into voteModule field above");
    console.error("3. Call VOTER() → paste into voter field above");
    throw new Error("Update deploy.ts with the missing addresses before deploying");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeploying XPharVaultFactory on chain ${chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`  PHAR:        ${cfg.phar}`);
  console.log(`  xPHAR:       ${cfg.xphar}`);
  console.log(`  VoteModule:  ${cfg.voteModule}`);
  console.log(`  Voter:       ${cfg.voter}`);

  const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
  const factory = await Factory.deploy(cfg.xphar, cfg.phar, cfg.voteModule, cfg.voter);
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log(`\nXPharVaultFactory deployed at: ${address}`);
  console.log("\nNext steps:");
  console.log("1. Update FACTORY_ADDRESS in frontend/src/config/contracts.ts with:", address);
  console.log("2. Verify: npx hardhat verify --network avalanche", address, cfg.xphar, cfg.phar, cfg.voteModule, cfg.voter);
  console.log("3. Request Pharaoh team to add factory address to xPHAR exemptTo whitelist");
  console.log("   so users can send xPHAR directly to their vaults.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
