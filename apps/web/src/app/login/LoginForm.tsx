"use client";

import { useState } from "react";
import { authCopy } from "../../lib/auth-copy";

export function LoginForm() {
	const [organization, setOrganization] = useState("org_demo_0001");
	const [email, setEmail] = useState("admin@demo.oryon");
	const [message, setMessage] = useState<string>();
	const [debugToken, setDebugToken] = useState<string>();
	const [busy, setBusy] = useState(false);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setMessage(undefined);
		setDebugToken(undefined);
		try {
			const response = await fetch("/api/auth/request-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ organization, email }),
			});
			const payload = (await response.json()) as { data?: { delivered?: boolean; debugToken?: string }; error?: { message?: string } };
			if (!response.ok) throw new Error(payload.error?.message ?? "Não foi possível iniciar a autenticação.");
			setMessage(authCopy.sentBody);
			setDebugToken(payload.data?.debugToken);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Não foi possível iniciar a autenticação.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="auth-form" onSubmit={submit}>
			<label>
				<span>{authCopy.organization}</span>
				<input value={organization} onChange={(event) => setOrganization(event.target.value)} autoComplete="organization" required minLength={1} />
			</label>
			<label>
				<span>{authCopy.email}</span>
				<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
			</label>
			<button type="submit" disabled={busy}>
				{busy ? "A enviar..." : authCopy.continue}
			</button>
			{message ? <p className="auth-message" role="status">{message}</p> : null}
			{debugToken ? (
				<output className="debug-access">
					<span>{authCopy.devToken}</span>
					<code>{debugToken}</code>
					<a href={`/login/verify?token=${encodeURIComponent(debugToken)}&org=${encodeURIComponent(organization)}`}>
						{authCopy.openAccess}
					</a>
				</output>
			) : null}
		</form>
	);
}
