import { Networks, Horizon } from "@stellar/stellar-sdk";
import { config } from "@health-watchers/config";

const networkPassphrase =
  config.stellar.network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

const networkLabel =
  config.stellar.network === "mainnet" ? "MAINNET" : "TESTNET";

console.log(`Stellar network: ${networkLabel}`);

const server = new Horizon.Server(config.stellar.horizonUrl);

export { server, networkPassphrase };
