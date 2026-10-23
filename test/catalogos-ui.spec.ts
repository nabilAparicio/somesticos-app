/**
 * La lógica de las pantallas de catálogo (T-6), sin React y sin DOM.
 *
 * Misma frontera que estableció T-5: lo que se puede probar como función se
 * escribe como función y vive en un `.ts`, para que corra en este runner en
 * vez de exigir un navegador para comparar cadenas. Lo que queda en el
 * `.tsx` es el dibujo.
 *
 * Lo más valioso de este archivo es `moverEtapa`. Reordenar es la operación
 * donde el esquema no ayuda —T-2 dejó `etapa_plantilla.orden` sin índice
 * único a propósito— así que el orden lo sostiene el código: acá el del
 * navegador, y en `catalogos-api.spec.ts` el del servidor. Las dos mitades se
 * prueban por separado porque aflojar una tiene que matar sus propias
 * pruebas y no las de la otra.
 *
 * La validación del borrador es, como en T-5, **la segunda copia** de la
 * regla: la que manda vive en el Worker. Esta avisa antes de mandar.
 */
import { describe, expect, it } from "vitest";

import type {
  Area,
  BorradoBloqueado,
  EtapaPlantilla,
  NombreDuplicado,
  TipoProceso,
} from "../worker/contract";
import { mensajeDeNombreDuplicado } from "../src/mensajes";
import {
  BORRADOR_DE_CATALOGO_VACIO,
  BORRADOR_DE_TIPO_VACIO,
  aPeticionDeCatalogo,
  aPeticionDeTipoProceso,
  areasSeleccionables,
  borradorDeCatalogo,
  borradorDeTipoProceso,
  mensajeDeBloqueo,
  validarCatalogo,
  validarTipoProceso,
} from "../src/pantallas/catalogos/formulario";
import {
  AVISO_PLANTILLA_NO_RETROACTIVA,
  agregarEtapa,
  aPeticionDeEtapas,
  borradorDeEtapas,
  moverEtapa,
  quitarEtapa,
  renombrarEtapa,
  validarEtapas,
  type BorradorDeEtapa,
} from "../src/pantallas/catalogos/plantilla";
import {
  agruparPorArea,
  estadoDe,
  ordenarCatalogo,
} from "../src/pantallas/catalogos/presentacion";
import { enlaceDe, resolverRuta } from "../src/ruteo";

const AREA_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";
const OTRA_AREA_ID = "9d1b7c22-5f3a-4a19-8f02-61a7c3d5e4b8";

function area(ajustes: Partial<Area> = {}): Area {
  return { id: AREA_ID, nombre: "Migración", activo: true, ...ajustes };
}

function tipo(ajustes: Partial<TipoProceso> = {}): TipoProceso {
  return {
    id: "0f2a9c31-7d4e-4b85-9a1c-6e3f8d2b5a40",
    areaId: AREA_ID,
    areaNombre: "Migración",
    nombre: "Visa de trabajo",
    descripcion: null,
    activo: true,
    ...ajustes,
  };
}

function etapa(nombre: string, orden: number): EtapaPlantilla {
  return { id: `etapa-${nombre}`, nombre, orden };
}

