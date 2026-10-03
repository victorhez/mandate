import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const U = (n: number) => BigInt(Math.round(n * 1e6));
const WINDOW = 3600;

async function setup(opts: { merchants?: string[] } = {}) {
  const [owner, agent, merchant, other, stranger] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockUSDG")).deploy();
  const vault = await (await ethers.getContractFactory("MandateVault")).deploy();
  await token.connect(owner).faucet();
  await token.connect(owner).approve(await vault.getAddress(), U(1000));
  const expiry = (await time.latest()) + 7 * 86400;
  await vault
    .connect(owner)
    .createMandate(agent.address, await token.getAddress(), U(500), U(100), WINDOW, expiry, "Q4 research", opts.merchants ?? []);
  return { owner, agent, merchant, other, stranger, token, vault, expiry };
}

describe("MandateVault", () => {
  it("escrows the budget on creation", async () => {
    const { vault, token } = await setup();
    expect(await token.balanceOf(await vault.getAddress())).to.equal(U(500));
    const m = await vault.getMandate(1);
    expect(m.budget).to.equal(U(500));
    expect(await vault.available(1)).to.equal(U(500));
  });

  it("rejects bad parameters", async () => {
    const { vault, token, agent, owner } = await setup();
    const t = await token.getAddress();
    const exp = (await time.latest()) + 1000;
    await expect(vault.createMandate(agent.address, t, 0, 0, WINDOW, exp, "", [])).to.be.revertedWithCustomError(vault, "BadParams");
    await expect(vault.createMandate(agent.address, t, U(10), U(20), WINDOW, exp, "", [])).to.be.revertedWithCustomError(vault, "BadParams");
    await expect(vault.createMandate(agent.address, t, U(10), U(5), 5, exp, "", [])).to.be.revertedWithCustomError(vault, "BadParams");
    await expect(vault.createMandate(agent.address, t, U(10), U(5), WINDOW, 1, "", [])).to.be.revertedWithCustomError(vault, "BadParams");
    void owner;
  });

  it("holds a payment through the window, then lets anyone release it", async () => {
    const { vault, token, agent, merchant, stranger } = await setup();
    await vault.connect(agent).spend(1, merchant.address, U(40), "GPU credits");
    expect(await vault.available(1)).to.equal(U(460));
    await expect(vault.connect(stranger).release(1)).to.be.revertedWithCustomError(vault, "WindowOpen");
    expect(await token.balanceOf(merchant.address)).to.equal(0);

    await time.increase(WINDOW);
    await vault.connect(stranger).release(1);
    expect(await token.balanceOf(merchant.address)).to.equal(U(40));
    const stats = await vault.merchantStats(merchant.address);
    expect(stats.released).to.equal(1);
    expect(stats.volume).to.equal(U(40));
    await expect(vault.release(1)).to.be.revertedWithCustomError(vault, "NotPending");
  });

  it("lets the owner veto inside the window and returns funds to the mandate", async () => {
    const { vault, token, owner, agent, merchant } = await setup();
    await vault.connect(agent).spend(1, merchant.address, U(80), "Suspicious");
    await expect(vault.connect(agent).veto(1)).to.be.revertedWithCustomError(vault, "NotOwner");
    await vault.connect(owner).veto(1);
    expect(await vault.available(1)).to.equal(U(500));
    expect((await vault.merchantStats(merchant.address)).vetoed).to.equal(1);
    await time.increase(WINDOW);
    await expect(vault.release(1)).to.be.revertedWithCustomError(vault, "NotPending");
    expect(await token.balanceOf(merchant.address)).to.equal(0);
  });

  it("blocks veto after the window closes", async () => {
    const { vault, owner, agent, merchant } = await setup();
    await vault.connect(agent).spend(1, merchant.address, U(10), "ok");
    await time.increase(WINDOW);
    await expect(vault.connect(owner).veto(1)).to.be.revertedWithCustomError(vault, "WindowClosed");
  });

  it("lets the owner approve early", async () => {
    const { vault, token, owner, agent, merchant, stranger } = await setup();
    await vault.connect(agent).spend(1, merchant.address, U(25), "domain renewal");
    await expect(vault.connect(stranger).approve(1)).to.be.revertedWithCustomError(vault, "NotOwner");
    await vault.connect(owner).approve(1);
    expect(await token.balanceOf(merchant.address)).to.equal(U(25));
  });

  it("enforces cap, budget (counting reserved), and agent identity", async () => {
    const { vault, agent, merchant, owner } = await setup();
    await expect(vault.connect(agent).spend(1, merchant.address, U(101), "x")).to.be.revertedWithCustomError(vault, "OverCap");
    await expect(vault.connect(owner).spend(1, merchant.address, U(10), "x")).to.be.revertedWithCustomError(vault, "NotAgent");
    for (let i = 0; i < 5; i++) await vault.connect(agent).spend(1, merchant.address, U(100), "bulk");
    await expect(vault.connect(agent).spend(1, merchant.address, U(1), "x")).to.be.revertedWithCustomError(vault, "OverBudget");
    await vault.connect(owner).veto(2);
    await vault.connect(agent).spend(1, merchant.address, U(100), "again");
  });

  it("enforces the merchant allowlist and lets the owner edit it", async () => {
    const { vault, agent, merchant, other, owner } = await setup({ merchants: [(await ethers.getSigners())[2].address] });
    await vault.connect(agent).spend(1, merchant.address, U(5), "ok");
    await expect(vault.connect(agent).spend(1, other.address, U(5), "no")).to.be.revertedWithCustomError(vault, "MerchantNotAllowed");
    await vault.connect(owner).setMerchant(1, other.address, true);
    await vault.connect(agent).spend(1, other.address, U(5), "now ok");
  });

  it("stops spending after expiry", async () => {
    const { vault, agent, merchant, expiry } = await setup();
    await time.increaseTo(expiry);
    await expect(vault.connect(agent).spend(1, merchant.address, U(1), "late")).to.be.revertedWithCustomError(vault, "MandateInactive");
  });

  it("revoke refunds the free balance and refunds later vetoes straight to the owner", async () => {
    const { vault, token, owner, agent, merchant } = await setup();
    const before = await token.balanceOf(owner.address);
    await vault.connect(agent).spend(1, merchant.address, U(60), "pending");
    await vault.connect(owner).revoke(1);
    expect(await token.balanceOf(owner.address)).to.equal(before + U(440));
    await expect(vault.connect(agent).spend(1, merchant.address, U(1), "x")).to.be.revertedWithCustomError(vault, "MandateInactive");
    await vault.connect(owner).veto(1);
    expect(await token.balanceOf(owner.address)).to.equal(before + U(500));
    expect(await token.balanceOf(await vault.getAddress())).to.equal(0);
  });

  it("revoke leaves already-pending payments settleable", async () => {
    const { vault, token, owner, agent, merchant } = await setup();
    await vault.connect(agent).spend(1, merchant.address, U(60), "keep");
    await vault.connect(owner).revoke(1);
    await time.increase(WINDOW);
    await vault.release(1);
    expect(await token.balanceOf(merchant.address)).to.equal(U(60));
    expect(await token.balanceOf(await vault.getAddress())).to.equal(0);
  });

  it("rotates a leaked agent key", async () => {
    const { vault, agent, merchant, other, owner } = await setup();
    await vault.connect(owner).rotateAgent(1, other.address);
    await expect(vault.connect(agent).spend(1, merchant.address, U(1), "x")).to.be.revertedWithCustomError(vault, "NotAgent");
    await vault.connect(other).spend(1, merchant.address, U(1), "fresh key");
    expect(await vault.mandatesOfAgent(other.address)).to.deep.equal([1n]);
  });

  it("tops up and indexes payments", async () => {
    const { vault, token, owner, agent, merchant } = await setup();
    await token.connect(owner).approve(await vault.getAddress(), U(1000));
    await vault.connect(owner).topUp(1, U(100));
    expect(await vault.available(1)).to.equal(U(600));
    await vault.connect(agent).spend(1, merchant.address, U(1), "a");
    await vault.connect(agent).spend(1, merchant.address, U(2), "b");
    expect(await vault.paymentsOfMandate(1)).to.deep.equal([1n, 2n]);
    expect(await vault.paymentsOfMerchant(merchant.address)).to.deep.equal([1n, 2n]);
    expect(await vault.mandatesOfOwner(owner.address)).to.deep.equal([1n]);
  });
});
