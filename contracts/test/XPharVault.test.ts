import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("XPharVault + XPharVaultFactory", function () {
  // ── Fixtures ────────────────────────────────────────────────────────────────

  async function deployFixture() {
    const [deployer, controller, yieldReceiver, other] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const phar = await MockERC20.deploy("PHAR", "PHAR", 18);

    const MockXPhar = await hre.ethers.getContractFactory("MockXPhar");
    const xphar = await MockXPhar.deploy(await phar.getAddress());

    const MockP33 = await hre.ethers.getContractFactory("MockP33");
    const p33 = await MockP33.deploy(await xphar.getAddress());

    const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
    const factory = await Factory.deploy(
      await p33.getAddress(),
      await phar.getAddress(),
      await xphar.getAddress()
    );

    return { factory, phar, xphar, p33, deployer, controller, yieldReceiver, other };
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
  async function depositPharToVault(
    phar: any, vault: any, signer: any, pharAmount: bigint
  ) {
    await phar.mint(signer.address, pharAmount);
    await phar.connect(signer).approve(await vault.getAddress(), pharAmount);
    await vault.connect(signer).depositPhar(pharAmount);
  }

  // Helper: back P33 with extra xPHAR to cover a new ratio (simulates yield).
  //   extraXphar = xPHAR to add to P33's balance
  //   newRatio   = new xPHAR-per-share ratio (e.g. 1.1e18 = 10% gain)
  async function simulateYield(
    phar: any, xphar: any, p33: any,
    extraXphar: bigint, newRatio: bigint
  ) {
    const [deployer] = await hre.ethers.getSigners();
    const pharNeeded = extraXphar * 2n; // 50% penalty reversal
    await phar.mint(deployer.address, pharNeeded);
    await phar.connect(deployer).approve(await xphar.getAddress(), pharNeeded);
    await xphar.connect(deployer).convertEmissionsToken(pharNeeded);
    // deployer now holds extraXphar xPHAR — send it to p33 as yield backing
    await xphar.connect(deployer).transfer(await p33.getAddress(), extraXphar);
    await p33.setRatio(newRatio);
  }

  // ── Factory ──────────────────────────────────────────────────────────────────

  describe("Factory", function () {
    it("stores protocol addresses", async function () {
      const { factory, p33, phar, xphar } = await loadFixture(deployFixture);
      expect(await factory.p33()).to.equal(await p33.getAddress());
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
      const { vault, controller, yieldReceiver, deployer, p33, phar, xphar } =
        await loadFixture(vaultFixture);
      expect(await vault.controller()).to.equal(controller.address);
      expect(await vault.yieldReceiver()).to.equal(yieldReceiver.address);
      expect(await vault.creator()).to.equal(deployer.address);
      expect(await vault.p33()).to.equal(await p33.getAddress());
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
    it("converts PHAR→xPHAR (50% penalty)→P33 and records xPHAR as principal", async function () {
      const { vault, phar, controller } = await loadFixture(vaultFixture);
      // 100 PHAR → 50 xPHAR (50% penalty) → 50 P33 shares at ratio 1:1
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      expect(await vault.principal()).to.equal(hre.ethers.parseEther("50"));
      expect(await vault.p33Balance()).to.equal(hre.ethers.parseEther("50"));
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
      // no approve — should revert
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

  // ── Gain harvesting ──────────────────────────────────────────────────────────

  describe("Vault – gain harvesting", function () {
    async function gainFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, phar, xphar, p33, controller } = base;
      // 100 PHAR → 50 xPHAR principal → 50 P33 shares
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      // 10% yield: 50 shares * 1.1 ratio = 55 xPHAR value, gain = 5 xPHAR
      await simulateYield(phar, xphar, p33, hre.ethers.parseEther("5"), hre.ethers.parseEther("1.1"));
      return base;
    }

    it("pendingGains reflects appreciation", async function () {
      const { vault } = await loadFixture(gainFixture);
      expect(await vault.pendingGains()).to.equal(hre.ethers.parseEther("5"));
    });

    it("harvestGains sends xPHAR to yieldReceiver and zeroes gains", async function () {
      const { vault, xphar, yieldReceiver, controller } = await loadFixture(gainFixture);
      const before = await xphar.balanceOf(yieldReceiver.address);
      await vault.connect(controller).harvestGains();
      const after = await xphar.balanceOf(yieldReceiver.address);
      expect(after - before).to.equal(hre.ethers.parseEther("5"));
      expect(await vault.pendingGains()).to.equal(0);
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
      const { vault, phar, xphar, p33, controller } = base;
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      await simulateYield(phar, xphar, p33, hre.ethers.parseEther("5"), hre.ethers.parseEther("1.1"));
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

    it("executes after interval and sends gains to yieldReceiver", async function () {
      const { vault, xphar, yieldReceiver, other } = await loadFixture(autoFixture);
      await time.increase(30 * 24 * 3600);
      await vault.connect(other).autoHarvestGains();
      expect(await xphar.balanceOf(yieldReceiver.address))
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
      const { vault, xphar, yieldReceiver, other } = await loadFixture(autoFixture);
      await time.increase(30 * 24 * 3600);
      await vault.connect(other).performUpkeep("0x");
      expect(await xphar.balanceOf(yieldReceiver.address))
        .to.equal(hre.ethers.parseEther("5"));
    });
  });

  // ── Principal management ─────────────────────────────────────────────────────

  describe("Vault – principal management", function () {
    async function principalFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, phar, xphar, p33, controller } = base;
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      await simulateYield(phar, xphar, p33, hre.ethers.parseEther("5"), hre.ethers.parseEther("1.1"));
      return base;
    }

    it("withdrawPrincipal sends xPHAR and reduces principal", async function () {
      const { vault, xphar, controller } = await loadFixture(principalFixture);
      const before = await xphar.balanceOf(controller.address);
      await vault.connect(controller).withdrawPrincipal(
        hre.ethers.parseEther("25"), controller.address
      );
      const after = await xphar.balanceOf(controller.address);
      expect(after - before).to.equal(hre.ethers.parseEther("25"));
      expect(await vault.principal()).to.equal(hre.ethers.parseEther("25"));
    });

    it("withdrawAll redeems all P33 shares and resets principal", async function () {
      const { vault, xphar, controller } = await loadFixture(principalFixture);
      const before = await xphar.balanceOf(controller.address);
      await vault.connect(controller).withdrawAll(controller.address);
      const after = await xphar.balanceOf(controller.address);
      // 50 shares * 1.1 ratio = 55 xPHAR
      expect(after - before).to.equal(hre.ethers.parseEther("55"));
      expect(await vault.principal()).to.equal(0);
      expect(await vault.p33Balance()).to.equal(0);
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

    it("positionSummary returns correct data after deposit", async function () {
      const { vault, phar, controller } = await loadFixture(vaultFixture);
      await depositPharToVault(phar, vault, controller, hre.ethers.parseEther("100"));
      const [shares, value, cost, gains, ratio] = await vault.positionSummary();
      expect(shares).to.equal(hre.ethers.parseEther("50"));
      expect(value).to.equal(hre.ethers.parseEther("50"));
      expect(cost).to.equal(hre.ethers.parseEther("50"));
      expect(gains).to.equal(0n);
      expect(ratio).to.equal(hre.ethers.parseEther("1"));
    });
  });
});
