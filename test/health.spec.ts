import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { HealthReport } from "../worker/contract";
import worker from "../worker/index";

describe("GET /api/health", () => {
  it("reports the service and the live D1 binding as ok", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/health"),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const report = (await response.json()) as HealthReport;
    expect(report.status).toBe("ok");
    expect(report.d1).toBe("ok");
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });

  it("runs against the real D1 binding declared in wrangler.jsonc", async () => {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    expect(row).toEqual({ ok: 1 });
  });

  it("rejects a non-GET request", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/health", { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});
