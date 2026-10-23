/**
 * La bitácora del lado del navegador (T-10): la frase que lee una persona.
 *
 * Misma frontera que T-5 a T-9: lo que se puede probar como función se
 * escribe como función y vive en un `.ts`, para que corra en este runner en
 * vez de exigir un navegador para comparar cadenas.
 *
 * Lo que esta suite fija:
 *
 *  1. **Cada acción del vocabulario tiene su frase.** El `Record` exhaustivo
 *     de `src/bitacora.ts` ya lo impone en `pnpm typecheck` —es el mismo
 *     truco de `src/mensajes.ts`—, y acá se comprueba además que ninguna
 *     frase quedó vacía o copiada de otra.
 *  2. **La frase dice quién, qué y sobre qué**, que es la granularidad que
 *     el usuario pidió: un evento, no un diff.
 *  3. **La ausencia de relleno retroactivo se dice**, no se disimula.
 *  4. **El resumen habla del total, no de lo dibujado** (T-17). Con la
 *     bitácora paginada, una frase que cuenta la lista que recibió dice «20
 *     hechos registrados» de una entidad que tiene cuatrocientos. Es
 *     exactamente la clase de frase que caduca en silencio: sigue
 *     compilando y pasa a ser mentira.
 *  5. **El control de «ver más viejos» promete lo que puede cumplir**: un
 *     número calculado contra lo que falta y contra el techo del servidor,
 *     nunca una estimación ni un «ver más» a secas.
 */
import { describe, expect, it } from "vitest";

import {
  LIMITE_DE_BITACORA_POR_DEFECTO,
  TECHO_DEL_LIMITE_DE_BITACORA,
  type AccionDeBitacora,
  type EntradaDeBitacora,
} from "../worker/contract";
import {
  AVISO_BITACORA_SIN_RELLENO,
  VERBOS_DE_BITACORA,
  avisoDeHechosFueraDelAlcance,
  controlDeMasViejos,
  direccionDeBitacora,
  fraseDeBitacora,
  paginaDeBitacora,
  resumenDeLaBitacora,
  type PaginaDeBitacora,
} from "../src/bitacora";

const MOMENTO = "2026-03-03T19:30:00.000Z";

function entrada(
  parcial: Partial<EntradaDeBitacora> = {},
): EntradaDeBitacora {
  return {
    id: "b1",
    entidad: "proceso",
    entidadId: "p1",
    accion: "etapa_alcanzada",
    usuarioId: "u1",
    usuarioNombre: "Itzel",
    ocurridoEn: MOMENTO,
    detalle: "Demanda presentada",
    ...parcial,
  };
}

describe("cada acción del vocabulario tiene una frase propia", () => {
  const acciones = Object.keys(VERBOS_DE_BITACORA) as AccionDeBitacora[];

  it("hay al menos una acción por cada cosa que el bufete hace", () => {
    expect(acciones.length).toBeGreaterThanOrEqual(12);
  });

  it.each(acciones)("«%s» tiene un verbo escrito", (accion) => {
    expect(VERBOS_DE_BITACORA[accion].trim().length).toBeGreaterThan(2);
  });

  it("no hay dos acciones con el mismo verbo", () => {
    // Dos acciones que se leen igual son dos acciones que no sirven para
    // contestar «¿quién hizo esto?»: el día que convivan, la distinción que
    // el vocabulario cerrado protege se pierde en la pantalla.
    const verbos = acciones.map((accion) => VERBOS_DE_BITACORA[accion]);

    expect(new Set(verbos).size).toBe(verbos.length);
  });
});

