/**
 * Las reglas puras del arancel de honorarios (`odd/tasks/arancel-de-honorarios.md`,
 * T-2): qué de un renglón se puede editar, qué no, y cómo se agrupa la tabla
 * para que se lea como el papel.
 *
 * Son puras —ni D1 ni HTTP— y por eso se prueban acá, aparte de la API. Lo que
 * este archivo protege no es que el código corra: es que **la frontera entre
 * la cita y el precio del bufete esté escrita en un solo lugar y se vea**. El
 * disparador de `migrations/0012_arancel_de_honorarios.sql` es la red de
 * abajo; esto es la guarda de arriba, y las dos tienen prueba propia porque
 * neutralizar una sin que nada se ponga rojo es exactamente lo que no puede
 * pasar.
 *
 * Tres familias, y las tres hacen falta:
 *
 *  - **Rechazos.** El cuerpo que pretende escribir un campo citado, y el que
 *    le pone precio a un rubro. No alcanza con que la base lo impida: una API
 *    que contesta 200 y descarta el campo en silencio le enseña a la pantalla
 *    que la escritura funcionó.
 *  - **Lo que sí entra.** `monto` en centavos enteros, y el nulo que borra el
 *    precio propio para volver a la sugerencia del acuerdo.
 *  - **El orden del documento.** Las 27 categorías con renglones salen en el
 *    orden del acuerdo, y las dos que son **solo prosa** —«OTROS ASUNTOS» y
 *    «PROCESO DE SEPARACIONES DE BIENES…»— salen con sus notas y sin
 *    renglones, en vez de desaparecer.
 */
import { describe, expect, it } from "vitest";

import type { NotaDelArancel, RenglonDelArancel } from "../worker/contract";
import {
  CAMPOS_CITADOS,
  agruparPorCategoria,
  puedeLlevarPrecio,
  revisarMonto,
} from "../worker/arancel/dominio";

/** Un renglón cualquiera, para no repetir diez campos en cada caso. */
function renglon(parcial: Partial<RenglonDelArancel>): RenglonDelArancel {
  return {
    id: "r-1",
    orden: 1,
    categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
    numeral: "1",
    concepto: "Visitantes Temporales (por persona)",
    clase: "monto",
    montoOficial: 50000,
    reglaOficial: null,
    monto: null,
    activo: true,
    ...parcial,
  };
}

