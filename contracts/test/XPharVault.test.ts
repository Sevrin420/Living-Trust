import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("XPharVault + XPharVaultFactory", function () {
  // ── Fixtures ────────────────────────────────────────────────────────────────

  async function deployFixture() {
    const [deployer, controller, yieldReceiver, other] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const phar = await MockERC20.deploy("PHAR", "PHAR", 18);
    const rewardToken = await MockERC20.deploy("REWARD", "RWD", 18);

    const MockXPhar = await hre.ethers.getContractFactory("MockXPhar");
    const xphar = await MockXPhar.deploy(await phar.getAddress());

    const MockXPharStaking = await hre.ethers.getContractFactory("MockXPharStaking");
    const staking = await MockXPharStaking.deploy(
      await xphar.getAddress(),
      await rewardToken.getAddress()
    );

    const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
    const factory = await Factory.deploy(
      await staking.getAddress(),
      await phar.getAddress(),
      await xphar.getAddress()
    );

    return { factory, phar, xphar, staking, rewardToken, deployer, controller, yieldReceiver, other };
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

  // Helper: mint PHAR, approve vault, call depositPhar
  async function depositPharToVault(phar: any, vault: any, signer: any, pharAmount: bigint) {
    await phar.mint(signer.address, pharAmount);
    await phar.connect(signer).approve(await vault.getAddress(), pharAmount);
    await vault.connect(signer).depositPhar(pharAmount);
  }

  // Helper: fund the staking mock with reward tokens and set earned for vault
  async function simulateRewards(
    rewardToken: any, staking: any, vault: any,
    rewardAmount: bigint
  ) {
    const [deployer] = await hre.ethers.getSigners();
    await rewardToken.mint(await staking.getAddress(), rewardAmount);
    await staking.setEarned(await vault.getAddress(), rewardAmount);
  }

  // ── Factory ──────────────────────────────────────────────────────────────────

  describe("Factory", function () {
    it("stores protocol addresses", async function () {
      const { factory, staking, phar, xphar } = await loadFixture(deployFixture);
      expect(await factory.staking()).to.equal(await staking.getAddress());
      expect(await factory.phar()).to.equal(await phar.getAddress());
      expect(await factory.xphar()).to.equal(await xphar.getAddress());
    });

    it("emits VaultCreated and indexes by controller and creator", async function () {
      const { factory, controller, yieldReceiver, deployer } = await loadFixture(deployFixture);
      await expect(factory.createVault(controller.address, yieldReceiver.address))
        .to.emit(factory, "VaultCreated");
      const byCtrl = await factory.getVaultsByController(controller.address);
      const byCreator = await factory.getVaultsByCreator(deployer.address);
      expect(byCtrl).to.have.length(1);
      expect(byCreator).to.have.length(1);
      expect(byCtrl[0].yieldReceiver).to.equal(yieldReceiver.address);
    });

    it("reverts on zero controller", async function () {
      const { factory, yieldReceiver } = await loadFixture(deployFixture);
      await expect(factory.createVault(hre.ethers.ZeroAddress, yieldReceiver.address))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  // ── Initial state ────────────────────────────────────────────────────────────

  describe("Vault – initial state", function () {
    it("has correct addresses and defaults", async function () {
      const { vault, controller, yieldReceiver, deployer, staking, phar, xphar } =
        await loadFixture(vaultFixture);
      expect(await vault.controller()).to.equal(controller.address);
      expect(await vault.yieldReceiver()).to.equal(yieldReceiver.address);
      expect(await vault.creator()).to.equal(deployer.address);
      expect(await vault.staking()).to.equal(await staking.getAddress());
      expect(await vault.phar()).to.equal(await phar.getAddress());
      expect(await vault.xphar()).to.equal(await xphar.getAddress());
      expect(await vault.autoHarvestEnabled()).to.equal(false);
      expect(await vault.harvestInterval()).to.equal(30 * 24 * 3600);
      expect(await vault.gasRefund()).to.equal(0);
      expect(await vault.principal()).to.equal(0);
    });
  });

  // ── depositPhar ──────────────────────────────────────────────────────────────

  describe("Vault – depositPhar", function () {
    it("converts PHAR→xPHAR (50% penalty) and stakes, recording xPHAR as principal", async function () {
      const { vault, phar, staking, controller } = await loadFixture(vaultFixture);
      // 100 PHAR → 50 xPHAR (50% penalty) → staked in gauge
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      expect(await vault.principal()).to.equal(hre.ethers.parseEther("50"));
      expect(await vault.stakedBalance()).to.equal(hre.ethers.parseEther("50"));
      expect(await staking.balanceOf(await vault.getAddress()))
        .to.equal(hre.ethers.parseEther("50"));
    });

    it("accumulates principal across multiple deposits", async function () {
      const { vault, phar, controller } = await loadFixture(vaultFixture);
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("60"));
      // (50 + 30) xPHAR
      expect(await vault.principal()).to.equal(hre.ethers.parseEther("80"));
    });

    it("reverts with zero amount", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await expect(vault.connect(controller).depositPhar(0))
        .to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("reverts if caller has not approved PHAR", async function () {
      const { vault, phar, controller } = await loadFixture(vaultFixture);
      await phar.mint(controller.address, hre.ethers.parseEther("10"));
      await expect(vault.connect(controller).depositPhar(hre.ethers.parseEther("10")))
        .to.be.reverted;
    });

    it("emits Deposited event", async function () {
      const { vault, phar, controller } = await loadFixture(vaultFixture);
      await phar.mint(controller.address, hre.ethers.parseEther("100"));
      await phar.connect(controller).approve(await vault.getAddress(), hre.ethers.parseEther("100"));
      await expect(vault.connect(controller).depositPhar(hre.ethers.parseEther("100")))
        .to.emit(vault, "Deposited");
    });
  });

  // ── depositXPhar ─────────────────────────────────────────────────────────────

  describe("Vault – depositXPhar", function () {
    it("stakes xPHAR directly and records principal", async function () {
      const { vault, phar, xphar, controller } = await loadFixture(vaultFixture);
      // mint xPHAR directly by converting PHAR (deployer converts, controller receives)
      const [deployer] = await hre.ethers.getSigners();
      await phar.mint(deployer.address, hre.ethers.parseEther("200"));
      await phar.approve(await xphar.getAddress(), hre.ethers.parseEther("200"));
      await xphar.convertEmissionsToken(hre.ethers.parseEther("200")); // → 100 xPHAR
      await (xphar as any).transfer(controller.address, hre.ethers.parseEther("100"));

      await (xphar as any).connect(controller).approve(await vault.getAddress(), hre.ethers.parseEther("100"));
      await vault.connect(controller).depositXPhar(hre.ethers.parseEther("100"));

      expect(await vault.principal()).to.equal(hre.ethers.parseEther("100"));
      expect(await vault.stakedBalance()).to.equal(hre.ethers.parseEther("100"));
    });

    it("reverts with zero amount", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await expect(vault.connect(controller).depositXPhar(0))
        .to.be.revertedWithCustomError(vault, "ZeroAmount");
    });
  });

  // ── Gain harvesting ──────────────────────────────────────────────────────────

  describe("Vault – gain harvesting", function () {
    async function gainFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, phar, rewardToken, staking, controller } = base;
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      // simulate 5 reward tokens earned
      await simulateRewards(rewardToken, staking, vault, hre.ethers.parseEther("5"));
      return base;
    }

    it("pendingGains returns accrued reward tokens", async function () {
      const { vault } = await loadFixture(gainFixture);
      expect(await vault.pendingGains()).to.equal(hre.ethers.parseEther("5"));
    });

    it("harvestGains sends reward tokens to yieldReceiver", async function () {
      const { vault, rewardToken, yieldReceiver, controller } = await loadFixture(gainFixture);
      const before = await rewardToken.balanceOf(yieldReceiver.address);
      await vault.connect(controller).harvestGains();
      const after = await rewardToken.balanceOf(yieldReceiver.address);
      expect(after - before).to.equal(hre.ethers.parseEther("5"));
      expect(await vault.pendingGains()).to.equal(0);
    });

    it("principal (staked xPHAR) is unchanged after harvest", async function () {
      const { vault, controller } = await loadFixture(gainFixture);
      const principalBefore = await vault.principal();
      const stakedBefore = await vault.stakedBalance();
      await vault.connect(controller).harvestGains();
      expect(await vault.principal()).to.equal(principalBefore);
      expect(await vault.stakedBalance()).to.equal(stakedBefore);
    });

    it("reverts when there are no gains", async function () {
      const { vault, phar, controller } = await loadFixture(vaultFixture);
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      await expect(vault.connect(controller).harvestGains())
        .to.be.revertedWithCustomError(vault, "NoGains");
    });

    it("reverts for non-controller", async function () {
      const { vault, other } = await loadFixture(gainFixture);
      await expect(vault.connect(other).harvestGains())
        .to.be.revertedWithCustomError(vault, "NotController");
    });
  });

  // ── Auto-harvest ─────────────────────────────────────────────────────────────

  describe("Vault – auto-harvest", function () {
    async function autoFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, phar, rewardToken, staking, controller } = base;
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      await simulateRewards(rewardToken, staking, vault, hre.ethers.parseEther("5"));
      await controller.sendTransaction({
        to: await vault.getAddress(),
        value: hre.ethers.parseEther("1"),
      });
      await vault.connect(controller).setAutoHarvestEnabled(true);
      return base;
    }

    it("reverts when disabled", async function () {
      const { vault, other } = await loadFixture(vaultFixture);
      await expect(vault.connect(other).autoHarvestGains())
        .to.be.revertedWithCustomError(vault, "AutoHarvestDisabled");
    });

    it("reverts before interval elapses", async function () {
      const { vault } = await loadFixture(autoFixture);
      await expect(vault.autoHarvestGains())
        .to.be.revertedWithCustomError(vault, "TooEarly");
    });

    it("executes after interval and sends rewards to yieldReceiver", async function () {
      const { vault, rewardToken, yieldReceiver, other } = await loadFixture(autoFixture);
      await time.increase(30 * 24 * 3600);
      await vault.connect(other).autoHarvestGains();
      expect(await rewardToken.balanceOf(yieldReceiver.address))
        .to.equal(hre.ethers.parseEther("5"));
    });

    it("blocks second call before next interval", async function () {
      const { vault } = await loadFixture(autoFixture);
      await time.increase(30 * 24 * 3600);
      await vault.autoHarvestGains();
      await expect(vault.autoHarvestGains())
        .to.be.revertedWithCustomError(vault, "TooEarly");
    });

    it("checkUpkeep returns true when due with pending gains", async function () {
      const { vault } = await loadFixture(autoFixture);
      await time.increase(30 * 24 * 3600);
      const [needed] = await vault.checkUpkeep("0x");
      expect(needed).to.be.true;
    });

    it("performUpkeep harvests via Chainlink path", async function () {
      const { vault, rewardToken, yieldReceiver, other } = await loadFixture(autoFixture);
      await time.increase(30 * 24 * 3600);
      await vault.connect(other).performUpkeep("0x");
      expect(await rewardToken.balanceOf(yieldReceiver.address))
        .to.equal(hre.ethers.parseEther("5"));
    });
  });

  // ── Principal management ─────────────────────────────────────────────────────

  describe("Vault – principal management", function () {
    async function principalFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, phar, controller } = base;
      // 100 PHAR → 50 xPHAR staked
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      return base;
    }

    it("withdrawPrincipal unstakes xPHAR and reduces principal", async function () {
      const { vault, xphar, controller } = await loadFixture(principalFixture);
      const before = await (xphar as any).balanceOf(controller.address);
      await vault.connect(controller).withdrawPrincipal(
        hre.ethers.parseEther("25"), controller.address
      );
      const after = await (xphar as any).balanceOf(controller.address);
      expect(after - before).to.equal(hre.ethers.parseEther("25"));
      expect(await vault.principal()).to.equal(hre.ethers.parseEther("25"));
      expect(await vault.stakedBalance()).to.equal(hre.ethers.parseEther("25"));
    });

    it("withdrawAll unstakes all xPHAR and resets principal", async function () {
      const { vault, xphar, controller } = await loadFixture(principalFixture);
      const before = await (xphar as any).balanceOf(controller.address);
      await vault.connect(controller).withdrawAll(controller.address);
      const after = await (xphar as any).balanceOf(controller.address);
      expect(after - before).to.equal(hre.ethers.parseEther("50"));
      expect(await vault.principal()).to.equal(0);
      expect(await vault.stakedBalance()).to.equal(0);
    });

    it("non-controller cannot withdrawPrincipal", async function () {
      const { vault, other } = await loadFixture(principalFixture);
      await expect(
        vault.connect(other).withdrawPrincipal(hre.ethers.parseEther("1"), other.address)
      ).to.be.revertedWithCustomError(vault, "NotController");
    });
  });

  // ── Governance ───────────────────────────────────────────────────────────────

  describe("Vault – governance", function () {
    it("controller changes controller", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setController(other.address);
      expect(await vault.controller()).to.equal(other.address);
    });

    it("controller changes yield receiver", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setYieldReceiver(other.address);
      expect(await vault.yieldReceiver()).to.equal(other.address);
    });

    it("controller withdraws AVAX", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await controller.sendTransaction({
        to: await vault.getAddress(),
        value: hre.ethers.parseEther("0.5"),
      });
      const before = await hre.ethers.provider.getBalance(controller.address);
      const tx = await vault.connect(controller).withdrawAvax(
        hre.ethers.parseEther("0.5"), controller.address
      );
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const after = await hre.ethers.provider.getBalance(controller.address);
      expect(after - before + gasCost).to.equal(hre.ethers.parseEther("0.5"));
    });

    it("setHarvestInterval rejects values below 1 day", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await expect(vault.connect(controller).setHarvestInterval(3600))
        .to.be.revertedWithCustomError(vault, "IntervalTooShort");
    });

    it("positionSummary returns staked, pending, cost, rewardToken", async function () {
      const { vault, phar, rewardToken, staking, controller } = await loadFixture(vaultFixture);
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      await simulateRewards(rewardToken, staking, vault, hre.ethers.parseEther("3"));
      const [staked, pending, cost, rwdTok] = await vault.positionSummary();
      expect(staked).to.equal(hre.ethers.parseEther("50"));
      expect(cost).to.equal(hre.ethers.parseEther("50"));
      expect(pending).to.equal(hre.ethers.parseEther("3"));
      expect(rwdTok).to.equal(await rewardToken.getAddress());
    });
  });
});
