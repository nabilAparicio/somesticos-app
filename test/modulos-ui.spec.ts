/**
 * La lógica del editor de módulos de prosa (T-2, unidad C2).
 *
 * Lo que se prueba acá es **lógica pura**: el orden de la lista, el
 * movimiento de un módulo, el borrador de cada campo con su validación y la
 * decisión de cuándo una respuesta obliga a recargar. Nada de esto importa
 * React ni toca el DOM, y por eso corre en el mismo corredor que la API en
 * vez de arrastrar un navegador. Lo que sí necesita un navegador —que los
 * botones estén cableados a estas funciones y que la pantalla no ofrezca
 * editar lo que ya salió del borrador— vive en `e2e/cotizaciones.spec.ts`.
 *
 * La validación de `normalizarBorradorDeModulo` es **la segunda copia** de
 * las reglas de `worker/cotizaciones/modulos.ts`, igual que la del
 * formulario de la cotización en la unidad B. La que manda es la del Worker,
 * probada en `modulos-api.spec.ts`; ésta existe para avisar antes de mandar.
 * Las dos se prueban por separado a propósito: aflojar una tiene que matar
 * sus propias pruebas y no las de la otra.
 *
 * ## El catálogo se importa, no se copia
 *
 * Los tipos salen de `worker/cotizaciones/modulos.ts`, que es el mismo
 * registro contra el que valida el servidor y la misma mitad acoplada del
 * `CHECK` de `migrations/0004_cotizaciones.sql`. Una tercera copia en `src/`
 * sería el defecto que esa migración y ese registro existen para impedir, y
 * por eso acá se recorre el catálogo de verdad en vez de escribir los seis
 * nombres a mano: una prueba que lista los tipos por su cuenta deja de
 * notar el día que aparezca el séptimo.
 *
 * ## Ninguna expectativa se calcula con la función que se prueba
 *
 * Restricción 6 de la tajada. Los órdenes esperados se escriben a mano, y
 * las comparaciones de listas se hacen contra arreglos literales y nunca
 * contra el resultado de `ordenDe` ni de `modulosOrdenados`.
 */
import { describe, expect, it } from "vitest";

import type { FallaDeValidacion, ModuloDeCotizacion } from "../worker/contract";
import { CATALOGO_DE_MODULOS } from "../worker/cotizaciones/modulos";
import {
  BORRADOR_DE_MODULO_VACIO,
  borradorDesdeModulo,
  exigeRecarga,
  hayCambioEnModulo,
  mismoOrden,
  modulosOrdenados,
  moverModulo,
  normalizarBorradorDeModulo,
  ordenDe,
  podarBorradores,
  type BorradorDeModulo,
} from "../src/pantallas/cotizaciones/modulos";

const UNO = "11111111-1111-4111-8111-111111111111";
const DOS = "22222222-2222-4222-8222-222222222222";
const TRES = "33333333-3333-4333-8333-333333333333";

function modulo(ajustes: Partial<ModuloDeCotizacion> = {}): ModuloDeCotizacion {
  return {
    id: UNO,
    tipo: "antecedentes",
    orden: 0,
    contenido: "Vino por una visa de trabajo.",
    ...ajustes,
  };
}

/** Los tres de siempre, ya en su orden, para no repetirlos en cada prueba. */
function tresModulos(): ModuloDeCotizacion[] {
  return [
    modulo({ id: UNO, tipo: "antecedentes", orden: 0, contenido: "Uno" }),
    modulo({ id: DOS, tipo: "alcance", orden: 1, contenido: "Dos" }),
    modulo({ id: TRES, tipo: "exclusiones", orden: 2, contenido: "Tres" }),
  ];
}

function borrador(ajustes: Partial<BorradorDeModulo> = {}): BorradorDeModulo {
  return { ...BORRADOR_DE_MODULO_VACIO, ...ajustes };
}

