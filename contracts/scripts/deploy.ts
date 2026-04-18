import hre from "hardhat";

// ── Pharaoh Exchange on Avalanche C-Chain ─────────────────────────────────────
// Update these addresses once you have confirmed contract addresses from
// https://pharaoh.exchange or their official documentation / GitHub.
const ADDRESSES: Record<number, { xphar: string; staking: string; rewardTokens: string[] }> = {
  // Avalanche Mainnet
  43114: {
    xphar: "0x0000000000000000000000000000000000000000",   // TODO: real xPHAR address
    staking: "0x0000000000000000000000000000000000000000", // TODO: Pharaoh gauge address
    rewardTokens: [
      "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // WAVAX
    ],
  },
  // Fuji Testnet
  43113: {
    xphar: "0x0000000000000000000000000000000000000000",
    staking: "0x0000000000000000000000000000000000000000",
    rewardTokens: [
      "0xd00ae08403B9bbb9124bB305C09058E32C39A48f", // WAVAX on Fuji
    ],
  },
};

async function main() {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const config = ADDRESSES[chainId];

  if (!config) {
    throw new Error(`No config for chain ${chainId}`);
  }

  if (config.xphar === hre.ethers.ZeroAddress || config.staking === hre.ethers.ZeroAddress) {
    throw new Error("Update xphar and staking addresses in deploy.ts before deploying");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with: ${deployer.address} on chain ${chainId}`);

  const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
  const factory = await Factory.deploy(config.xphar, config.staking, config.rewardTokens);
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log(`XPharVaultFactory deployed at: ${address}`);
  console.log(`  xPHAR:        ${config.xphar}`);
  console.log(`  Staking:      ${config.staking}`);
  console.log(`  RewardTokens: ${config.rewardTokens.join(", ")}`);

  // Update frontend/src/config/contracts.ts with this address
  console.log("\nUpdate FACTORY_ADDRESS in frontend/src/config/contracts.ts with:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
