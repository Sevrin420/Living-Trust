import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("XPharVault + XPharVaultFactory", function () {
  async function deployFixture() {
    const [deployer, controller, yieldReceiver, other] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const xphar = await MockERC20.deploy("xPHAR", "xPHAR", 18);
    const wavax = await MockERC20.deploy("Wrapped AVAX", "WAVAX", 18);

    const MockStaking = await hre.ethers.getContractFactory("MockXPharStaking");
    const staking = await MockStaking.deploy(await xphar.getAddress(), await wavax.getAddress());

    const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
    const factory = await Factory.deploy(
      await xphar.getAddress(),
      await staking.getAddress(),
      [await wavax.getAddress()]
    );

    return { factory, xphar, wavax, staking, deployer, controller, yieldReceiver, other };
  }

  async function vaultFixture() {
    const base = await loadFixture(deployFixture);
    const { factory, controller, yieldReceiver, deployer } = base;

    const tx = await factory.createVault(controller.address, yieldReceiver.address);
    const receipt = await tx.wait();
    const event = receipt?.logs.find((l: any) => l.fragment?.name === "VaultCreated");
    const vaultAddress = (event as any).args.vault;

    const vault = await hre.ethers.getContractAt("XPharVault", vaultAddress);
    return { ...base, vault };
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  describe("Factory", function () {
    it("stores correct protocol addresses", async function () {
      const { factory, xphar, staking } = await loadFixture(deployFixture);
      expect(await factory.xphar()).to.equal(await xphar.getAddress());
      expect(await factory.staking()).to.equal(await staking.getAddress());
    });

    it("creates a vault and emits VaultCreated", async function () {
      const { factory, controller, yieldReceiver } = await loadFixture(deployFixture);
      await expect(factory.createVault(controller.address, yieldReceiver.address))
        .to.emit(factory, "VaultCreated");
    });

    it("tracks vaults by controller and creator", async function () {
      const { factory, controller, yieldReceiver, deployer } = await loadFixture(deployFixture);
      await factory.createVault(controller.address, yieldReceiver.address);

      const byController = await factory.getVaultsByController(controller.address);
      const byCreator = await factory.getVaultsByCreator(deployer.address);

      expect(byController).to.have.length(1);
      expect(byCreator).to.have.length(1);
      expect(byController[0].controller).to.equal(controller.address);
    });

    it("reverts on zero address", async function () {
      const { factory, controller } = await loadFixture(deployFixture);
      await expect(
        factory.createVault(hre.ethers.ZeroAddress, controller.address)
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  // ── Vault ──────────────────────────────────────────────────────────────────

  describe("Vault", function () {
    it("has correct initial state", async function () {
      const { vault, controller, yieldReceiver, deployer } = await loadFixture(vaultFixture);
      expect(await vault.controller()).to.equal(controller.address);
      expect(await vault.yieldReceiver()).to.equal(yieldReceiver.address);
      expect(await vault.creator()).to.equal(deployer.address);
    });

    it("stakes xPHAR via stakeAll", async function () {
      const { vault, xphar, staking, controller } = await loadFixture(vaultFixture);

      const amount = hre.ethers.parseEther("100");
      await xphar.mint(await vault.getAddress(), amount);

      await vault.connect(controller).stakeAll();

      expect(await vault.stakedBalance()).to.equal(amount);
      expect(await vault.unstakedBalance()).to.equal(0);
    });

    it("claims yield and forwards to yieldReceiver", async function () {
      const { vault, xphar, wavax, staking, controller, yieldReceiver } =
        await loadFixture(vaultFixture);

      // Stake xPHAR
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();

      // Credit reward on mock staking contract
      const reward = hre.ethers.parseEther("10");
      await wavax.mint(await staking.getAddress(), reward);
      await staking.creditReward(await vault.getAddress(), reward);

      const receiverBefore = await wavax.balanceOf(yieldReceiver.address);
      await vault.connect(controller).claimYield();
      const receiverAfter = await wavax.balanceOf(yieldReceiver.address);

      expect(receiverAfter - receiverBefore).to.equal(reward);
    });

    it("reverts staking from non-controller", async function () {
      const { vault, xphar, other } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("1"));
      await expect(vault.connect(other).stakeAll()).to.be.revertedWithCustomError(
        vault,
        "NotController"
      );
    });

    it("allows controller to change controller", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setController(other.address);
      expect(await vault.controller()).to.equal(other.address);
    });

    it("allows controller to change yield receiver", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setYieldReceiver(other.address);
      expect(await vault.yieldReceiver()).to.equal(other.address);
    });

    it("unstakes and returns xPHAR to vault", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      const amount = hre.ethers.parseEther("50");
      await xphar.mint(await vault.getAddress(), amount);
      await vault.connect(controller).stakeAll();
      await vault.connect(controller).unstakeAll();
      expect(await vault.unstakedBalance()).to.equal(amount);
      expect(await vault.stakedBalance()).to.equal(0);
    });
  });
});