function motivos(fallas: readonly { motivo: string }[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

function nombres(lista: readonly BorradorDeEtapa[]): string[] {
  return lista.map((e) => e.nombre);
}

// ---------------------------------------------------------------------------
// Áreas y tipos de cliente: el borrador de dos campos
// ---------------------------------------------------------------------------

describe("el borrador de un catálogo simple", () => {
  it("rechaza un nombre vacío y uno de solo espacios", () => {
    expect(motivos(validarCatalogo(BORRADOR_DE_CATALOGO_VACIO))).toEqual([
      "nombre_requerido",
    ]);
    expect(
      motivos(validarCatalogo({ nombre: "  \t ", activo: true })),
    ).toEqual(["nombre_requerido"]);
  });

  it("acepta un nombre con contenido", () => {
    expect(validarCatalogo({ nombre: "Familia", activo: true })).toEqual([]);
  });

  it("nace vigente: un catálogo recién creado se puede elegir sin un segundo paso", () => {
    expect(BORRADOR_DE_CATALOGO_VACIO.activo).toBe(true);
  });

  it("recorta el nombre al armar la petición", () => {
    expect(
      aPeticionDeCatalogo({ nombre: "  Familia  ", activo: false }),
    ).toEqual({ nombre: "Familia", activo: false });
  });

  it("la ida y vuelta por el formulario no pierde el estado de baja", () => {
    const original = area({ nombre: "Penal", activo: false });
    const vuelta = aPeticionDeCatalogo(borradorDeCatalogo(original));

    expect(vuelta).toEqual({ nombre: "Penal", activo: false });
  });
});

// ---------------------------------------------------------------------------
// Tipos de proceso
// ---------------------------------------------------------------------------

describe("el borrador de un tipo de proceso", () => {
  it("rechaza un tipo sin nombre y sin área, y devuelve las dos fallas", () => {
    // Las dos juntas y no la primera: un formulario que corrige de a un
    // error por envío es el que hace que nadie cargue nada.
    expect(motivos(validarTipoProceso(BORRADOR_DE_TIPO_VACIO)).sort()).toEqual([
      "area_requerida",
      "nombre_requerido",
    ]);
  });

  it("rechaza un tipo sin área aunque tenga nombre", () => {
    expect(
      motivos(
        validarTipoProceso({
          areaId: "",
          nombre: "Visa de trabajo",
          descripcion: "",
          activo: true,
        }),
      ),
    ).toEqual(["area_requerida"]);
  });

  it("acepta un tipo con nombre y área", () => {
    expect(
      validarTipoProceso({
        areaId: AREA_ID,
        nombre: "Visa de trabajo",
        descripcion: "",
        activo: true,
      }),
    ).toEqual([]);
  });

  it("manda null, no cadena vacía, cuando la descripción queda en blanco", () => {
    // Un `""` guardado es una descripción que existe y está vacía, y después
    // nada distingue «no la escribimos» de «no tiene».
    expect(
      aPeticionDeTipoProceso({
        areaId: AREA_ID,
        nombre: "  Visa de trabajo  ",
        descripcion: "   ",
        activo: true,
      }),
    ).toEqual({
      areaId: AREA_ID,
      nombre: "Visa de trabajo",
      descripcion: null,
      activo: true,
    });
  });

  it("la ida y vuelta por el formulario conserva los cuatro campos", () => {
    const original = tipo({
      descripcion: "Permiso laboral por contrato.",
      activo: false,
    });
    const vuelta = aPeticionDeTipoProceso(borradorDeTipoProceso(original));

    expect(vuelta).toEqual({
      areaId: original.areaId,
      nombre: original.nombre,
      descripcion: original.descripcion,
      activo: original.activo,
    });
  });
});

describe("areasSeleccionables", () => {
  const AREAS = [
    area({ id: AREA_ID, nombre: "Migración", activo: true }),
    area({ id: OTRA_AREA_ID, nombre: "Penal", activo: false }),
  ];

  it("ofrece solo las áreas vigentes", () => {
    expect(areasSeleccionables(AREAS, "").map((a) => a.nombre)).toEqual([
      "Migración",
    ]);
  });

  it("conserva el área que el tipo ya tiene aunque esté dada de baja", () => {
    // Sin esta excepción, abrir a editar un tipo viejo y guardar sin tocar
    // nada le cambiaría el área sin que nadie lo pidiera.
    expect(
      areasSeleccionables(AREAS, OTRA_AREA_ID).map((a) => a.nombre),
    ).toEqual(["Migración", "Penal"]);
  });

  it("no duplica el área seleccionada cuando está vigente", () => {
    expect(areasSeleccionables(AREAS, AREA_ID)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// La plantilla: agregar, quitar, renombrar y REORDENAR
// ---------------------------------------------------------------------------

describe("el borrador de la plantilla", () => {
  const TRES: readonly BorradorDeEtapa[] = [
    { id: "a", nombre: "A" },
    { id: "b", nombre: "B" },
    { id: "c", nombre: "C" },
  ];

  it("convierte las etapas guardadas en borrador conservando el orden y el id", () => {
    expect(
      borradorDeEtapas([etapa("B", 1), etapa("A", 0), etapa("C", 2)]),
    ).toEqual([
      { id: "etapa-B", nombre: "B" },
      { id: "etapa-A", nombre: "A" },
      { id: "etapa-C", nombre: "C" },
    ]);
  });

  it("una etapa nueva nace sin id: el servidor se lo pone", () => {
    const conNueva = agregarEtapa(TRES, "  D  ");

    expect(nombres(conNueva)).toEqual(["A", "B", "C", "D"]);
    expect(conNueva[3].id).toBeNull();
  });

  it("no agrega una etapa en blanco", () => {
    expect(agregarEtapa(TRES, "   ")).toEqual(TRES);
  });

  it("quita la etapa indicada y deja las demás", () => {
    expect(nombres(quitarEtapa(TRES, 1))).toEqual(["A", "C"]);
  });

  it("renombra sin perder el id", () => {
    const renombrada = renombrarEtapa(TRES, 0, "Recepción");

    expect(renombrada[0]).toEqual({ id: "a", nombre: "Recepción" });
    expect(nombres(renombrada)).toEqual(["Recepción", "B", "C"]);
  });

  it("ninguna operación muta el arreglo que recibe", () => {
    // Es estado de React: mutarlo es el defecto que no se ve hasta que una
    // pantalla deja de redibujarse.
    const original = [...TRES];

    agregarEtapa(TRES, "D");
    quitarEtapa(TRES, 0);
    moverEtapa(TRES, 0, 1);
    renombrarEtapa(TRES, 0, "X");

    expect(TRES).toEqual(original);
  });
});

describe("moverEtapa", () => {
  const CUATRO: readonly BorradorDeEtapa[] = [
    { id: "a", nombre: "A" },
    { id: "b", nombre: "B" },
    { id: "c", nombre: "C" },
    { id: "d", nombre: "D" },
  ];

  it("sube una etapa un lugar", () => {
    expect(nombres(moverEtapa(CUATRO, 2, -1))).toEqual(["A", "C", "B", "D"]);
  });

  it("baja una etapa un lugar", () => {
    expect(nombres(moverEtapa(CUATRO, 0, 1))).toEqual(["B", "A", "C", "D"]);
  });

  it("subir la primera no hace nada", () => {
    // El modo de falla que importa: sin la guarda, el índice -1 saca la
    // etapa del arreglo y la plantilla pierde un paso en silencio.
    expect(moverEtapa(CUATRO, 0, -1)).toEqual(CUATRO);
  });

  it("bajar la última no hace nada", () => {
    expect(moverEtapa(CUATRO, 3, 1)).toEqual(CUATRO);
  });

  it("un índice fuera de rango no hace nada", () => {
    expect(moverEtapa(CUATRO, 9, -1)).toEqual(CUATRO);
    expect(moverEtapa(CUATRO, -3, 1)).toEqual(CUATRO);
  });

  it("una secuencia de movimientos deja el orden correcto", () => {
    // La misma secuencia que `catalogos-api.spec.ts` ejerce contra la base,
    // acá del lado del navegador: las dos mitades del reordenamiento.
    let lista = CUATRO;
    lista = moverEtapa(lista, 3, -1); // A B D C
    lista = moverEtapa(lista, 2, -1); // A D B C
    lista = moverEtapa(lista, 1, -1); // D A B C
    lista = moverEtapa(lista, 3, -1); // D A C B

    expect(nombres(lista)).toEqual(["D", "A", "C", "B"]);
    // Ninguna etapa se perdió ni se duplicó por el camino.
    expect(new Set(lista.map((e) => e.id))).toEqual(
      new Set(CUATRO.map((e) => e.id)),
    );
  });

  it("mover y volver deja la lista como estaba", () => {
    expect(moverEtapa(moverEtapa(CUATRO, 1, 1), 2, -1)).toEqual(CUATRO);
  });
});

describe("validarEtapas", () => {
  it("rechaza una etapa en blanco y señala cuál", () => {
    const fallas = validarEtapas([
      { id: null, nombre: "Recepción" },
      { id: null, nombre: "   " },
    ]);

    expect(motivos(fallas)).toEqual(["nombre_requerido"]);
    expect(fallas[0].campo).toBe("etapa-1");
  });

  it("una plantilla vacía es válida", () => {
    // Un tipo de proceso sin plan por defecto es legítimo: las etapas se
    // pueden armar sobre el proceso. Exigir al menos una sería inventar una
    // regla que el diseño no pide.
    expect(validarEtapas([])).toEqual([]);
  });

  it("acepta una plantilla con nombres repetidos", () => {
    // No hay nada en el esquema ni en el diseño que lo prohíba, y dos
    // «Subsanación» en momentos distintos del trámite son reales.
    expect(
      validarEtapas([
        { id: null, nombre: "Subsanación" },
        { id: null, nombre: "Subsanación" },
      ]),
    ).toEqual([]);
  });

  it("recorta los nombres al armar la petición", () => {
    expect(
      aPeticionDeEtapas([
        { id: "a", nombre: "  Recepción  " },
        { id: null, nombre: "Resolución" },
      ]),
    ).toEqual([
      { id: "a", nombre: "Recepción" },
      { id: null, nombre: "Resolución" },
    ]);
  });
});

describe("el aviso de que la plantilla no es retroactiva", () => {
  it("dice que editar la plantilla no cambia los procesos ya abiertos", () => {
    // El diseño lo exige en la pantalla y no en un manual (§6, «es
    // contraintuitivo, así que la interfaz lo dice en el lugar donde se edita
    // la plantilla»). Que el texto exista es parte del criterio de T-6, así
    // que se afirma acá y su presencia en pantalla se verifica en e2e.
    expect(AVISO_PLANTILLA_NO_RETROACTIVA).toMatch(/no\s+(cambia|altera)/i);
    expect(AVISO_PLANTILLA_NO_RETROACTIVA).toMatch(/procesos ya abiertos/i);
    expect(AVISO_PLANTILLA_NO_RETROACTIVA).toMatch(/copian/i);
  });
});

// ---------------------------------------------------------------------------
// El bloqueo del borrado, dicho para quien mira la pantalla
// ---------------------------------------------------------------------------

describe("mensajeDeBloqueo", () => {
  function bloqueo(
    dependencias: BorradoBloqueado["dependencias"],
  ): BorradoBloqueado {
    return { error: "tiene_dependientes", entidad: "area", dependencias };
  }

  it("dice cuántos dependientes hay y en singular cuando es uno", () => {
    const texto = mensajeDeBloqueo(
      bloqueo([{ entidad: "tipo_proceso", cuantos: 1 }]),
      "Migración",
    );

    expect(texto).toContain("Migración");
    expect(texto).toContain("1 tipo de proceso");
    expect(texto).not.toContain("1 tipos");
  });

  it("pluraliza, y enumera varias clases de dependiente", () => {
    const texto = mensajeDeBloqueo(
      bloqueo([
        { entidad: "etapa_plantilla", cuantos: 3 },
        { entidad: "proceso", cuantos: 2 },
      ]),
      "Visa de trabajo",
    );

    expect(texto).toContain("3 etapas de plantilla");
    expect(texto).toContain("2 procesos");
  });

  it("ofrece la salida: dar de baja en vez de borrar", () => {
    // El 409 no puede ser una pared sin puerta. Lo normal para un catálogo
    // es la baja, no el borrado.
    expect(
      mensajeDeBloqueo(
        bloqueo([{ entidad: "cliente", cuantos: 4 }]),
        "Empresa",
      ),
    ).toMatch(/dar de baja/i);
  });
});

// ---------------------------------------------------------------------------
// El nombre tomado, dicho para quien mira la pantalla (T-12)
// ---------------------------------------------------------------------------

describe("mensajeDeNombreDuplicado", () => {
  function duplicado(
    error: NombreDuplicado["error"],
    entidad: NombreDuplicado["entidad"],
    nombre: string,
  ): NombreDuplicado {
    return { error, entidad, nombre };
  }

  it("nombra la fila que choca y dice que hay que elegir otro nombre", () => {
    const texto = mensajeDeNombreDuplicado(
      duplicado("nombre_duplicado", "area", "Familia"),
    );

    expect(texto).toContain("Familia");
    expect(texto).toContain("área");
    expect(texto).toMatch(/otro nombre/i);
  });

  it("cuando la fila está dada de baja, manda a reactivarla y no a renombrar", () => {
    // La razón de que sean dos motivos y no uno: las dos salidas son
    // distintas. Con la fila vigente hay que elegir otro nombre; con la
    // fila de baja hay que reactivar la que está, porque crear una segunda
    // partiría el catálogo igual que si las dos estuvieran vigentes.
    const texto = mensajeDeNombreDuplicado(
      duplicado("nombre_duplicado_de_baja", "area", "Familia"),
    );

    expect(texto).toContain("Familia");
    expect(texto).toMatch(/dada de baja/i);
    expect(texto).toMatch(/reactivar/i);
    expect(texto).not.toMatch(/otro nombre/i);
  });

  it("nombra cada catálogo por lo que es, y el tipo de proceso por su área", () => {
    expect(
      mensajeDeNombreDuplicado(
        duplicado("nombre_duplicado", "tipo_cliente", "Empresa"),
      ),
    ).toContain("tipo de cliente");

    // El tipo de proceso es el único cuya unicidad es por área, así que el
    // mensaje tiene que decirlo: «ya hay un Traspaso» a secas haría pensar
    // que el nombre está tomado en todo el bufete, cuando convive con el
    // Traspaso de cualquier otra área.
    const texto = mensajeDeNombreDuplicado(
      duplicado("nombre_duplicado", "tipo_proceso", "Traspaso"),
    );
    expect(texto).toContain("tipo de proceso");
    expect(texto).toMatch(/área/i);
  });

  it("ninguna de las dos frases deja sin saber qué hacer", () => {
    // El criterio de T-6 aplicado al 409 nuevo: un rechazo no puede ser una
    // pared sin puerta. Las dos frases terminan en una acción posible.
    for (const error of [
      "nombre_duplicado",
      "nombre_duplicado_de_baja",
    ] as const) {
      expect(
        mensajeDeNombreDuplicado(duplicado(error, "area", "Familia")),
      ).toMatch(/elegir otro nombre|reactivar/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

describe("derivados de presentación", () => {
  it("ordena con las reglas del español", () => {
    const ordenadas = ordenarCatalogo([
      area({ id: "1", nombre: "Ñandú" }),
      area({ id: "2", nombre: "Álvarez" }),
      area({ id: "3", nombre: "avila" }),
      area({ id: "4", nombre: "Zamora" }),
    ]);

    expect(ordenadas.map((a) => a.nombre)).toEqual([
      "Álvarez",
      "avila",
      "Ñandú",
      "Zamora",
    ]);
  });

  it("no muta el arreglo que recibe", () => {
    const original = [area({ id: "2", nombre: "Penal" }), area({ id: "1", nombre: "Civil" })];
    const copia = [...original];

    ordenarCatalogo(original);

    expect(original).toEqual(copia);
  });

  it("nombra el estado de una fila de catálogo", () => {
    expect(estadoDe(true)).toBe("Vigente");
    expect(estadoDe(false)).toBe("De baja");
  });

  it("agrupa los tipos por área, ordenados, sin perder ninguno", () => {
    const grupos = agruparPorArea([
      tipo({ id: "1", areaId: "m", areaNombre: "Migración", nombre: "Visa de trabajo" }),
      tipo({ id: "2", areaId: "f", areaNombre: "Familia", nombre: "Divorcio" }),
      tipo({ id: "3", areaId: "m", areaNombre: "Migración", nombre: "Residencia" }),
    ]);

    expect(grupos.map((g) => g.areaNombre)).toEqual(["Familia", "Migración"]);
    expect(grupos[1].tipos.map((t) => t.nombre)).toEqual([
      "Residencia",
      "Visa de trabajo",
    ]);
    expect(grupos.flatMap((g) => g.tipos)).toHaveLength(3);
  });

  it("agrupa bajo un rótulo propio los tipos cuya área no se pudo nombrar", () => {
    // `areaNombre` viene de un `LEFT JOIN` con el filtro de tenencia
    // repetido: si alguna vez llegara `null`, el tipo no puede desaparecer
    // de la pantalla sin que nadie se entere.
    const grupos = agruparPorArea([
      tipo({ id: "1", areaId: "x", areaNombre: null, nombre: "Huérfano" }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].tipos.map((t) => t.nombre)).toEqual(["Huérfano"]);
  });

  it("una lista vacía no produce grupos", () => {
    expect(agruparPorArea([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ruteo de las pantallas de catálogo
// ---------------------------------------------------------------------------

describe("el ruteo de catálogos", () => {
  it("resuelve las tres pantallas, incluida la que lleva id", () => {
    expect(resolverRuta("/catalogos")).toEqual({ nombre: "catalogos" });
    expect(resolverRuta("/catalogos/tipos-proceso")).toEqual({
      nombre: "tipos-proceso",
    });
    expect(resolverRuta("/catalogos/tipos-proceso/nuevo")).toEqual({
      nombre: "tipo-proceso-nuevo",
    });
    expect(resolverRuta(`/catalogos/tipos-proceso/${AREA_ID}`)).toEqual({
      nombre: "tipo-proceso",
      id: AREA_ID,
    });
  });

  it("no confunde `nuevo` con un tipo de proceso llamado «nuevo»", () => {
    expect(resolverRuta("/catalogos/tipos-proceso/nuevo")).not.toHaveProperty(
      "id",
    );
  });

  it("no inventa una ruta para lo que no conoce", () => {
    for (const ruta of [
      "/catalogos/no-existe",
      "/catalogos/tipos-proceso//editar",
      `/catalogos/tipos-proceso/${AREA_ID}/extra`,
      "/catalogos/tipos-proceso/%ZZ",
    ]) {
      expect(resolverRuta(ruta), ruta).toEqual({ nombre: "desconocida", ruta });
    }
  });

  it("los enlaces que genera vuelven a resolver a la misma ruta", () => {
    for (const ruta of [
      { nombre: "catalogos" },
      { nombre: "tipos-proceso" },
      { nombre: "tipo-proceso-nuevo" },
      { nombre: "tipo-proceso", id: AREA_ID },
    ] as const) {
      expect(resolverRuta(enlaceDe(ruta))).toEqual(ruta);
    }
  });
});
