"use client"
import { PrivyProvider } from "@privy-io/react-auth"
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana"

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmm8y16dq037y0cjr4nsqjtaa"

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true })

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#2244ff",
          walletList: ["phantom", "solflare", "backpack", "detected_wallets"],
          walletChainType: "solana-only",
        },
        loginMethods: ["wallet"],
        solanaClusters: [
          { name: "mainnet-beta", rpcUrl: "https://api.mainnet-beta.solana.com" },
        ],
        embeddedWallets: {
          createOnLogin: "off",
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