function motivos(fallas: readonly FallaDeValidacion[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

// ---------------------------------------------------------------------------
// El orden de la lista
// ---------------------------------------------------------------------------

describe("modulosOrdenados", () => {
  it("ordena por `orden` aunque la respuesta venga mezclada", () => {
    const mezclados = [
      modulo({ id: TRES, orden: 2, contenido: "Tres" }),
      modulo({ id: UNO, orden: 0, contenido: "Uno" }),
      modulo({ id: DOS, orden: 1, contenido: "Dos" }),
    ];

    expect(modulosOrdenados(mezclados).map((uno) => uno.id)).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
  });

  it("respeta el orden relativo cuando los números tienen huecos", () => {
    // Quitar un módulo deja un hueco en `orden`: lo que vale es el orden
    // relativo y no el número, y la pantalla tiene que leerlo igual.
    const conHuecos = [
      modulo({ id: DOS, orden: 7, contenido: "Dos" }),
      modulo({ id: UNO, orden: 3, contenido: "Uno" }),
    ];

    expect(modulosOrdenados(conHuecos).map((uno) => uno.id)).toEqual([
      UNO,
      DOS,
    ]);
  });

  it("no toca el arreglo que recibe, que puede ser estado de React", () => {
    const original = [
      modulo({ id: DOS, orden: 1 }),
      modulo({ id: UNO, orden: 0 }),
    ];

    modulosOrdenados(original);

    expect(original.map((uno) => uno.id)).toEqual([DOS, UNO]);
  });
});

// ---------------------------------------------------------------------------
// Mover un módulo
// ---------------------------------------------------------------------------

describe("moverModulo", () => {
  it("sube uno intercambiándolo con el anterior", () => {
    const movida = moverModulo(tresModulos(), 1, -1);

    expect(movida.map((uno) => uno.id)).toEqual([DOS, UNO, TRES]);
  });

  it("baja uno intercambiándolo con el siguiente", () => {
    const movida = moverModulo(tresModulos(), 1, 1);

    expect(movida.map((uno) => uno.id)).toEqual([UNO, TRES, DOS]);
  });

  it("subir el primero no pierde ningún módulo", () => {
    // Sin la guarda del borde, el destino es el índice -1 y el intercambio
    // deja un hueco: es el defecto que `moverPaso` documenta en el plan de
    // un proceso, y acá vale igual.
    const movida = moverModulo(tresModulos(), 0, -1);

    expect(movida.map((uno) => uno.id)).toEqual([UNO, DOS, TRES]);
  });

  it("bajar el último no pierde ningún módulo", () => {
    const movida = moverModulo(tresModulos(), 2, 1);

    expect(movida.map((uno) => uno.id)).toEqual([UNO, DOS, TRES]);
  });

  it("un índice que no existe devuelve la lista igual", () => {
    expect(moverModulo(tresModulos(), 9, -1).map((uno) => uno.id)).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
    expect(moverModulo(tresModulos(), -4, 1).map((uno) => uno.id)).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
  });

  it("devuelve siempre una copia, también cuando se niega", () => {
    const original = tresModulos();

    expect(moverModulo(original, 0, -1)).not.toBe(original);
    expect(moverModulo(original, 1, -1)).not.toBe(original);
    expect(original.map((uno) => uno.id)).toEqual([UNO, DOS, TRES]);
  });
});

// ---------------------------------------------------------------------------
// Lo que viaja en el `PUT` de la colección
// ---------------------------------------------------------------------------

describe("ordenDe", () => {
  it("son los identificadores en la posición del arreglo, no en la de `orden`", () => {
    // La pantalla manda el arreglo entero y el servidor asigna la posición.
    // Si esto leyera el campo `orden` en vez de la posición, un movimiento
    // recién hecho viajaría con el orden viejo y no cambiaría nada.
    const movida = [
      modulo({ id: DOS, orden: 1 }),
      modulo({ id: UNO, orden: 0 }),
      modulo({ id: TRES, orden: 2 }),
    ];

    expect(ordenDe(movida)).toEqual([DOS, UNO, TRES]);
  });

  it("de una lista vacía sale una lista vacía", () => {
    expect(ordenDe([])).toEqual([]);
  });
});

describe("mismoOrden", () => {
  it("dos listas iguales son el mismo orden", () => {
    expect(mismoOrden([UNO, DOS, TRES], [UNO, DOS, TRES])).toBe(true);
  });

  it("los mismos identificadores en otro orden no lo son", () => {
    expect(mismoOrden([UNO, DOS, TRES], [DOS, UNO, TRES])).toBe(false);
  });

  it("distinta cantidad nunca es el mismo orden", () => {
    // Pasa de verdad: alguien quitó un módulo desde otra pestaña y la lista
    // de esta quedó vieja. Comparar sólo posición por posición sobre la más
    // corta diría que no cambió nada.
    expect(mismoOrden([UNO, DOS], [UNO, DOS, TRES])).toBe(false);
    expect(mismoOrden([UNO, DOS, TRES], [UNO, DOS])).toBe(false);
  });

  it("dos listas vacías son el mismo orden", () => {
    expect(mismoOrden([], [])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// El borrador de un módulo y su validación
// ---------------------------------------------------------------------------

describe("borradorDesdeModulo", () => {
  it("copia el tipo y el contenido guardados", () => {
    expect(
      borradorDesdeModulo(
        modulo({ tipo: "clausulas", contenido: "Jurisdicción de Panamá." }),
      ),
    ).toEqual({ tipo: "clausulas", contenido: "Jurisdicción de Panamá." });
  });
});

describe("normalizarBorradorDeModulo", () => {
  it("acepta cada uno de los tipos del catálogo del servidor", () => {
    for (const entrada of CATALOGO_DE_MODULOS) {
      const resultado = normalizarBorradorDeModulo(
        borrador({ tipo: entrada.tipo, contenido: "Algo escrito." }),
      );

      expect(resultado.ok, `el tipo «${entrada.tipo}» tiene que pasar`).toBe(
        true,
      );
    }
  });

  it("recorta el contenido, que es lo que el servidor guarda", () => {
    const resultado = normalizarBorradorDeModulo(
      borrador({ tipo: "alcance", contenido: "  Dos trámites.\n\n" }),
    );

    expect(resultado).toEqual({
      ok: true,
      datos: { tipo: "alcance", contenido: "Dos trámites." },
    });
  });

  it("sin tipo elegido avisa antes de mandar nada", () => {
    const resultado = normalizarBorradorDeModulo(
      borrador({ tipo: "", contenido: "Algo escrito." }),
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? [] : motivos(resultado.fallas)).toEqual([
      "tipo_de_modulo_desconocido",
    ]);
  });

  it("un tipo que no es del catálogo tampoco pasa", () => {
    const resultado = normalizarBorradorDeModulo(
      borrador({ tipo: "honorarios", contenido: "Algo escrito." }),
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? [] : motivos(resultado.fallas)).toEqual([
      "tipo_de_modulo_desconocido",
    ]);
  });

  it("un contenido de puro espacio es un título sin nada debajo", () => {
    const resultado = normalizarBorradorDeModulo(
      borrador({ tipo: "supuestos", contenido: "  \n\t\n " }),
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? [] : motivos(resultado.fallas)).toEqual([
      "contenido_requerido",
    ]);
  });

  it("devuelve las dos fallas juntas y no la primera", () => {
    // Un formulario que corrige de a un error por envío es el formulario
    // que nadie usa. Es el mismo criterio que `normalizarModulo`.
    const resultado = normalizarBorradorDeModulo(
      borrador({ tipo: "", contenido: "" }),
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? [] : motivos(resultado.fallas)).toEqual([
      "tipo_de_modulo_desconocido",
      "contenido_requerido",
    ]);
  });

  it("el borrador vacío no pasa, que es con lo que arranca el formulario", () => {
    expect(normalizarBorradorDeModulo(BORRADOR_DE_MODULO_VACIO).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cuándo hay algo que guardar
// ---------------------------------------------------------------------------

describe("hayCambioEnModulo", () => {
  it("un borrador idéntico al guardado no tiene nada que mandar", () => {
    expect(
      hayCambioEnModulo(
        modulo({ tipo: "alcance", contenido: "Dos trámites." }),
        borrador({ tipo: "alcance", contenido: "Dos trámites." }),
      ),
    ).toBe(false);
  });

  it("espacio de más alrededor no es un cambio, porque se recorta al guardar", () => {
    // Sin el recorte en la comparación, apoyar la barra espaciadora deja el
    // botón de guardar encendido sobre una petición que no cambiaría nada.
    expect(
      hayCambioEnModulo(
        modulo({ tipo: "alcance", contenido: "Dos trámites." }),
        borrador({ tipo: "alcance", contenido: "  Dos trámites.  " }),
      ),
    ).toBe(false);
  });

  it("otro texto sí lo es", () => {
    expect(
      hayCambioEnModulo(
        modulo({ tipo: "alcance", contenido: "Dos trámites." }),
        borrador({ tipo: "alcance", contenido: "Tres trámites." }),
      ),
    ).toBe(true);
  });

  it("otro tipo sobre el mismo texto también", () => {
    expect(
      hayCambioEnModulo(
        modulo({ tipo: "alcance", contenido: "Dos trámites." }),
        borrador({ tipo: "exclusiones", contenido: "Dos trámites." }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Los borradores que sobreviven a una escritura
// ---------------------------------------------------------------------------

describe("podarBorradores", () => {
  it("conserva el borrador de un módulo que sigue en la lista", () => {
    const abiertos = { [DOS]: borrador({ tipo: "alcance", contenido: "A" }) };

    expect(podarBorradores(abiertos, tresModulos())).toEqual(abiertos);
  });

  it("descarta el de un módulo que ya no está", () => {
    // Si no se podan, un módulo quitado acá o desde otra pestaña deja su
    // texto a medio escribir colgado en memoria para siempre.
    const abiertos = {
      [DOS]: borrador({ tipo: "alcance", contenido: "A" }),
      [TRES]: borrador({ tipo: "exclusiones", contenido: "B" }),
    };

    const quedan = tresModulos().filter((uno) => uno.id !== TRES);

    expect(Object.keys(podarBorradores(abiertos, quedan))).toEqual([DOS]);
  });

  it("no toca el objeto que recibe, que es estado de React", () => {
    const abiertos = { [TRES]: borrador({ contenido: "B" }) };

    podarBorradores(abiertos, []);

    expect(Object.keys(abiertos)).toEqual([TRES]);
  });
});

// ---------------------------------------------------------------------------
// Cuándo una negativa obliga a recargar
// ---------------------------------------------------------------------------

describe("exigeRecarga", () => {
  it("la lista que quedó vieja obliga a recargar", () => {
    // `orden_incompleto` es lo que contesta el servidor cuando la lista que
    // mandó la pantalla nombra módulos que ya no están: lo que hay en
    // pantalla es mentira, y reintentar con lo mismo vuelve a fallar.
    expect(exigeRecarga([{ campo: "orden", motivo: "orden_incompleto" }])).toBe(
      true,
    );
  });

  it("un módulo que ya no es de esta cotización también", () => {
    expect(
      exigeRecarga([{ campo: "orden-1", motivo: "modulo_desconocido" }]),
    ).toBe(true);
  });

  it("lo que la persona puede arreglar escribiendo, no", () => {
    expect(
      exigeRecarga([{ campo: "contenido", motivo: "contenido_requerido" }]),
    ).toBe(false);
    expect(
      exigeRecarga([{ campo: "tipo", motivo: "tipo_de_modulo_desconocido" }]),
    ).toBe(false);
  });

  it("sin fallas no hay nada que recargar", () => {
    expect(exigeRecarga([])).toBe(false);
  });

  it("alcanza con que una de las fallas lo pida", () => {
    expect(
      exigeRecarga([
        { campo: "contenido", motivo: "contenido_requerido" },
        { campo: "orden", motivo: "orden_incompleto" },
      ]),
    ).toBe(true);
  });
});
