import { applyD1Migrations, env } from "cloudflare:test";

/**
 * Deja la base con el esquema puesto antes de que corra cada archivo de
 * pruebas. El almacenamiento está aislado por archivo, así que esto se ejecuta
 * una vez por archivo y cada uno arranca de una base limpia y migrada.
 *
 * `applyD1Migrations` solo aplica las que faltan y lleva la cuenta en
 * `d1_migrations`, igual que `wrangler d1 migrations apply`.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
