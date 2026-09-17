import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IdentityContextSchema } from "@oryon/contracts/identity";
import { CommunicationStudio } from "./CommunicationStudio";
import "./communication.css";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function identity() {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const organization = store.get("oryon_org")?.value;
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

export default async function CommunicationPage() {
	const current = await identity();
	return <CommunicationStudio identity={current} />;
}