describe("la frase dice quién, qué y sobre qué", () => {
  it("escribe el ejemplo del usuario, textualmente", () => {
    expect(fraseDeBitacora(entrada())).toBe(
      "Itzel avanzó a «Demanda presentada».",
    );
  });

  it("omite el entrecomillado cuando el hecho no tiene nombre", () => {
    expect(
      fraseDeBitacora(entrada({ accion: "plan_editado", detalle: null })),
    ).toBe("Itzel editó el plan.");
  });

  it("nombra al autor desconocido sin inventarle un nombre", () => {
    // `usuarioNombre` se resuelve en lectura y puede venir nulo si la fila
    // de `usuario` cruzó la frontera del tenant. Un hueco en blanco en un
    // registro de auditoría se lee como si no hubiera autor, y sí lo hay.
    expect(fraseDeBitacora(entrada({ usuarioNombre: null }))).toBe(
      "Alguien del bufete avanzó a «Demanda presentada».",
    );
  });

  it("escribe el alta de un cliente con su nombre", () => {
    expect(
      fraseDeBitacora(
        entrada({
          entidad: "cliente",
          accion: "creado",
          detalle: "Carlos Pérez",
        }),
      ),
    ).toBe("Itzel dio de alta «Carlos Pérez».");
  });

  it("escribe la baja de un catálogo sin confundirla con un borrado", () => {
    const baja = fraseDeBitacora(
      entrada({ entidad: "area", accion: "dado_de_baja", detalle: "Penal" }),
    );
    const borrado = fraseDeBitacora(
      entrada({ entidad: "area", accion: "borrado", detalle: "Penal" }),
    );

    expect(baja).not.toBe(borrado);
    expect(baja).toContain("dio de baja");
    expect(borrado).toContain("borró");
  });
});

/** `cuantos` hechos distintos, que es lo que una página dibuja. */
function hechos(cuantos: number): EntradaDeBitacora[] {
  return Array.from({ length: cuantos }, (_sin_usar, i) =>
    entrada({ id: `b${String(i)}` }),
  );
}

/**
 * Una página, con el total despegado de lo que trae.
 *
 * Que `total` se pueda fijar aparte es lo que hace probable la distinción
 * entera: una página de 20 sobre un total de 400 es el caso que distingue
 * «cuenta el total» de «cuenta lo dibujado», y con la lista sola no se
 * puede ni escribir.
 */
function pagina(parcial: Partial<PaginaDeBitacora> = {}): PaginaDeBitacora {
  const entradas = parcial.entradas ?? [entrada()];

  return {
    entradas,
    total: parcial.total ?? entradas.length,
    limite: parcial.limite ?? LIMITE_DE_BITACORA_POR_DEFECTO,
    ruta: parcial.ruta ?? "/api/procesos/p1/bitacora",
  };
}

describe("el resumen cuenta lo que hay y declara lo que no", () => {
  it("dice que no hay nada cuando no hay nada", () => {
    expect(resumenDeLaBitacora(pagina({ entradas: [], total: 0 }))).toBe(
      "Todavía no hay nada registrado.",
    );
  });

  it("cuenta un solo hecho en singular", () => {
    expect(resumenDeLaBitacora(pagina())).toBe("1 hecho registrado.");
  });

  it("cuenta varios en plural", () => {
    expect(resumenDeLaBitacora(pagina({ entradas: hechos(2) }))).toBe(
      "2 hechos registrados.",
    );
  });

  it("cuenta el total y no lo que se dibujó, y dice cuántos muestra", () => {
    // La frase que caduca en silencio: con la página, contar `entradas`
    // diría «20 hechos registrados» de un proceso que tiene cuatrocientos.
    // Y si dijera «400» sin aclarar nada, el número de arriba y la lista de
    // abajo no coincidirían y no habría forma de saber por qué.
    expect(
      resumenDeLaBitacora(pagina({ entradas: hechos(20), total: 400 })),
    ).toBe("400 hechos registrados; se muestran los 20 más recientes.");
  });

  it("no aclara nada cuando la página es la historia entera", () => {
    expect(
      resumenDeLaBitacora(pagina({ entradas: hechos(7), total: 7 })),
    ).toBe("7 hechos registrados.");
  });

  it("el aviso dice que no hubo relleno retroactivo", () => {
    // No hay relleno de lo anterior a T-10, y eso se dice en vez de
    // disimularse: una bitácora que empieza en blanco se lee como «acá no
    // pasó nada», que es falso.
    expect(AVISO_BITACORA_SIN_RELLENO).toMatch(/antes/i);
    expect(AVISO_BITACORA_SIN_RELLENO.length).toBeGreaterThan(60);
  });
});

