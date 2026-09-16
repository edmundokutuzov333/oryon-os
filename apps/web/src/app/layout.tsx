import type { Metadata } from "next";
import "@oryon/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
	title: "OryonOS V1",
	description: "Sistema operativo da empresa.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="pt">
			<body>{children}</body>
		</html>
	);
}
