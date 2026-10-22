import { useEffect, useState } from "react";

import type { HealthReport } from "../worker/contract";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; report: HealthReport }
  | { kind: "error"; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => response.json() as Promise<HealthReport>)
      .then((report) => setHealth({ kind: "ready", report }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Bufete</h1>
      <h2>Estado del sistema</h2>
      {health.kind === "loading" && <p>Consultando…</p>}
      {health.kind === "error" && <p>No se pudo consultar: {health.message}</p>}
      {health.kind === "ready" && (
        <dl>
          <dt>Servicio</dt>
          <dd>{health.report.status}</dd>
          <dt>D1</dt>
          <dd>{health.report.d1}</dd>
          <dt>Momento</dt>
          <dd>{health.report.timestamp}</dd>
        </dl>
      )}
    </main>
  );
}
