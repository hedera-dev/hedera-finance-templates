import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import scaffoldConfig from "~~/scaffold.config";

// MetaMask only: the learner signs their own pledge with it. There is no burner wallet.
export const wagmiConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  return connectorsForWallets([{ groupName: "Supported Wallets", wallets: [metaMaskWallet] }], {
    appName: "collateral-mobility",
    projectId: scaffoldConfig.walletConnectProjectId,
  });
};
