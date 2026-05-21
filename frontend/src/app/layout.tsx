import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "tokagentOS — autonomous on-chain agents",
  description:
    "An open-source framework for building autonomous AI agents with native crypto-wallet integration. Bring your own LLM API key, or let the agent's wallet pay per call via x402.",
  metadataBase: new URL("https://tokagent.network"),
  openGraph: {
    title: "tokagentOS — autonomous on-chain agents",
    description:
      "AI agents that hold their own keys. Built on a fork of elizaOS.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
