import { getApiHealth } from "../lib/api";

export default async function HomePage() {
  try {
    const health = await getApiHealth();
    return <main className="shell"><section className="card" aria-labelledby="title"><p className="eyebrow">OryonOS V1</p><h1 id="title">Sistema operativo da empresa.</h1><p className="body">Frontend e API ligados desde a fundação.</p><div className="status" role="status"><span aria-hidden="true" /> API {health.status}</div></section></main>;
  } catch {
    return <main className="shell"><section className="card" aria-labelledby="title"><p className="eyebrow">OryonOS V1</p><h1 id="title">A API ainda não está disponível.</h1><p className="body">Inicie o serviço API na porta 4000 e actualize esta página.</p></section></main>;
  }
}
