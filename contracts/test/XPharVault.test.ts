import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
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
    const { factory, controller, yieldReceiver } = base;

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

  // ── Vault: basic operations ───────────────────────────────────────────────

  describe("Vault – basic", function () {
    it("has correct initial state", async function () {
      const { vault, controller, yieldReceiver, deployer } = await loadFixture(vaultFixture);
      expect(await vault.controller()).to.equal(controller.address);
      expect(await vault.yieldReceiver()).to.equal(yieldReceiver.address);
      expect(await vault.creator()).to.equal(deployer.address);
      expect(await vault.autoClaimEnabled()).to.equal(false);
      expect(await vault.claimInterval()).to.equal(7 * 24 * 3600);
    });

    it("stakes xPHAR via stakeAll", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();
      expect(await vault.stakedBalance()).to.equal(hre.ethers.parseEther("100"));
      expect(await vault.unstakedBalance()).to.equal(0);
    });

    it("claims yield and forwards to yieldReceiver", async function () {
      const { vault, xphar, wavax, staking, controller, yieldReceiver } =
        await loadFixture(vaultFixture);

      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();

      const reward = hre.ethers.parseEther("10");
      await wavax.mint(await staking.getAddress(), reward);
      await staking.creditReward(await vault.getAddress(), reward);

      const before = await wavax.balanceOf(yieldReceiver.address);
      await vault.connect(controller).claimYield();
      const after = await wavax.balanceOf(yieldReceiver.address);

      expect(after - before).to.equal(reward);
    });

    it("reverts staking from non-controller", async function () {
      const { vault, xphar, other } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("1"));
      await expect(vault.connect(other).stakeAll()).to.be.revertedWithCustomError(vault, "NotController");
    });

    it("allows controller to transfer control", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setController(other.address);
      expect(await vault.controller()).to.equal(other.address);
    });

    it("unstakes all and returns xPHAR to vault", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("50"));
      await vault.connect(controller).stakeAll();
      await vault.connect(controller).unstakeAll();
      expect(await vault.unstakedBalance()).to.equal(hre.ethers.parseEther("50"));
    });
  });

  // ── Vault: auto-claim ─────────────────────────────────────────────────────

  describe("Vault – auto-claim", function () {
    async function autoClaimFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, xphar, wavax, staking, controller } = base;
      const vaultAddr = await vault.getAddress();

      // Stake some xPHAR
      await xphar.mint(vaultAddr, hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();

      // Fund vault with AVAX for gas bounty
      await controller.sendTransaction({ to: vaultAddr, value: hre.ethers.parseEther("1") });

      // Enable auto-claim
      await vault.connect(controller).setAutoClaimEnabled(true);
      await vault.connect(controller).setGasRefund(hre.ethers.parseEther("0.05"));

      // Credit rewards
      const reward = hre.ethers.parseEther("5");
      await wavax.mint(await staking.getAddress(), reward);
      await staking.creditReward(vaultAddr, reward);

      return { ...base, reward };
    }

    it("reverts if auto-claim is disabled", async function () {
      const { vault, other } = await loadFixture(vaultFixture);
      await expect(vault.connect(other).autoClaimYield())
        .to.be.revertedWithCustomError(vault, "AutoClaimDisabled");
    });

    it("reverts if called before interval elapses", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setAutoClaimEnabled(true);
      await expect(vault.connect(other).autoClaimYield())
        .to.be.revertedWithCustomError(vault, "TooEarly");
    });

    it("allows anyone to call after interval and pays AVAX bounty", async function () {
      const { vault, wavax, yieldReceiver, other, reward } = await loadFixture(autoClaimFixture);

      // Advance time by 7 days
      await time.increase(7 * 24 * 3600);

      const callerAvaxBefore = await hre.ethers.provider.getBalance(other.address);
      const tx = await vault.connect(other).autoClaimYield();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const callerAvaxAfter = await hre.ethers.provider.getBalance(other.address);

      // Caller should receive 0.05 AVAX minus gas
      const refund = hre.ethers.parseEther("0.05");
      expect(callerAvaxAfter - callerAvaxBefore + gasCost).to.equal(refund);

      // Yield should have gone to yieldReceiver
      expect(await wavax.balanceOf(yieldReceiver.address)).to.equal(reward);
    });

    it("emits AutoClaimed event", async function () {
      const { vault, other } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      await expect(vault.connect(other).autoClaimYield())
        .to.emit(vault, "AutoClaimed")
        .withArgs(other.address, hre.ethers.parseEther("0.05"));
    });

    it("cannot be called again before next interval", async function () {
      const { vault, other } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      await vault.connect(other).autoClaimYield();

      await expect(vault.connect(other).autoClaimYield())
        .to.be.revertedWithCustomError(vault, "TooEarly");
    });

    it("checkUpkeep returns true when due", async function () {
      const { vault } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      const [upkeepNeeded] = await vault.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(true);
    });

    it("checkUpkeep returns false before interval", async function () {
      const { vault } = await loadFixture(autoClaimFixture);
      const [upkeepNeeded] = await vault.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });

    it("performUpkeep claims yield (Chainlink path)", async function () {
      const { vault, wavax, yieldReceiver, reward, other } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      await vault.connect(other).performUpkeep("0x");
      expect(await wavax.balanceOf(yieldReceiver.address)).to.equal(reward);
    });

    it("controller can withdraw AVAX from vault", async function () {
      const { vault, controller } = await loadFixture(autoClaimFixture);
      const vaultBalance = await vault.avaxBalance();
      const before = await hre.ethers.provider.getBalance(controller.address);
      const tx = await vault.connect(controller).withdrawAvax(vaultBalance, controller.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const after = await hre.ethers.provider.getBalance(controller.address);
      expect(after - before + gasCost).to.equal(vaultBalance);
    });

    it("reverts setClaimInterval below 1 hour", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await expect(
        vault.connect(controller).setClaimInterval(1800)
      ).to.be.revertedWithCustomError(vault, "IntervalTooShort");
    });
  });
});
