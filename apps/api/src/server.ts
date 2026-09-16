import { HealthResponseSchema } from "@oryon/contracts/health";
import Fastify from "fastify";

const app = Fastify({ logger: true });

function healthPayload() {
	return HealthResponseSchema.parse({
		status: "ok",
		service: "oryon-api",
		version: "0.1.0",
		timestamp: new Date().toISOString(),
	});
}

app.get("/health", async (_request, reply) => reply.send(healthPayload()));
app.get("/v1/health", async (_request, reply) =>
	reply.send({ data: healthPayload() }),
);

try {
	await app.listen({ port: 4000, host: "0.0.0.0" });
} catch (error) {
	app.log.error(error);
	process.exitCode = 1;
}
