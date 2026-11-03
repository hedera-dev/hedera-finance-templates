import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import scaffoldConfig from "~~/scaffold.config";

export const wagmiConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  return connectorsForWallets([{ groupName: "Supported Wallets", wallets: [metaMaskWallet] }], {
    appName: "Proof of reserve",
    projectId: scaffoldConfig.walletConnectProjectId,
  });
};
