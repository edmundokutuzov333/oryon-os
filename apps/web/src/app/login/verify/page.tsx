import { VerifyClient } from "./VerifyClient";

export default async function VerifyPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string; org?: string }>;
}) {
	const params = await searchParams;
	return (
		<VerifyClient token={params.token ?? ""} organization={params.org ?? ""} />
	);
}
