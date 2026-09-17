"use client";

import { useEffect, useState } from "react";
import { authCopy } from "../../../lib/auth-copy";

export function VerifyClient({ token, organization }: { token: string; organization: string }) {
	const [error, setError] = useState<string>();

	useEffect(() => {
		let cancelled = false;
		async function verify() {
			if (!token || !organization) {
				setError("O acesso recebido não é válido.");
				return;
			}
			try {
				const response = await fetch("/api/auth/verify-link", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token, organization }),
				});
				if (!response.ok) {
					const payload = (await response.json()) as { error?: { message?: string } };
					throw new Error(payload.error?.message ?? "Não foi possível validar o acesso.");
				}
				if (!cancelled) window.location.assign("/os");
			} catch (verificationError) {
				if (!cancelled) setError(verificationError instanceof Error ? verificationError.message : "Não foi possível validar o acesso.");
			}
		}
		void verify();
		return () => {
			cancelled = true;
		};
	}, [organization, token]);

	return (
		<main className="auth-shell">
			<section className="auth-card auth-card-compact" aria-labelledby="verify-title">
				<div className="auth-mark" aria-hidden="true">O</div>
				<p className="eyebrow">{authCopy.eyebrow}</p>
				<h1 id="verify-title">{error ? authCopy.notAvailable : authCopy.loading}</h1>
				<p className="auth-lede">{error ?? authCopy.success}</p>
				{error ? <a className="quiet-link" href="/login">{authCopy.backToLogin}</a> : null}
			</section>
		</main>
	);
}
