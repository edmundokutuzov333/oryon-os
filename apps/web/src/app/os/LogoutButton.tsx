"use client";

import { useState } from "react";
import { authCopy } from "../../lib/auth-copy";

export function LogoutButton() {
	const [busy, setBusy] = useState(false);
	return (
		<button
			type="button"
			className="ghost-button"
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				await fetch("/api/auth/logout", { method: "POST" });
				window.location.assign("/login");
			}}
		>
			{busy ? authCopy.loggingOut : authCopy.logout}
		</button>
	);
}
