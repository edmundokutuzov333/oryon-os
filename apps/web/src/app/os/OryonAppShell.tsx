"use client";
import { usePathname } from "next/navigation";
import { AppShell, type NavItem } from "@oryon/ui";
import type { ReactNode } from "react";

const navItems: NavItem[] = [
	{ href: "/os/work", label: "Work" },
	{ href: "/os/search", label: "Search + AI" },
	{ href: "/os/docs", label: "Docs" },
	{ href: "/os/communication", label: "Comunicação" },
	{ href: "/os/meetings", label: "Meetings" },
	{ href: "/os/graph", label: "Graph" },
	{ href: "/os/permissions", label: "Permissions" },
	{ href: "/os/agents", label: "Agents" },
	{ href: "/os/automations", label: "Automations" },
	{ href: "/os/templates", label: "Templates" },
	{ href: "/os/platform", label: "Platform" },
];

export function OryonAppShell({
	userName,
	userInitials,
	children,
}: {
	userName: string;
	userInitials: string;
	children: ReactNode;
}) {
	const pathname = usePathname();
	const activeHref = navItems.find(
		(item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
	)?.href;
	return (
		<AppShell
			navItems={navItems}
			launcherItems={navItems}
			activeHref={activeHref}
			userName={userName}
			userInitials={userInitials}
		>
			{children}
		</AppShell>
	);
}
