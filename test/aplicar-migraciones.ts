import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

/**
 * Deja la base con el esquema puesto antes de que corra cada archivo de
 * pruebas. El almacenamiento está aislado por archivo, así que esto se ejecuta
 * una vez por archivo y cada uno arranca de una base limpia y migrada.
 *
 * `env` se importa de `cloudflare:workers`, la misma fuente que usan las
 * pruebas: tenerlo de dos módulos distintos invita a que uno se desincronice.
 *
 * `applyD1Migrations` solo aplica las que faltan y lleva la cuenta en
 * `d1_migrations`, igual que `wrangler d1 migrations apply`.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
