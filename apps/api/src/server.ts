import { HealthResponseSchema } from "@oryon/contracts/health";
import { closePrisma, getPrisma } from "@oryon/db";
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
	await getPrisma().$queryRawUnsafe("SELECT 1");
	await app.listen({ port: 4000, host: "0.0.0.0" });
} catch (error) {
	app.log.error(error);
	await closePrisma();
	process.exitCode = 1;
}
