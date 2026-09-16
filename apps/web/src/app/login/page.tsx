import { LoginForm } from "./LoginForm";
import { authCopy } from "../../lib/auth-copy";

export default function LoginPage() {
	return (
		<main className="auth-shell">
			<section className="auth-card" aria-labelledby="login-title">
				<div className="auth-mark" aria-hidden="true">O</div>
				<p className="eyebrow">{authCopy.eyebrow}</p>
				<h1 id="login-title">{authCopy.title}</h1>
				<p className="auth-lede">{authCopy.subtitle}</p>
				<LoginForm />
			</section>
		</main>
	);
}
