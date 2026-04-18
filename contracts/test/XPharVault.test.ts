import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("XPharVault + XPharVaultFactory (Pharaoh V3 architecture)", function () {
  // ── Deploy fixture ──────────────────────────────────────────────────────────
  async function deployFixture() {
    const [deployer, controller, yieldReceiver, other] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const xphar = await MockERC20.deploy("xPHAR", "xPHAR", 18);
    const phar = await MockERC20.deploy("PHAR", "PHAR", 18);
    const wavax = await MockERC20.deploy("WAVAX", "WAVAX", 18);
    const usdc = await MockERC20.deploy("USDC", "USDC", 6);

    const MockVoteModule = await hre.ethers.getContractFactory("MockVoteModule");
    const voteModule = await MockVoteModule.deploy(await xphar.getAddress());

    const MockFeeDistributor = await hre.ethers.getContractFactory("MockFeeDistributor");
    const feeDist1 = await MockFeeDistributor.deploy([await wavax.getAddress(), await usdc.getAddress()]);
    const feeDist2 = await MockFeeDistributor.deploy([await wavax.getAddress()]);

    const MockVoter = await hre.ethers.getContractFactory("MockVoter");
    const voter = await MockVoter.deploy();

    const Factory = await hre.ethers.getContractFactory("XPharVaultFactory");
    const factory = await Factory.deploy(
      await xphar.getAddress(),
      await phar.getAddress(),
      await voteModule.getAddress(),
      await voter.getAddress()
    );

    return {
      factory, xphar, phar, wavax, usdc, voteModule, voter, feeDist1, feeDist2,
      deployer, controller, yieldReceiver, other
    };
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

  // ── Factory tests ───────────────────────────────────────────────────────────

  describe("Factory", function () {
    it("stores correct Pharaoh protocol addresses", async function () {
      const { factory, xphar, phar, voteModule, voter } = await loadFixture(deployFixture);
      expect(await factory.xphar()).to.equal(await xphar.getAddress());
      expect(await factory.phar()).to.equal(await phar.getAddress());
      expect(await factory.voteModule()).to.equal(await voteModule.getAddress());
      expect(await factory.voter()).to.equal(await voter.getAddress());
    });

    it("creates vault and emits VaultCreated", async function () {
      const { factory, controller, yieldReceiver } = await loadFixture(deployFixture);
      await expect(factory.createVault(controller.address, yieldReceiver.address))
        .to.emit(factory, "VaultCreated");
    });

    it("indexes vault by controller and creator", async function () {
      const { factory, controller, yieldReceiver, deployer } = await loadFixture(deployFixture);
      await factory.createVault(controller.address, yieldReceiver.address);

      const byCtrl = await factory.getVaultsByController(controller.address);
      const byCreator = await factory.getVaultsByCreator(deployer.address);
      expect(byCtrl).to.have.length(1);
      expect(byCreator).to.have.length(1);
      expect(byCtrl[0].yieldReceiver).to.equal(yieldReceiver.address);
    });

    it("reverts on zero controller address", async function () {
      const { factory, yieldReceiver } = await loadFixture(deployFixture);
      await expect(factory.createVault(hre.ethers.ZeroAddress, yieldReceiver.address))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  // ── Vault: initial state ────────────────────────────────────────────────────

  describe("Vault – initial state", function () {
    it("has correct initial state", async function () {
      const { vault, controller, yieldReceiver, deployer } = await loadFixture(vaultFixture);
      expect(await vault.controller()).to.equal(controller.address);
      expect(await vault.yieldReceiver()).to.equal(yieldReceiver.address);
      expect(await vault.creator()).to.equal(deployer.address);
      expect(await vault.autoClaimEnabled()).to.equal(false);
      expect(await vault.claimInterval()).to.equal(7 * 24 * 3600);
    });
  });

  // ── Vault: staking ──────────────────────────────────────────────────────────

  describe("Vault – staking via VoteModule", function () {
    it("stakes xPHAR via stakeAll", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      const amount = hre.ethers.parseEther("100");
      await xphar.mint(await vault.getAddress(), amount);
      await vault.connect(controller).stakeAll();
      expect(await vault.stakedBalance()).to.equal(amount);
      expect(await vault.unstakedBalance()).to.equal(0);
    });

    it("stakes specific amount via stake()", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      const amount = hre.ethers.parseEther("60");
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("100"));
      await vault.connect(controller).stake(amount);
      expect(await vault.stakedBalance()).to.equal(amount);
      expect(await vault.unstakedBalance()).to.equal(hre.ethers.parseEther("40"));
    });

    it("unstakes via unstakeAll", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("50"));
      await vault.connect(controller).stakeAll();
      await vault.connect(controller).unstakeAll();
      expect(await vault.unstakedBalance()).to.equal(hre.ethers.parseEther("50"));
      expect(await vault.stakedBalance()).to.equal(0);
    });

    it("reverts staking from non-controller", async function () {
      const { vault, xphar, other } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("1"));
      await expect(vault.connect(other).stakeAll())
        .to.be.revertedWithCustomError(vault, "NotController");
    });
  });

  // ── Vault: voting ───────────────────────────────────────────────────────────

  describe("Vault – voting", function () {
    it("controller can cast votes via Voter", async function () {
      const { vault, xphar, controller } = await loadFixture(vaultFixture);
      await xphar.mint(await vault.getAddress(), hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();

      const pool = hre.ethers.Wallet.createRandom().address;
      await expect(vault.connect(controller).vote([pool], [100]))
        .to.emit(vault, "Voted");
    });

    it("non-controller cannot vote", async function () {
      const { vault, other } = await loadFixture(vaultFixture);
      const pool = hre.ethers.Wallet.createRandom().address;
      await expect(vault.connect(other).vote([pool], [100]))
        .to.be.revertedWithCustomError(vault, "NotController");
    });
  });

  // ── Vault: yield claiming ───────────────────────────────────────────────────

  describe("Vault – yield claiming", function () {
    async function rewardFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, xphar, wavax, usdc, controller, feeDist1, feeDist2 } = base;
      const vaultAddr = await vault.getAddress();

      await xphar.mint(vaultAddr, hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();

      // Credit rewards on two FeeDistributors
      const wavaxReward = hre.ethers.parseEther("5");
      const usdcReward = hre.ethers.parseUnits("50", 6);
      await wavax.mint(await feeDist1.getAddress(), wavaxReward);
      await usdc.mint(await feeDist1.getAddress(), usdcReward);
      await feeDist1.creditReward(vaultAddr, await wavax.getAddress(), wavaxReward);
      await feeDist1.creditReward(vaultAddr, await usdc.getAddress(), usdcReward);

      const wavaxReward2 = hre.ethers.parseEther("2");
      await wavax.mint(await feeDist2.getAddress(), wavaxReward2);
      await feeDist2.creditReward(vaultAddr, await wavax.getAddress(), wavaxReward2);

      return { ...base, wavaxReward, usdcReward, wavaxReward2 };
    }

    it("claimYield forwards all fee tokens to yieldReceiver", async function () {
      const {
        vault, wavax, usdc, controller, yieldReceiver,
        feeDist1, feeDist2, wavaxReward, usdcReward, wavaxReward2
      } = await loadFixture(rewardFixture);

      const wavaxAddr = await wavax.getAddress();
      const usdcAddr = await usdc.getAddress();
      const fd1 = await feeDist1.getAddress();
      const fd2 = await feeDist2.getAddress();

      await vault.connect(controller).claimYield(
        [fd1, fd2],
        [[wavaxAddr, usdcAddr], [wavaxAddr]]
      );

      expect(await wavax.balanceOf(yieldReceiver.address)).to.equal(wavaxReward + wavaxReward2);
      expect(await usdc.balanceOf(yieldReceiver.address)).to.equal(usdcReward);
    });

    it("claimStoredYield uses configured FeeDistributors", async function () {
      const {
        vault, wavax, usdc, controller, yieldReceiver,
        feeDist1, feeDist2, wavaxReward, usdcReward, wavaxReward2
      } = await loadFixture(rewardFixture);

      const wavaxAddr = await wavax.getAddress();
      const usdcAddr = await usdc.getAddress();

      // Controller sets up stored distributors
      await vault.connect(controller).addFeeDistributor(
        await feeDist1.getAddress(), [wavaxAddr, usdcAddr]
      );
      await vault.connect(controller).addFeeDistributor(
        await feeDist2.getAddress(), [wavaxAddr]
      );

      await vault.connect(controller).claimStoredYield();

      expect(await wavax.balanceOf(yieldReceiver.address)).to.equal(wavaxReward + wavaxReward2);
      expect(await usdc.balanceOf(yieldReceiver.address)).to.equal(usdcReward);
    });
  });

  // ── Vault: auto-claim ───────────────────────────────────────────────────────

  describe("Vault – auto-claim", function () {
    async function autoClaimFixture() {
      const base = await loadFixture(vaultFixture);
      const { vault, xphar, wavax, controller, feeDist1 } = base;
      const vaultAddr = await vault.getAddress();

      await xphar.mint(vaultAddr, hre.ethers.parseEther("100"));
      await vault.connect(controller).stakeAll();

      const wavaxAddr = await wavax.getAddress();
      await vault.connect(controller).addFeeDistributor(await feeDist1.getAddress(), [wavaxAddr]);

      const reward = hre.ethers.parseEther("3");
      await wavax.mint(await feeDist1.getAddress(), reward);
      await feeDist1.creditReward(vaultAddr, wavaxAddr, reward);

      // Fund vault with AVAX for bounties
      await controller.sendTransaction({ to: vaultAddr, value: hre.ethers.parseEther("1") });
      await vault.connect(controller).setAutoClaimEnabled(true);
      await vault.connect(controller).setGasRefund(hre.ethers.parseEther("0.05"));

      return { ...base, reward };
    }

    it("reverts when disabled", async function () {
      const { vault, other } = await loadFixture(vaultFixture);
      await expect(vault.connect(other).autoClaimYield())
        .to.be.revertedWithCustomError(vault, "AutoClaimDisabled");
    });

    it("reverts before interval elapses", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setAutoClaimEnabled(true);
      await expect(vault.connect(other).autoClaimYield())
        .to.be.revertedWithCustomError(vault, "TooEarly");
    });

    it("pays AVAX bounty after interval and forwards yield", async function () {
      const { vault, wavax, yieldReceiver, other, reward } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);

      const before = await hre.ethers.provider.getBalance(other.address);
      const tx = await vault.connect(other).autoClaimYield();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const after = await hre.ethers.provider.getBalance(other.address);

      expect(after - before + gasCost).to.equal(hre.ethers.parseEther("0.05"));
      expect(await wavax.balanceOf(yieldReceiver.address)).to.equal(reward);
    });

    it("cannot claim again before next interval", async function () {
      const { vault, other } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      await vault.connect(other).autoClaimYield();
      await expect(vault.connect(other).autoClaimYield())
        .to.be.revertedWithCustomError(vault, "TooEarly");
    });

    it("checkUpkeep returns true when due", async function () {
      const { vault } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      const [needed] = await vault.checkUpkeep("0x");
      expect(needed).to.be.true;
    });

    it("performUpkeep claims yield (Chainlink path)", async function () {
      const { vault, wavax, yieldReceiver, reward, other } = await loadFixture(autoClaimFixture);
      await time.increase(7 * 24 * 3600);
      await vault.connect(other).performUpkeep("0x");
      expect(await wavax.balanceOf(yieldReceiver.address)).to.equal(reward);
    });
  });

  // ── Vault: governance ───────────────────────────────────────────────────────

  describe("Vault – governance", function () {
    it("controller can change controller", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setController(other.address);
      expect(await vault.controller()).to.equal(other.address);
    });

    it("controller can change yield receiver", async function () {
      const { vault, controller, other } = await loadFixture(vaultFixture);
      await vault.connect(controller).setYieldReceiver(other.address);
      expect(await vault.yieldReceiver()).to.equal(other.address);
    });

    it("controller can withdraw AVAX", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await controller.sendTransaction({ to: await vault.getAddress(), value: hre.ethers.parseEther("0.5") });

      const before = await hre.ethers.provider.getBalance(controller.address);
      const tx = await vault.connect(controller).withdrawAvax(
        hre.ethers.parseEther("0.5"), controller.address
      );
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const after = await hre.ethers.provider.getBalance(controller.address);
      expect(after - before + gasCost).to.equal(hre.ethers.parseEther("0.5"));
    });

    it("setClaimInterval rejects values below 1 hour", async function () {
      const { vault, controller } = await loadFixture(vaultFixture);
      await expect(vault.connect(controller).setClaimInterval(1800))
        .to.be.revertedWithCustomError(vault, "IntervalTooShort");
    });
  });
});
