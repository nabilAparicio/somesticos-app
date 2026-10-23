/**
 * **El problema (a) de T-10: que olvidarse de registrar sea imposible.**
 *
 * Poner el registro en un helper y usarlo con disciplina no alcanza. Alguna
 * ruta se va a olvidar, y el agujero no se nota hasta que alguien lo busca —
 * que es, exactamente, el peor momento.
 *
 * La forma que el proyecto ya conoce de convertir un olvido en un error de
 * compilación es el `Record<MotivoDeFalla, string>` de `src/mensajes.ts`:
 * agregar un motivo rompe el `typecheck` hasta que alguien escriba su texto.
 * Acá el equivalente es **quitarle a los repositorios la capacidad de
 * escribir**:
 *
 *  - Ningún adaptador recibe un `D1Database`. Reciben `BaseDeDatos`, que
 *    expone `lectura` —un `prepare` sin `run`, sin `batch` y sin `exec`— y un
 *    único método de escritura, `mutar(evento, ...sentencias)`, cuyo primer
 *    parámetro **es el evento de bitácora**.
 *  - No hay forma de escribir una fila sin nombrar el hecho: no es que esté
 *    mal visto, es que no compila.
 *  - Y el par `(entidad, accion)` es un tipo distribuido: `cliente` con
 *    `etapa_alcanzada` tampoco compila.
 *
 * Esta suite es la guardia de esa propiedad. Cada `@ts-expect-error` de abajo
 * **falla el `pnpm typecheck` el día que alguien ensanche la firma**: un
 * directiva sin error es un error de TypeScript. No es una prueba que se
 * pueda dejar pasando en el vacío.
 *
 * Lo que esto NO cubre, dicho en vez de supuesto: nada impide que alguien
 * cambie la firma de un adaptador para que vuelva a aceptar `D1Database` y
 * recablee `worker/index.ts`. Eso rompe estas cinco directivas a la vez, así
 * que llega como una falla de `typecheck` y no como un agujero silencioso,
 * pero sigue siendo una decisión que una persona puede tomar. El compilador
 * sostiene «no se puede olvidar»; no sostiene «no se puede revertir».
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { baseSobreD1, sentencia } from "../worker/db/base";
import { catalogosSobreD1 } from "../worker/catalogos/repositorio";
import { servicioSobreD1 } from "../worker/clientes/repositorio";
import { notasSobreD1 } from "../worker/notas/repositorio";
import { pendientesSobreD1 } from "../worker/pendientes/repositorio";
import { procesosSobreD1 } from "../worker/procesos/repositorio";

let autorId: string;

beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.prepare(
    "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
      " VALUES (?, ?, ?, ?, 1)",
  )
    .bind(autorId, TENANT_UNICO_ID, "Itzel", "itzel@bufete.test")
    .run();
});

function base() {
  return baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
}

/**
 * Nunca se ejecuta: lo que importa de este cuerpo son las cinco directivas,
 * que el compilador tiene que **usar**. Si alguna deja de hacer falta,
 * `pnpm typecheck` falla con «Unused '@ts-expect-error' directive».
 */
function loQueNoCompila(): void {
  // @ts-expect-error -- un adaptador no recibe la base cruda: con `D1Database`
  // tendría `prepare(...).run()` y podría escribir sin registrar nada.
  servicioSobreD1(env.DB);
  // @ts-expect-error -- ídem catálogos.
  catalogosSobreD1(env.DB);
  // @ts-expect-error -- ídem procesos.
  procesosSobreD1(env.DB);
  // @ts-expect-error -- ídem notas.
  notasSobreD1(env.DB);
  // @ts-expect-error -- ídem pendientes.
  pendientesSobreD1(env.DB);
}

