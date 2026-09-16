import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

export default async function HomePage() {
	const cookieStore = await cookies();
	const session = cookieStore.get(cookieName)?.value;
	redirect(session ? "/os" : "/login");
}
