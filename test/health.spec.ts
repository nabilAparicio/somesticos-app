import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { HealthReport } from "../worker/contract";
import worker from "../worker/index";

/**
 * Builds a request typed as the Worker's own `fetch` expects it. A plain
 * `Request` is not assignable there: the handler receives an incoming request,
 * which carries `cf` properties a client-built one does not have.
 */
function request(
  path: string,
  init?: RequestInit,
): Parameters<typeof worker.fetch>[0] {
  return new Request(
    `https://example.com${path}`,
    init,
  ) as Parameters<typeof worker.fetch>[0];
}

describe("GET /api/health", () => {
  it("reports the service and the live D1 binding as ok", async () => {
    const response = await exports.default.fetch(request("/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const report = (await response.json()) as HealthReport;
    expect(report.status).toBe("ok");
    expect(report.d1).toBe("ok");
    // A real instant, not merely a parseable string: it has to round-trip and
    // land close to now. `Date.parse` alone accepts values nobody meant.
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
    expect(Math.abs(Date.now() - Date.parse(report.timestamp))).toBeLessThan(
      60_000,
    );
  });

  it("runs against the real D1 binding declared in wrangler.jsonc", async () => {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    expect(row).toEqual({ ok: 1 });
  });

  it("reports degraded with 503 when D1 is unreachable", async () => {
    // The only branch that cannot be reached through the real binding, so this
    // is the one case that injects a fault and therefore calls the handler
    // directly instead of going through `exports.default.fetch`.
    const brokenDb = {
      prepare() {
        throw new Error("D1 unreachable");
      },
    } as unknown as D1Database;

    const response = await worker.fetch(request("/api/health"), {
      ...env,
      DB: brokenDb,
    });

    expect(response.status).toBe(503);

    const report = (await response.json()) as HealthReport;
    expect(report.status).toBe("degraded");
    expect(report.d1).toBe("error");
  });

  it("rejects a non-GET request", async () => {
    const response = await exports.default.fetch(
      request("/api/health", { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

describe("unknown API routes", () => {
  // T-3 moved the gate in front of routing: an unknown path is answered with
  // 403 until the caller proves who they are, so the API cannot be enumerated
  // from outside. The 404 that follows a valid identity is asserted in
  // `test/acceso.spec.ts`.
  it("demands an identity before deciding the route does not exist", async () => {
    const response = await exports.default.fetch(request("/api/no-existe"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "acceso_denegado" });
  });
});
