import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IdentityContextSchema } from "@oryon/contracts/identity";
import { OryonAppShell } from "./OryonAppShell";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function getIdentity() {
	const cookieStore = await cookies();
	const session = cookieStore.get(cookieName)?.value;
	const organization = cookieStore.get("oryon_org")?.value;
	if (!session || !organization) redirect("/login");
	const response = await fetch(`${apiUrl}/v1/auth/session`, {
		headers: {
			"X-Oryon-Org": organization,
			Cookie: `${cookieName}=${encodeURIComponent(session)}`,
		},
		cache: "no-store",
	});
	if (!response.ok) redirect("/login");
	const payload = (await response.json()) as { data: unknown };
	return IdentityContextSchema.parse(payload.data);
}

export default async function OryonLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const identity = await getIdentity();
	const userName = identity.user.displayName ?? identity.user.name;
	const userInitials = userName
		.split(/\s+/)
		.map((part) => part[0] ?? "")
		.join("")
		.slice(0, 2)
		.toUpperCase();
	return (
		<OryonAppShell userName={userName} userInitials={userInitials}>
			{children}
		</OryonAppShell>
	);
}
