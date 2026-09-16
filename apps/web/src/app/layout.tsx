import type { Metadata } from "next";
import "@oryon/ui/tokens.css";
import "@oryon/ui/components.css";
import "./globals.css";
import "./work.css";

export const metadata: Metadata = {
  title: "OryonOS V1",
  description: "Sistema operativo da empresa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-MZ"><body>{children}</body></html>;
}
