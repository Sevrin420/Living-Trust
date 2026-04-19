import hre from "hardhat";

// ── Pharaoh V3 on Avalanche C-Chain (43114) ───────────────────────────────────
// Confirmed on-chain addresses:
//   PHAR:  https://snowscan.xyz/token/0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7
//   xPHAR: https://snowscan.xyz/token/0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A
//
// Staking gauge address: find the xPHAR auto-voting gauge on Snowscan or Pharaoh docs.

const ADDRESSES: Record<number, { staking: string; phar: string; xphar: string }> = {
  // ── Avalanche Mainnet ──────────────────────────────────────────────────────
  43114: {
    phar:    "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7", // confirmed
    xphar:   "0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A", // confirmed
    staking: "0x0000000000000000000000000000000000000000",  // TODO: xPHAR auto-voting gauge
  },
  // ── Fuji Testnet (no Pharaoh deployment) ──────────────────────────────────
  43113: {
    phar:    "0x0000000000000000000000000000000000000000",
    xphar:   "0x0000000000000000000000000000000000000000",
    staking: "0x0000000000000000000000000000000000000000",
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
    console.error("\nTo find the xPHAR staking gauge address:");
    console.error("1. Go to https://snowscan.xyz/address/0xE8164Ea89665DAb7a553e667F81F30CfDA736B9A#readContract");
    console.error("2. Look for a gauge() or autoVotingVault() getter and copy that address");
    throw new Error("Update deploy.ts with the missing addresses before deploying");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeploying XPharVaultFactory on chain ${chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`  Staking: ${cfg.staking}`);
  console.log(`  PHAR:    ${cfg.phar}`);
  console.log(`  xPHAR:   ${cfg.xphar}`);

  const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
  const factory = await Factory.deploy(cfg.staking, cfg.phar, cfg.xphar);
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log(`\nXPharVaultFactory deployed at: ${address}`);
  console.log("\nNext steps:");
  console.log("1. Update FACTORY_ADDRESS in frontend/src/config/contracts.ts with:", address);
  console.log(`2. Verify: npx hardhat verify --network avalanche ${address} ${cfg.staking} ${cfg.phar} ${cfg.xphar}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