function nota(parcial: Partial<NotaDelArancel>): NotaDelArancel {
  return {
    id: "n-1",
    orden: 1,
    categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
    texto: "PARÁGRAFO: En todo trámite se cargarán B/.200.00 por cada dependiente.",
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// Lo que se puede editar, y lo que es una cita
// ---------------------------------------------------------------------------

describe("el cuerpo de una edición de arancel", () => {
  it("acepta un monto en centavos enteros", () => {
    const revision = revisarMonto({ monto: 125000 });

    expect(revision).toEqual({ estado: "ok", monto: 125000 });
  });

  it("acepta cero: un servicio que el bufete no cobra tiene precio cero", () => {
    expect(revisarMonto({ monto: 0 })).toEqual({ estado: "ok", monto: 0 });
  });

  it("acepta el nulo, que borra el precio propio", () => {
    // No es lo mismo que cero: sin precio propio, la pantalla de T-3 vuelve a
    // mostrar la sugerencia del acuerdo. Un cero es una decisión del bufete.
    expect(revisarMonto({ monto: null })).toEqual({ estado: "ok", monto: null });
  });

  it("trata la ausencia del campo como el nulo", () => {
    expect(revisarMonto({})).toEqual({ estado: "ok", monto: null });
  });

  it("rechaza un monto con centavos partidos", () => {
    // Centavos enteros, jamás coma flotante. 1500.5 centavos no es un importe.
    const revision = revisarMonto({ monto: 1500.5 });

    expect(revision).toEqual({
      estado: "invalido",
      fallas: [{ campo: "monto", motivo: "monto_invalido" }],
    });
  });

  it("rechaza un monto negativo", () => {
    expect(revisarMonto({ monto: -1 })).toEqual({
      estado: "invalido",
      fallas: [{ campo: "monto", motivo: "monto_invalido" }],
    });
  });

  it("rechaza un monto que llega como texto", () => {
    // No se hace `Number("1200")` en silencio: un monto que llega como cadena
    // es una pantalla que manda otra cosa, y adivinar es cómo entra un cero.
    expect(revisarMonto({ monto: "1200" })).toEqual({
      estado: "invalido",
      fallas: [{ campo: "monto", motivo: "monto_invalido" }],
    });
  });

  it("rechaza un cuerpo que no es un objeto", () => {
    expect(revisarMonto("1200")).toEqual({
      estado: "invalido",
      fallas: [{ campo: "monto", motivo: "tipo_invalido" }],
    });
  });

  it.each([...CAMPOS_CITADOS])(
    "rechaza el cuerpo que pretende escribir «%s»",
    (campo) => {
      const revision = revisarMonto({ monto: 1000, [campo]: "cualquier cosa" });

      expect(revision).toEqual({ estado: "citado", campos: [campo] });
    },
  );

  it("nombra todos los campos citados que vinieron, no solo el primero", () => {
    const revision = revisarMonto({
      monto: 1000,
      montoOficial: 999,
      concepto: "otra cosa",
    });

    expect(revision.estado).toBe("citado");
    expect(revision.estado === "citado" ? revision.campos : []).toEqual([
      "concepto",
      "montoOficial",
    ]);
  });

  it("el campo citado manda sobre el monto inválido", () => {
    // Si un cuerpo trae las dos cosas, lo que hay que decir primero es que la
    // cita no se escribe: contestar 422 por el monto dejaría creer que
    // arreglando el número la escritura entra.
    const revision = revisarMonto({ monto: -5, montoOficial: 1 });

    expect(revision).toEqual({ estado: "citado", campos: ["montoOficial"] });
  });

  it("los siete campos citados son exactamente los que el disparador protege", () => {
    // La lista va exacta y no por `toContain`: el día que alguien agregue una
    // columna citada a la tabla, esta prueba es la que obliga a decidir si la
    // API también la defiende, en vez de dejarla sostenida solo por la base.
    expect([...CAMPOS_CITADOS]).toEqual([
      "categoria",
      "clase",
      "concepto",
      "montoOficial",
      "numeral",
      "orden",
      "reglaOficial",
    ]);
  });
});

// ---------------------------------------------------------------------------
// El rubro no lleva precio
// ---------------------------------------------------------------------------

describe("qué clase de renglón lleva precio del bufete", () => {
  it("un renglón con monto oficial lo lleva", () => {
    expect(puedeLlevarPrecio("monto")).toBe(true);
  });

  it("un renglón con regla también: el bufete escribe su monto al lado", () => {
    // Las 97 reglas por cuantía no se auto-calculan en esta tajada, pero el
    // bufete sí puede poner su propio número junto al texto de la regla.
    expect(puedeLlevarPrecio("regla")).toBe(true);
  });

  it("un rubro no: son los 74 encabezados que el acuerdo imprime sin valor", () => {
    expect(puedeLlevarPrecio("rubro")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El orden del documento
// ---------------------------------------------------------------------------

describe("la tabla agrupada como el acuerdo", () => {
  it("agrupa por categoría respetando el orden del documento", () => {
    const categorias = agruparPorCategoria(
      [
        renglon({ id: "a", orden: 1, categoria: "PRIMERA" }),
        renglon({ id: "b", orden: 2, categoria: "PRIMERA" }),
        renglon({ id: "c", orden: 3, categoria: "SEGUNDA" }),
      ],
      [],
    );

    expect(categorias.map((categoria) => categoria.nombre)).toEqual([
      "PRIMERA",
      "SEGUNDA",
    ]);
    expect(categorias[0].renglones.map((fila) => fila.id)).toEqual(["a", "b"]);
  });

  it("una categoría que el acuerdo retoma más abajo no se parte en dos", () => {
    // El acuerdo vuelve sobre una categoría después de otra en más de un
    // lugar. Si cada aparición abriera un grupo, la tabla mostraría la misma
    // categoría dos veces y el buscador de T-3 la encontraría partida.
    const categorias = agruparPorCategoria(
      [
        renglon({ id: "a", orden: 1, categoria: "PRIMERA" }),
        renglon({ id: "b", orden: 2, categoria: "SEGUNDA" }),
        renglon({ id: "c", orden: 3, categoria: "PRIMERA" }),
      ],
      [],
    );

    expect(categorias.map((categoria) => categoria.nombre)).toEqual([
      "PRIMERA",
      "SEGUNDA",
    ]);
    expect(categorias[0].renglones.map((fila) => fila.id)).toEqual(["a", "c"]);
  });

  it("cada nota viaja con su categoría", () => {
    const categorias = agruparPorCategoria(
      [renglon({ id: "a", orden: 1, categoria: "PRIMERA" })],
      [nota({ id: "n", orden: 1, categoria: "PRIMERA", texto: "PARÁGRAFO…" })],
    );

    expect(categorias[0].notas.map((cada) => cada.id)).toEqual(["n"]);
  });

  it("una sección que es solo prosa sobrevive, con sus notas y sin renglones", () => {
    // Las dos del acuerdo: «OTROS ASUNTOS» —todo lo no listado a B/.150 la
    // hora— y «PROCESO DE SEPARACIONES DE BIENES…» —«la misma tarifa de la
    // sección 2»—. No tienen ni un renglón en `registros`, así que una
    // agrupación que arranque de los renglones las pierde sin que nadie lo
    // note.
    const categorias = agruparPorCategoria(
      [
        renglon({ id: "a", orden: 1, categoria: "PRIMERA" }),
        renglon({ id: "b", orden: 2, categoria: "TERCERA" }),
      ],
      [
        nota({ id: "n1", orden: 1, categoria: "PRIMERA", texto: "nota uno" }),
        nota({ id: "n2", orden: 2, categoria: "SOLO PROSA", texto: "prosa" }),
        nota({ id: "n3", orden: 3, categoria: "TERCERA", texto: "nota tres" }),
      ],
    );

    expect(categorias.map((categoria) => categoria.nombre)).toEqual([
      "PRIMERA",
      "SOLO PROSA",
      "TERCERA",
    ]);

    const prosa = categorias[1];
    expect(prosa.renglones).toEqual([]);
    expect(prosa.notas.map((cada) => cada.texto)).toEqual(["prosa"]);
  });

  it("la sección de prosa que no tiene ninguna categoría después queda al final", () => {
    const categorias = agruparPorCategoria(
      [renglon({ id: "a", orden: 1, categoria: "PRIMERA" })],
      [
        nota({ id: "n1", orden: 1, categoria: "PRIMERA", texto: "nota uno" }),
        nota({ id: "n2", orden: 2, categoria: "SOLO PROSA", texto: "prosa" }),
      ],
    );

    expect(categorias.map((categoria) => categoria.nombre)).toEqual([
      "PRIMERA",
      "SOLO PROSA",
    ]);
  });

  it("sin renglones ni notas no hay categorías, y no es un error", () => {
    expect(agruparPorCategoria([], [])).toEqual([]);
  });
});
