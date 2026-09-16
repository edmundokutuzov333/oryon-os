import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IdentityContextSchema } from "@oryon/contracts/identity";
import { LogoutButton } from "./LogoutButton";
import { authCopy } from "../../lib/auth-copy";

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

export default async function WorkspacePage() {
	const identity = await getIdentity();
	const initials = identity.user.displayName?.slice(0, 1) ?? identity.user.name.slice(0, 1);

	return (
		<main className="os-shell">
			<header className="os-chrome">
				<div>
					<p className="eyebrow">{authCopy.eyebrow}</p>
					<p className="org-name">{identity.organization.name}</p>
				</div>
				<div className="profile-chip">
					<span className="avatar" aria-hidden="true">{initials.toUpperCase()}</span>
					<span>{identity.user.displayName ?? identity.user.name}</span>
					<LogoutButton />
				</div>
			</header>

			<section className="os-grid" aria-label={authCopy.identity}>
				<article className="os-panel os-panel-hero">
					<p className="panel-kicker">{authCopy.identity}</p>
					<h1>{identity.user.displayName ?? identity.user.name}</h1>
					<p>{identity.user.jobTitle ?? authCopy.member}</p>
					<div className="identity-meta">
						<span>{identity.user.email}</span>
						<span>{identity.user.locale}</span>
						<span>{identity.user.timezone}</span>
					</div>
				</article>

				<article className="os-panel">
					<p className="panel-kicker">{authCopy.workspaces}</p>
					<strong className="metric">{identity.workspaces.length}</strong>
					<div className="item-list">
						{identity.workspaces.map((workspace) => (
							<div className="list-item" key={workspace.id}>
								<span>{workspace.name}</span>
								<code>{workspace.key}</code>
							</div>
						))}
					</div>
				</article>

				<article className="os-panel">
					<p className="panel-kicker">{authCopy.teams}</p>
					<strong className="metric">{identity.teams.length}</strong>
					<div className="item-list">
						{identity.teams.map((team) => (
							<div className="list-item" key={team.id}>
								<span>{team.name}</span>
								<span>{team.role}</span>
							</div>
						))}
					</div>
				</article>
			</section>
		</main>
	);
}
