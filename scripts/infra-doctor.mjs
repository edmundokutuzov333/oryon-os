import { execFileSync } from "node:child_process";
import net from "node:net";

const composeFile = "infra/docker/docker-compose.yml";
const services = [
  { name: "postgres", port: 5432, protocol: "tcp" },
  { name: "redis", port: 6379, protocol: "tcp" },
  { name: "nats", port: 4222, protocol: "tcp" },
  { name: "typesense", port: 8108, protocol: "http", url: "http://127.0.0.1:8108/health" },
  { name: "minio", port: 9000, protocol: "http", url: "http://127.0.0.1:9000/minio/health/ready" },
  { name: "livekit", port: 7880, protocol: "tcp" },
];

function runDocker(args) {
  return execFileSync("docker", ["compose", "-f", composeFile, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseComposePs(output) {
  if (!output) return [];
  if (output.startsWith("[")) return JSON.parse(output);
  return output.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function checkPort(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function main() {
  runDocker(["config", "--quiet"]);
  const rows = parseComposePs(runDocker(["ps", "--all", "--format", "json"]));
  const byService = new Map(rows.map((row) => [row.Service ?? row.Name, row]));

  let failed = false;
  console.log("ORYONOS LOCAL INFRASTRUCTURE");

  for (const service of services) {
    const row = byService.get(service.name);
    const running = row?.State === "running";
    const portOpen = await checkPort(service.port);
    let endpointOk = true;

    if (service.protocol === "http") {
      try {
        const response = await fetch(service.url, { signal: AbortSignal.timeout(2000) });
        endpointOk = response.ok;
      } catch {
        endpointOk = false;
      }
    }

    const ok = running && portOpen && endpointOk;
    failed ||= !ok;
    console.log(`${ok ? "OK " : "ERR"} ${service.name.padEnd(10)} state=${row?.State ?? "missing"} port=${portOpen ? "open" : "closed"}${service.protocol === "http" ? ` http=${endpointOk ? "ok" : "fail"}` : ""}`);
  }

  const init = byService.get("minio-init");
  const initOk = init?.State === "exited" && init?.ExitCode === "0";
  failed ||= !initOk;
  console.log(`${initOk ? "OK " : "ERR"} minio-init state=${init?.State ?? "missing"} exit=${init?.ExitCode ?? "missing"}`);

  if (failed) {
    console.error("Local infrastructure is not ready. Inspect with: pnpm infra:logs");
    process.exit(1);
  }

  console.log("All required OryonOS local infrastructure dependencies are healthy.");
}

await main();
