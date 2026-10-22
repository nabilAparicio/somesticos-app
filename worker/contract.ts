/**
 * Shapes exchanged over the HTTP API. Type-only, so it is safe to compile this
 * file both in the Worker project and in the browser project.
 */

export interface HealthReport {
  status: "ok" | "degraded";
  d1: "ok" | "error";
  timestamp: string;
}
