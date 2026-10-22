import { useEffect, useState } from "react";

import type { HealthReport, IdentidadActual } from "../../worker/contract";
import { Enlace } from "../layout/Enlace";
import { Fila } from "../layout/Fila";
import { Pila } from "../layout/Pila";
import { Prosa } from "../layout/Prosa";
import { Rejilla } from "../layout/Rejilla";
import { Tarjeta } from "../layout/Tarjeta";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; report: HealthReport }
  | { kind: "error"; message: string };

type IdentityState =
  | { kind: "loading" }
  | { kind: "ready"; identity: IdentidadActual }
  | { kind: "denied" };

export function Inicio() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [identity, setIdentity] = useState<IdentityState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    // Who got in. Una sola línea con la identidad resuelta, para que la
    // puerta de Access se vea desde el navegador. En local, sin token, el
    // Worker contesta 403 y acá se lee "Sin identidad reconocida": es el
    // comportamiento esperado, no una falla.
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
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <h1>Procesos del bufete</h1>
          <Fila alinear="centro">
            {identity.kind === "ready" && (
              <p className="texto-apagado">
                Entró {identity.identity.nombre}.
              </p>
            )}
            {identity.kind === "denied" && (
              <p className="texto-apagado">Sin identidad reconocida.</p>
            )}
          </Fila>
        </Pila>
      </header>

      <Prosa>
        <p>
          La primera pantalla de producto ya está:{" "}
          <Enlace href="/clientes">clientes</Enlace>. Dar de alta un prospecto
          cuesta un nombre y un teléfono, que es lo que se sabe de alguien que
          acaba de llamar. Lo que sigue es el catálogo de áreas y tipos de
          proceso con sus plantillas de etapas, y el proceso con su plan de
          trabajo.
        </p>
      </Prosa>

      <section aria-labelledby="estado">
        <Pila>
          <h2 id="estado">Estado del sistema</h2>
          {health.kind === "loading" && <p>Consultando…</p>}
          {health.kind === "error" && (
            <p>No se pudo consultar: {health.message}</p>
          )}
          {health.kind === "ready" && (
            <Rejilla minimo="14rem">
              <Tarjeta titulo="Servicio">
                <p className="dato">{health.report.status}</p>
              </Tarjeta>
              <Tarjeta titulo="D1">
                <p className="dato">{health.report.d1}</p>
              </Tarjeta>
              <Tarjeta titulo="Momento">
                <p className="dato dato--largo">{health.report.timestamp}</p>
              </Tarjeta>
            </Rejilla>
          )}
        </Pila>
      </section>
    </Pila>
  );
}
