/**
 * El listado de las personas del bufete (`odd/tasks/crm-procesos.md`, T-9).
 *
 * `GET /api/usuarios` existe por una razón concreta: un pendiente lleva
 * **responsable**, y para elegirlo hay que poder nombrar a las personas.
 * T-7 ya había dejado señalado el agujero —`proceso.responsable_id` existe
 * y no hay forma de poblarlo desde ninguna pantalla— y acá se tapa.
 *
 * Las tres cosas que esta suite fija:
 *
 *  1. **No se filtran los usuarios de otro tenant.** Es I-8
 *     (`docs/diseno.md` §5) sobre la tabla que guarda personas, que es la
 *     fuga que peor se ve de todas.
 *  2. **Los inactivos viajan marcados, no omitidos.** Misma decisión que
 *     T-5 tomó con `tipo_cliente` y T-6 con las áreas: un pendiente viejo
 *     puede tener como responsable a alguien que ya no está, y la pantalla
 *     necesita poder nombrarlo sin ofrecerlo.
 *  3. **Es solo de lectura.** El sistema no da de alta a nadie: quien entra
 *     lo decide Cloudflare Access más la fila en `usuario` (T-3). Un `POST`
 *     acá sería una segunda puerta.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";
import type { ServicioDeUsuarios } from "../worker/usuarios/repositorio";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_SOCIA = "itzel.usuarios@bufete.test";

interface UsuarioEnElCable {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

let sociaId: string;
let otroTenantId: string;
let usuarioAjenoId: string;
let retiradoId: string;

function entorno(): Env {
  // Hermético: un `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir
  // qué identidad observa la suite.
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
  };
}

function peticion(ruta: string, init?: RequestInit): Request {
  return new Request(`https://cotizador.bufete.pa${ruta}`, init);
}

function comoSocia(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_SOCIA,
  });
}

function sinIdentidad(
  request: Request,
  usuarios: ServicioDeUsuarios,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    usuarios,
  });
}

async function listar(): Promise<UsuarioEnElCable[]> {
  const respuesta = await comoSocia(peticion("/api/usuarios"));
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as { usuarios: UsuarioEnElCable[] })
    .usuarios;
}

/**
 * **Esta suite tampoco borra `usuario`.** Es la misma consecuencia que T-8
 * documentó para las notas: con las llaves foráneas en `NO ACTION`, una fila
 * de `usuario` referida por cualquier cosa no se borra, y `usuario` lleva
 * `UNIQUE (tenant_id, email)` desde T-2, así que tampoco se puede reinsertar
 * con el mismo correo. El aislamiento se consigue al revés: identificadores
 * y correos nuevos por prueba, y toda afirmación acotada a ellos.
 */
beforeAll(async () => {
  sociaId = nuevoId();

  await env.DB.prepare(
    "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
      " VALUES (?, ?, ?, ?, 1)",
  )
    .bind(sociaId, TENANT_UNICO_ID, "Itzel", EMAIL_SOCIA)
    .run();
});

beforeEach(async () => {
  otroTenantId = nuevoId();
  usuarioAjenoId = nuevoId();
  retiradoId = nuevoId();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      otroTenantId,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      usuarioAjenoId,
      otroTenantId,
      "Abogada del vecino",
      `ajena-${usuarioAjenoId}@otro-bufete.test`,
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 0)",
    ).bind(
      retiradoId,
      TENANT_UNICO_ID,
      "Pasante que ya no está",
      `retirado-${retiradoId}@bufete.test`,
    ),
  ]);
});

describe("GET /api/usuarios lista las personas del bufete", () => {
  it("trae a quien está pidiendo, con su nombre y su correo", async () => {
    const usuarios = await listar();
    const yo = usuarios.find((usuario) => usuario.id === sociaId);

    expect(yo).toEqual({
      id: sociaId,
      nombre: "Itzel",
      email: EMAIL_SOCIA,
      activo: true,
    });
  });

  it("trae a quien ya no está, MARCADO y no omitido", async () => {
    // Un pendiente viejo puede tener como responsable a alguien que se fue.
    // Si la fila no viajara, la pantalla no podría ni nombrarlo.
    const usuarios = await listar();
    const retirado = usuarios.find((usuario) => usuario.id === retiradoId);

    expect(retirado?.activo).toBe(false);
    expect(retirado?.nombre).toBe("Pasante que ya no está");
  });

  it("NO trae a nadie del bufete vecino", async () => {
    // I-8. La prueba de mutación de esta tarea apunta justo acá: al quitar
    // el `WHERE tenant_id = ?` de la consulta, esta aserción muere.
    const usuarios = await listar();

    expect(usuarios.some((usuario) => usuario.id === usuarioAjenoId)).toBe(
      false,
    );
    expect(usuarios.every((usuario) => usuario.email.endsWith("@bufete.test")))
      .toBe(true);
  });

  it("los ordena por nombre, sin que la caja mande", async () => {
    const usuarios = await listar();
    const nombres = usuarios.map((usuario) => usuario.nombre);
    const ordenados = [...nombres].sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : 1,
    );

    expect(nombres).toEqual(ordenados);
  });
});

describe("la puerta de Access protege el listado", () => {
  it("una petición sin identidad no llega al servicio", async () => {
    // Con el servicio real un 403 no distingue «no se ejecutó» de «se
    // ejecutó y después se rechazó». Con el espía, sí.
    let tocado = false;
    const espia: ServicioDeUsuarios = {
      listar: () => {
        tocado = true;
        return Promise.resolve([]);
      },
    };

    const respuesta = await sinIdentidad(peticion("/api/usuarios"), espia);

    expect(respuesta.status).toBe(403);
    expect(tocado).toBe(false);
  });
});

describe("el listado es solo de lectura", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s contesta 405: el sistema no da de alta a nadie",
    async (metodo) => {
      const respuesta = await comoSocia(
        peticion("/api/usuarios", { method: metodo }),
      );

      expect(respuesta.status).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("GET");
    },
  );

  it("no hay dirección propia de un usuario", async () => {
    const respuesta = await comoSocia(peticion(`/api/usuarios/${sociaId}`));
    expect(respuesta.status).toBe(404);
  });
});
