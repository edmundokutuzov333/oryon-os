import { GraphStudio } from "./GraphStudio";
import styles from "./graph.module.css";

export default function GraphPage() {
	void styles;
	return (
		<main className="os-shell">
			<GraphStudio />
		</main>
	);
}
