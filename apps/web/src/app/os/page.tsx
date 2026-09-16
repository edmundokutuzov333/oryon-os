import { Card, InvertedPanel, MetricCard, PageHeader, ProgressTrack } from "@oryon/ui";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IdentityContextSchema } from "@oryon/contracts/identity";
import { authCopy } from "../../lib/auth-copy";
import "./home.css";

const apiUrl = process.env.ORYON_API_URL ?? "http://localhost:4000";
const cookieName = process.env.ORYON_AUTH_COOKIE_NAME ?? "oryon_session";

async function getIdentity() {
  const store = await cookies();
  const session = store.get(cookieName)?.value;
  const organization = store.get("oryon_org")?.value;
  if (!session || !organization) redirect("/login");
  const response = await fetch(`${apiUrl}/v1/auth/session`, { headers: { "X-Oryon-Org": organization, Cookie: `${cookieName}=${encodeURIComponent(session)}` }, cache: "no-store" });
  if (!response.ok) redirect("/login");
  const payload = (await response.json()) as { data: unknown };
  return IdentityContextSchema.parse(payload.data);
}

export default async function WorkspacePage() {
  const identity = await getIdentity();
  return <div className="oryon-home"><PageHeader title={identity.organization.name} description={identity.user.jobTitle ?? authCopy.member} actions={<a className="oryon-button oryon-button-secondary oryon-button-md" href="/os/work">Abrir Work</a>} /><section className="oryon-home-metrics"><MetricCard label={authCopy.workspaces} value={identity.workspaces.length} /><MetricCard label={authCopy.teams} value={identity.teams.length} /><MetricCard label={authCopy.identity} value={identity.user.name} compact /></section><section className="oryon-home-grid"><InvertedPanel><span className="oryon-home-label">{authCopy.workspaces}</span><h2>{identity.workspaces.length}</h2><ProgressTrack value={100} segments={identity.workspaces.slice(0, 4).map((workspace) => ({ label: workspace.key, value: 100 }))} /></InvertedPanel><Card><span className="oryon-home-label">{authCopy.identity}</span><h2>{identity.user.displayName ?? identity.user.name}</h2><p className="oryon-home-muted">{identity.user.email}</p><div className="oryon-home-list">{identity.teams.map((team) => <div key={team.id}><span>{team.name}</span><span>{team.role}</span></div>)}</div></Card></section></div>;
}
