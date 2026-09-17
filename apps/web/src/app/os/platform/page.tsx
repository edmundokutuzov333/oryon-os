import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PlatformStudio from "./PlatformStudio";
import { getPlatformData } from "./platform-data";
const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";
export default async function PlatformPage() {
	const store = await cookies();
	const session = store.get(cookieName)?.value;
	const org = store.get("oryon_org")?.value;
	if (!session || !org) redirect("/login");
	try {
		const data = await getPlatformData(
			apiUrl,
			org,
			`${cookieName}=${encodeURIComponent(session)}`,
		);
		return (
			<PlatformStudio
				initialKeys={data.keys}
				initialWebhooks={data.webhooks}
				audit={data.audit}
			/>
		);
	} catch {
		redirect("/os");
	}
}
