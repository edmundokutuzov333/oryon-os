import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PermissionsPanel } from "./PermissionsPanel";

export default async function PermissionsPage() {
  const organizationId = (await cookies()).get("oryon_org")?.value;
  if (!organizationId) redirect("/login");
  return <PermissionsPanel organizationId={organizationId} />;
}