function loQueTampocoCompila(): void {
  const db = base();

  // @ts-expect-error -- la lectura no sabe escribir: `run` no existe en el
  // tipo, así que una mutación nueva no tiene por dónde colarse.
  db.lectura.prepare("DELETE FROM cliente").run();

  // @ts-expect-error -- `batch` tampoco.
  db.lectura.batch([]);

  // @ts-expect-error -- escribir sin evento no es una llamada válida.
  db.mutar(sentencia("DELETE FROM cliente WHERE id = ?", "x"));

  // @ts-expect-error -- un cliente no alcanza etapas: el par (entidad,
  // acción) es un tipo distribuido, no dos cadenas sueltas.
  db.mutar({ entidad: "cliente", entidadId: "x", accion: "etapa_alcanzada" });

  // @ts-expect-error -- una acción inventada tampoco entra.
  db.mutar({ entidad: "cliente", entidadId: "x", accion: "actualizado" });
}

describe("la escritura solo existe acompañada de su evento", () => {
  it("las directivas de arriba son las que sostienen la propiedad", () => {
    // El valor de estas dos funciones está en que el compilador las lea. La
    // aserción existe para que no queden como código muerto que alguien
    // borra «porque no se usa», que es como se pierde una guarda de tipos.
    expect(typeof loQueNoCompila).toBe("function");
    expect(typeof loQueTampocoCompila).toBe("function");
  });

  it("mutar escribe la fila y su entrada en la misma transacción", async () => {
    const db = base();
    const clienteId = nuevoId();

    await db.mutar(
      { entidad: "cliente", entidadId: clienteId, accion: "creado" },
      sentencia(
        "INSERT INTO cliente (id, tenant_id, nombre, telefono," +
          " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?)",
        clienteId,
        TENANT_UNICO_ID,
        "Carlos Pérez",
        "+507 6123-4567",
        autorId,
        new Date().toISOString(),
      ),
    );

    const fila = await env.DB.prepare(
      "SELECT accion, usuario_id FROM bitacora WHERE entidad_id = ?",
    )
      .bind(clienteId)
      .first<{ accion: string; usuario_id: string }>();

    expect(fila?.accion).toBe("creado");
    expect(fila?.usuario_id, "el autor sale de la identidad, no del cuerpo").toBe(
      autorId,
    );
  });

  it("no deja la entrada cuando la mutación falla", async () => {
    // El `batch` de D1 es una transacción: si la escritura rebota —acá
    // contra una llave foránea—, la entrada tampoco queda. Una bitácora que
    // registra lo que no pasó es tan inútil como una que calla lo que pasó.
    const db = base();
    const clienteId = nuevoId();

    await expect(
      db.mutar(
        { entidad: "cliente", entidadId: clienteId, accion: "creado" },
        sentencia(
          "INSERT INTO cliente (id, tenant_id, nombre, telefono," +
            " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?)",
          clienteId,
          TENANT_UNICO_ID,
          "Quien no existe",
          "+507 6123-4567",
          nuevoId(), // un autor que no está en `usuario`
          new Date().toISOString(),
        ),
      ),
    ).rejects.toThrow();

    const fila = await env.DB.prepare(
      "SELECT id FROM bitacora WHERE entidad_id = ?",
    )
      .bind(clienteId)
      .first<{ id: string }>();

    expect(fila).toBeNull();
  });

  it("registra un hecho compuesto sin ninguna sentencia propia", async () => {
    // Guardar el plan de un proceso como plantilla escribe por los puertos
    // de catálogos y no tiene SQL propio, pero sigue siendo un hecho del
    // proceso. `mutar` sin sentencias es esa llamada, y está permitida a
    // propósito: lo que no está permitido es escribir sin evento.
    const db = base();
    const procesoId = nuevoId();

    await db.mutar({
      entidad: "proceso",
      entidadId: procesoId,
      accion: "plantilla_guardada",
      detalle: "Visa de trabajo",
    });

    const fila = await env.DB.prepare(
      "SELECT accion, detalle FROM bitacora WHERE entidad_id = ?",
    )
      .bind(procesoId)
      .first<{ accion: string; detalle: string | null }>();

    expect(fila?.accion).toBe("plantilla_guardada");
    expect(fila?.detalle).toBe("Visa de trabajo");
  });
});