describe("el control de «ver más viejos» promete lo que puede cumplir", () => {
  it("no aparece cuando la página ya es la historia entera", () => {
    expect(controlDeMasViejos(pagina({ entradas: hechos(7), total: 7 }))).toBe(
      null,
    );
  });

  it("no aparece cuando no hay nada registrado", () => {
    expect(controlDeMasViejos(pagina({ entradas: [], total: 0 }))).toBe(null);
  });

  it("trae una página más y lo dice con el número", () => {
    const control = controlDeMasViejos(
      pagina({ entradas: hechos(20), total: 400 }),
    );

    expect(control?.cuantos).toBe(LIMITE_DE_BITACORA_POR_DEFECTO);
    expect(control?.limite).toBe(20 + LIMITE_DE_BITACORA_POR_DEFECTO);
    expect(control?.rotulo).toBe("Ver 20 hechos más antiguos");
  });

  it("promete solo lo que falta cuando falta menos que una página", () => {
    // «Ver 20 más» cuando quedan cinco sería un botón que miente sobre lo
    // que va a pasar al tocarlo.
    const control = controlDeMasViejos(
      pagina({ entradas: hechos(20), total: 25 }),
    );

    expect(control?.cuantos).toBe(5);
    expect(control?.rotulo).toBe("Ver 5 hechos más antiguos");
  });

  it("escribe el último en singular", () => {
    expect(
      controlDeMasViejos(pagina({ entradas: hechos(20), total: 21 }))?.rotulo,
    ).toBe("Ver 1 hecho más antiguo");
  });

  it("no promete más allá del techo del servidor", () => {
    // El servidor rechaza un `?limite` por encima del techo, así que pedir
    // de más no traería nada: el control pide exactamente hasta el techo.
    const control = controlDeMasViejos(
      pagina({
        entradas: hechos(TECHO_DEL_LIMITE_DE_BITACORA - 5),
        total: 1000,
      }),
    );

    expect(control?.limite).toBe(TECHO_DEL_LIMITE_DE_BITACORA);
    expect(control?.cuantos).toBe(5);
  });

  it("desaparece al llegar al techo, en vez de prometer lo que no traería", () => {
    expect(
      controlDeMasViejos(
        pagina({
          entradas: hechos(TECHO_DEL_LIMITE_DE_BITACORA),
          total: TECHO_DEL_LIMITE_DE_BITACORA + 40,
        }),
      ),
    ).toBe(null);
  });
});

describe("lo que el techo deja afuera se dice, no se disimula", () => {
  it("no dice nada mientras no quede nada afuera", () => {
    expect(
      avisoDeHechosFueraDelAlcance(pagina({ entradas: hechos(20), total: 400 })),
    ).toBe(null);
  });

  it("cuenta los que quedan afuera con el total del servidor", () => {
    // Sin esta frase, el control desaparecería sin explicación y eso se lee
    // como «ya está todo», que sería falso. El número sale del total; no se
    // estima.
    const aviso = avisoDeHechosFueraDelAlcance(
      pagina({
        entradas: hechos(TECHO_DEL_LIMITE_DE_BITACORA),
        total: TECHO_DEL_LIMITE_DE_BITACORA + 7,
      }),
    );

    expect(aviso).toContain("7 hechos");
    expect(aviso).toMatch(/no alcanza a traer/);
  });

  it("escribe el único que falta en singular", () => {
    expect(
      avisoDeHechosFueraDelAlcance(
        pagina({
          entradas: hechos(TECHO_DEL_LIMITE_DE_BITACORA),
          total: TECHO_DEL_LIMITE_DE_BITACORA + 1,
        }),
      ),
    ).toBe("Hay 1 hecho más antiguo que esta pantalla no alcanza a traer.");
  });
});

describe("la página se arma con lo que el servidor mandó", () => {
  it("la dirección dice qué tope pide", () => {
    expect(direccionDeBitacora("/api/areas/a1/bitacora", 20)).toBe(
      "/api/areas/a1/bitacora?limite=20",
    );
  });

  it("conserva el total del servidor y no el tamaño de la página", () => {
    // Si alguien hiciera que el total saliera de las entradas, la pantalla
    // creería tener toda la historia y el control desaparecería.
    const armada = paginaDeBitacora("/api/areas/a1/bitacora", 20, {
      entradas: hechos(20),
      total: 400,
    });

    expect(armada.total).toBe(400);
    expect(armada.limite).toBe(20);
    expect(armada.ruta).toBe("/api/areas/a1/bitacora");
  });
});
