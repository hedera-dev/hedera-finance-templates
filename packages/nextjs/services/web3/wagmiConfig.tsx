import { wagmiConnectors } from "./wagmiConnectors";
import { createClient, fallback, http } from "viem";
import { createConfig } from "wagmi";
import scaffoldConfig, { ScaffoldConfig } from "~~/scaffold.config";

const { targetNetworks } = scaffoldConfig;

export const enabledChains = targetNetworks;

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: true,
  client({ chain }) {
    const rpcFallbacks = [];

    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    if (rpcOverrideUrl) {
      rpcFallbacks.push(http(rpcOverrideUrl));
    }

    // A genuinely different provider, not just the same Hashio URl again under another name —
    // viem's own built-in default for Hedera's chains IS the Hashio URL above, so without this
    // a Hashio outage leaves wallet connections and signing with nothing else to try.
    const rpcFallbackOverrideUrl = (scaffoldConfig.rpcFallbackOverrides as ScaffoldConfig["rpcFallbackOverrides"])?.[
      chain.id
    ];
    if (rpcFallbackOverrideUrl) {
      rpcFallbacks.push(http(rpcFallbackOverrideUrl));
    }

    // Default public RPC for the chain (e.g. Hedera testnet hashio)
    rpcFallbacks.push(http());

    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      pollingInterval: scaffoldConfig.pollingInterval,
    });
  },
});
