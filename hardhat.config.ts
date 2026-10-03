import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts,
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_ONE_RPC ?? "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts,
    },
  },
  etherscan: { apiKey: process.env.ARBISCAN_API_KEY ?? "" },
};

export default config;
