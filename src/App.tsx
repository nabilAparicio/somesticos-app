import { useEffect, useState } from "react";

import type { HealthReport, IdentidadActual } from "../worker/contract";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; report: HealthReport }
  | { kind: "error"; message: string };

type IdentityState =
  | { kind: "loading" }
  | { kind: "ready"; identity: IdentidadActual }
  | { kind: "denied" };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [identity, setIdentity] = useState<IdentityState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    // Who got in. The screen itself is T-4; this is only the one line that
    // shows the resolved identity, so the gate is visible from the browser.
    fetch("/api/yo", { signal: controller.signal })
      .then(async (response) =>
        response.status === 200
          ? ({
              kind: "ready",
              identity: (await response.json()) as IdentidadActual,
            } as const)
          : ({ kind: "denied" } as const),
      )
      .then(setIdentity)
      .catch(() => {
        if (controller.signal.aborted) return;
        setIdentity({ kind: "denied" });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        // 503 is a valid, meaningful answer here: the service reports itself
        // degraded and the body still carries the report. Anything else is a
        // transport or routing failure and must not be parsed as a report.
        if (response.status !== 200 && response.status !== 503) {
          throw new Error(`respuesta inesperada: HTTP ${String(response.status)}`);
        }
        return response.json() as Promise<HealthReport>;
      })
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
      {identity.kind === "ready" && <p>Entró {identity.identity.nombre}.</p>}
      {identity.kind === "denied" && <p>Sin identidad reconocida.</p>}
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
