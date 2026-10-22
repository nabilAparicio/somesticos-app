/**
 * Entry Worker. Serves the API; everything else falls through to the SPA
 * assets (see `assets.run_worker_first` in wrangler.jsonc).
 */
import type { HealthReport } from "./contract";

async function checkD1(db: D1Database): Promise<HealthReport["d1"]> {
  try {
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return row?.ok === 1 ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function health(env: Env): Promise<Response> {
  const d1 = await checkD1(env.DB);
  const report: HealthReport = {
    status: d1 === "ok" ? "ok" : "degraded",
    d1,
    timestamp: new Date().toISOString(),
  };

  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "method_not_allowed" },
          { status: 405, headers: { allow: "GET" } },
        );
      }
      return health(env);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
