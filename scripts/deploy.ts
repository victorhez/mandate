import { ethers, network } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with ${deployer.address} on ${network.name}`);

  const vault = await (await ethers.getContractFactory("MandateVault")).deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`MandateVault  ${vaultAddress}`);

  let tokenAddress = process.env.TOKEN_ADDRESS ?? "";
  if (!tokenAddress) {
    const token = await (await ethers.getContractFactory("MockUSDG")).deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log(`MockUSDG      ${tokenAddress}`);
  }

  const receipt = await vault.deploymentTransaction()?.wait();
  const env =
    `VITE_VAULT_ADDRESS=${vaultAddress}\n` +
    `VITE_DEPLOY_BLOCK=${receipt?.blockNumber ?? 0}\n` +
    `VITE_TOKEN_ADDRESS=${tokenAddress}\n` +
    `VITE_CHAIN_ID=${network.config.chainId}\n`;
  writeFileSync(join(__dirname, "..", "web", ".env.production.local"), env);
  console.log("\nWrote web/.env.production.local");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
