/**
 * La lógica de las pantallas de proceso (T-7), sin React y sin DOM.
 *
 * Misma frontera que T-5 y T-6: lo que se puede probar como función se
 * escribe como función y vive en un `.ts`, para que corra en este runner en
 * vez de exigir un navegador para comparar cadenas. Lo que queda en el
 * `.tsx` es el dibujo.
 *
 * Lo que más importa acá:
 *
 *  - **La separación entre lo cumplido y lo que falta.** «Lo que viene» es
 *    la mitad del valor del proceso (`docs/diseno.md` §6): el abogado abre un
 *    proceso para ver qué tiene por delante, no solo dónde quedó. El cálculo
 *    es una función y se prueba acá; que la pantalla lo dibuje separado se
 *    prueba en `e2e/procesos.spec.ts`.
 *  - **La segunda copia de la guarda de la etapa alcanzada.** Como en T-5:
 *    la del navegador avisa, la del servidor autoriza. Son dos copias
 *    declaradas, y cada una tiene sus propias pruebas, para que aflojar una
 *    mate las suyas y no las de la otra.
 */
import { describe, expect, it } from "vitest";

import type { EtapaDeProceso, Proceso } from "../worker/contract";
import {
  BORRADOR_DE_PROCESO_VACIO,
  aPeticionDeProceso,
  clientesSeleccionables,
  tipoSeleccionables,
  tituloSugerido,
  validarProceso,
  type BorradorDeProceso,
} from "../src/pantallas/procesos/formulario";
import {
  AVISO_PLAN_PROPIO,
  AYUDA_DE_CARA_AL_CLIENTE,
  agregarPaso,
  aPeticionDePlan,
  esAlcanzado,
  moverPaso,
  planDe,
  quitarPaso,
  renombrarPaso,
  separarPlan,
  validarPlan,
  type PasoDelPlan,
} from "../src/pantallas/procesos/plan";
import {
  avanceDe,
  filtrarProcesos,
  ordenarProcesos,
  proximoPaso,
} from "../src/pantallas/procesos/presentacion";
import { enlaceDe, resolverRuta } from "../src/ruteo";

const PROCESO_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const CLIENTE_ID = "11111111-2222-4333-8444-555555555555";
const TIPO_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const MOMENTO = "2026-10-20T14:30:00.000Z";

function etapa(ajustes: Partial<EtapaDeProceso> = {}): EtapaDeProceso {
  return {
    id: "etapa-1",
    nombre: "Recepción y revisión de documentos",
    orden: 0,
    alcanzadaEn: null,
    ...ajustes,
  };
}

function proceso(ajustes: Partial<Proceso> = {}): Proceso {
  return {
    id: PROCESO_ID,
    clienteId: CLIENTE_ID,
    clienteNombre: "Marta Quintero",
    tipoProcesoId: TIPO_ID,
    tipoProcesoNombre: "Residencia permanente por matrimonio con nacional",
    areaNombre: "Migración y naturalización",
    origen: "directo",
    titulo: "Residencia permanente de Marta Quintero",
    estado: "abierto",
    responsableId: null,
    responsableNombre: null,
    abiertoEn: MOMENTO,
    cerradoEn: null,
    etapasCumplidas: 1,
    etapasTotales: 4,
    etapaVigente: "Presentación ante el Servicio Nacional de Migración",
    ...ajustes,
  };
}

/** Un plan con las dos primeras cumplidas y las dos últimas pendientes. */
function planMixto(): PasoDelPlan[] {
  return planDe([
    etapa({ id: "e1", nombre: "Recepción", orden: 0, alcanzadaEn: MOMENTO }),
    etapa({ id: "e2", nombre: "Presentación", orden: 1, alcanzadaEn: MOMENTO }),
    etapa({ id: "e3", nombre: "Entrevista", orden: 2 }),
    etapa({ id: "e4", nombre: "Resolución", orden: 3 }),
  ]);
}

// ---------------------------------------------------------------------------
// Lo cumplido y lo que falta
// ---------------------------------------------------------------------------

describe("la vista separa lo cumplido de lo que falta", () => {
  it("parte el plan en dos listas, sin perder ni duplicar nada", () => {
    const etapas = [
      etapa({ id: "e1", nombre: "Recepción", orden: 0, alcanzadaEn: MOMENTO }),
      etapa({ id: "e2", nombre: "Presentación", orden: 1 }),
      etapa({ id: "e3", nombre: "Entrevista", orden: 2 }),
    ];

    const { cumplidas, pendientes } = separarPlan(etapas);

    expect(cumplidas.map((e) => e.nombre)).toEqual(["Recepción"]);
    expect(pendientes.map((e) => e.nombre)).toEqual([
      "Presentación",
      "Entrevista",
    ]);
    expect(cumplidas.length + pendientes.length).toBe(etapas.length);
  });

  it("un proceso sin nada cumplido deja la lista de cumplidas vacía", () => {
    const { cumplidas, pendientes } = separarPlan([
      etapa({ id: "e1", orden: 0 }),
      etapa({ id: "e2", orden: 1 }),
    ]);

    expect(cumplidas).toEqual([]);
    expect(pendientes).toHaveLength(2);
  });

  it("un proceso terminado deja la lista de pendientes vacía", () => {
    const { cumplidas, pendientes } = separarPlan([
      etapa({ id: "e1", orden: 0, alcanzadaEn: MOMENTO }),
      etapa({ id: "e2", orden: 1, alcanzadaEn: MOMENTO }),
    ]);

    expect(cumplidas).toHaveLength(2);
    expect(pendientes).toEqual([]);
  });

  it("respeta el orden del plan dentro de cada lista", () => {
    const { pendientes } = separarPlan([
      etapa({ id: "e1", nombre: "Tercera", orden: 2 }),
      etapa({ id: "e2", nombre: "Primera", orden: 0, alcanzadaEn: MOMENTO }),
      etapa({ id: "e3", nombre: "Segunda", orden: 1 }),
    ]);

    expect(pendientes.map((e) => e.nombre)).toEqual(["Segunda", "Tercera"]);
  });
});

// ---------------------------------------------------------------------------
// El borrador del plan: la copia de la guarda que vive en el navegador
// ---------------------------------------------------------------------------

describe("el borrador del plan protege lo alcanzado", () => {
  it("no quita una etapa alcanzada", () => {
    const lista = planMixto();

    expect(quitarPaso(lista, 0).map((p) => p.nombre)).toEqual(
      lista.map((p) => p.nombre),
    );
  });

  it("sí quita una etapa pendiente", () => {
    const lista = planMixto();

    expect(quitarPaso(lista, 2).map((p) => p.nombre)).toEqual([
      "Recepción",
      "Presentación",
      "Resolución",
    ]);
  });

  it("no mueve una etapa alcanzada", () => {
    const lista = planMixto();

    expect(moverPaso(lista, 1, 1).map((p) => p.nombre)).toEqual(
      lista.map((p) => p.nombre),
    );
  });

  it("no mete una pendiente por encima de una alcanzada", () => {
    const lista = planMixto();

    // Subir la primera pendiente la pondría delante de una cumplida.
    expect(moverPaso(lista, 2, -1).map((p) => p.nombre)).toEqual(
      lista.map((p) => p.nombre),
    );
  });

  it("sí reordena entre pendientes", () => {
    const lista = planMixto();

    expect(moverPaso(lista, 3, -1).map((p) => p.nombre)).toEqual([
      "Recepción",
      "Presentación",
      "Resolución",
      "Entrevista",
    ]);
  });

  it("no se sale del arreglo por los bordes", () => {
    const lista = planMixto();

    // Sin la guarda de borde, el índice -1 hace que `splice` saque la etapa
    // de la lista y el plan pierda un paso en silencio.
    expect(moverPaso(lista, 0, -1)).toHaveLength(lista.length);
    expect(moverPaso(lista, lista.length - 1, 1)).toHaveLength(lista.length);
    expect(moverPaso(lista, 99, 1)).toHaveLength(lista.length);
  });

  it("agrega al final, que es el único lugar donde no estorba lo cumplido", () => {
    const lista = agregarPaso(planMixto(), "  Apostilla del acta  ");

    expect(lista.map((p) => p.nombre)).toEqual([
      "Recepción",
      "Presentación",
      "Entrevista",
      "Resolución",
      "Apostilla del acta",
    ]);
    expect(lista[4].id, "una etapa nueva no trae identificador").toBeNull();
    expect(lista[4].alcanzadaEn).toBeNull();
  });

  it("una etapa en blanco no se agrega", () => {
    expect(agregarPaso(planMixto(), "   ")).toHaveLength(4);
  });

  it("renombrar una alcanzada se permite: es texto de cara al cliente", () => {
    const lista = renombrarPaso(planMixto(), 0, "Recepción de papelería");

    expect(lista[0].nombre).toBe("Recepción de papelería");
    expect(lista[0].alcanzadaEn, "el hecho no se rehace").toBe(MOMENTO);
  });

  it("no muta el arreglo que recibe", () => {
    const lista = planMixto();
    const copia = lista.map((paso) => ({ ...paso }));

    quitarPaso(lista, 2);
    moverPaso(lista, 3, -1);
    agregarPaso(lista, "Otra");
    renombrarPaso(lista, 3, "Otra cosa");

    expect(lista).toEqual(copia);
  });

  it("marca qué paso está alcanzado", () => {
    const lista = planMixto();

    expect(lista.map(esAlcanzado)).toEqual([true, true, false, false]);
  });

  it("rechaza un paso sin nombre antes de mandarlo", () => {
    const lista = renombrarPaso(planMixto(), 3, "   ");

    expect(validarPlan(lista)).toEqual([
      { campo: "etapa-3", motivo: "nombre_requerido" },
    ]);
  });

  it("un plan vacío es válido: un proceso puede no tener pasos todavía", () => {
    expect(validarPlan([])).toEqual([]);
  });

  it("manda solo id y nombre, recortado: el orden es la posición", () => {
    const lista = agregarPaso(planMixto(), " Apostilla ");

    expect(aPeticionDePlan(lista)).toEqual([
      { id: "e1", nombre: "Recepción" },
      { id: "e2", nombre: "Presentación" },
      { id: "e3", nombre: "Entrevista" },
      { id: "e4", nombre: "Resolución" },
      { id: null, nombre: "Apostilla" },
    ]);
  });

  it("los dos avisos de la pantalla dicen lo que el diseño pide", () => {
    // El plan es del proceso, no de la plantilla: la pantalla lo dice donde
    // se edita, que es la contracara del aviso de T-6.
    expect(AVISO_PLAN_PROPIO).toMatch(/plan/i);
    expect(AVISO_PLAN_PROPIO).toMatch(/plantilla/i);
    expect(AVISO_PLAN_PROPIO).toMatch(/cumplida|alcanzada/i);

    // Los nombres de etapa son texto de cara al cliente (§6).
    expect(AYUDA_DE_CARA_AL_CLIENTE).toMatch(/cliente/i);
  });
});

// ---------------------------------------------------------------------------
// El alta
// ---------------------------------------------------------------------------

describe("el formulario de alta", () => {
  function borrador(ajustes: Partial<BorradorDeProceso> = {}) {
    return {
      ...BORRADOR_DE_PROCESO_VACIO,
      clienteId: CLIENTE_ID,
      tipoProcesoId: TIPO_ID,
      titulo: "Residencia permanente de Marta Quintero",
      ...ajustes,
    };
  }

  it("exige cliente, tipo y título", () => {
    const motivos = validarProceso(BORRADOR_DE_PROCESO_VACIO).map(
      (f) => f.motivo,
    );

    expect(motivos).toContain("cliente_requerido");
    expect(motivos).toContain("tipo_proceso_requerido");
    expect(motivos).toContain("titulo_requerido");
  });

  it("un título de solo espacios no es un título", () => {
    expect(validarProceso(borrador({ titulo: "   " })).map((f) => f.motivo)).toEqual(
      ["titulo_requerido"],
    );
  });

  it("acepta un borrador completo", () => {
    expect(validarProceso(borrador())).toEqual([]);
  });

  it("manda el responsable como nulo cuando no se eligió", () => {
    expect(aPeticionDeProceso(borrador())).toEqual({
      clienteId: CLIENTE_ID,
      tipoProcesoId: TIPO_ID,
      titulo: "Residencia permanente de Marta Quintero",
      responsableId: null,
    });
  });

  it("recorta el título", () => {
    expect(
      aPeticionDeProceso(borrador({ titulo: "  Residencia de Marta  " })).titulo,
    ).toBe("Residencia de Marta");
  });

  it("sugiere un título que distingue un proceso de otro del mismo tipo", () => {
    // Sin el nombre del cliente, cinco residencias se llaman igual en el
    // listado y hay que abrirlas una por una para saber cuál es cuál.
    expect(
      tituloSugerido("Residencia permanente", "Marta Quintero"),
    ).toBe("Residencia permanente — Marta Quintero");

    expect(tituloSugerido(null, "Marta Quintero")).toBe("");
    expect(tituloSugerido("Residencia permanente", null)).toBe(
      "Residencia permanente",
    );
  });

  /*
   * Lo válido y lo seleccionable son cosas distintas, igual que en T-5: un
   * tipo dado de baja sigue siendo válido para los procesos que ya lo usan,
   * pero no se ofrece para abrir uno nuevo. La excepción es el que ya está
   * elegido, que tiene que poder nombrarse.
   */
  it("no ofrece tipos ni clientes dados de baja, salvo el ya elegido", () => {
    // Los nombres están elegidos para que el orden alfabético coincida con
    // el de los identificadores: lo que esta prueba mira es el filtro, y una
    // expectativa que dependiera del orden por accidente sería frágil.
    const tipos = [
      { id: "t1", nombre: "Apelación ante el Tribunal Superior", activo: true },
      { id: "t2", nombre: "Zonas francas (dado de baja)", activo: false },
    ];

    expect(tipoSeleccionables(tipos, "").map((t) => t.id)).toEqual(["t1"]);
    expect(tipoSeleccionables(tipos, "t2").map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("ofrece todos los clientes: un cliente no se da de baja", () => {
    const clientes = [
      { id: "c1", nombre: "Marta Quintero" },
      { id: "c2", nombre: "Inversiones del Istmo, S.A." },
    ];

    expect(clientesSeleccionables(clientes).map((c) => c.nombre)).toEqual([
      "Inversiones del Istmo, S.A.",
      "Marta Quintero",
    ]);
  });
});

// ---------------------------------------------------------------------------
// El listado
// ---------------------------------------------------------------------------

describe("la presentación del listado", () => {
  it("dice el avance en etapas, no en porcentaje inventado", () => {
    expect(avanceDe(proceso())).toBe("1 de 4");
    expect(avanceDe(proceso({ etapasCumplidas: 0, etapasTotales: 0 }))).toBe(
      "Sin plan",
    );
  });

  it("nombra lo que viene, que es la mitad del valor", () => {
    expect(proximoPaso(proceso())).toBe(
      "Presentación ante el Servicio Nacional de Migración",
    );
    expect(
      proximoPaso(
        proceso({ etapasCumplidas: 4, etapasTotales: 4, etapaVigente: null }),
      ),
    ).toBe("Todas las etapas cumplidas");
    expect(
      proximoPaso(
        proceso({ etapasCumplidas: 0, etapasTotales: 0, etapaVigente: null }),
      ),
    ).toBe("Sin plan todavía");
  });

  it("ordena por cliente y después por título", () => {
    const filas = [
      proceso({ id: "p1", clienteNombre: "Ávila, Ana", titulo: "B" }),
      proceso({ id: "p2", clienteNombre: "Álvarez, Ana", titulo: "Z" }),
      proceso({ id: "p3", clienteNombre: "Ávila, Ana", titulo: "A" }),
    ];

    expect(ordenarProcesos(filas).map((p) => p.id)).toEqual([
      "p2",
      "p3",
      "p1",
    ]);
  });

  it("no toca el arreglo que recibe: puede ser estado de React", () => {
    const filas = [proceso({ id: "p1", titulo: "Z" }), proceso({ id: "p2", titulo: "A" })];
    const copia = [...filas];

    ordenarProcesos(filas);

    expect(filas).toEqual(copia);
  });

  it("filtra ignorando acentos y mayúsculas", () => {
    const filas = [
      proceso({
        id: "p1",
        titulo: "Residencia",
        clienteNombre: "Marta",
        tipoProcesoNombre: "Residencia permanente",
      }),
      proceso({
        id: "p2",
        titulo: "Divorcio",
        clienteNombre: "Núñez",
        tipoProcesoNombre: "Divorcio de mutuo acuerdo",
      }),
    ];

    expect(filtrarProcesos(filas, "nunez").map((p) => p.id)).toEqual(["p2"]);
    expect(filtrarProcesos(filas, "RESIDENCIA").map((p) => p.id)).toEqual([
      "p1",
    ]);
    expect(filtrarProcesos(filas, "   ")).toHaveLength(2);
  });

  it("también busca por la etapa que viene", () => {
    const filas = [
      proceso({ id: "p1", etapaVigente: "Entrevista domiciliaria" }),
      proceso({ id: "p2", etapaVigente: "Resolución" }),
    ];

    expect(filtrarProcesos(filas, "entrevista").map((p) => p.id)).toEqual([
      "p1",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Las rutas
// ---------------------------------------------------------------------------

describe("las rutas de procesos", () => {
  it("resuelve el listado, el alta y el detalle", () => {
    expect(resolverRuta("/procesos")).toEqual({ nombre: "procesos" });
    expect(resolverRuta("/procesos/nuevo")).toEqual({
      nombre: "proceso-nuevo",
      clienteId: null,
    });
    expect(resolverRuta(`/procesos/${PROCESO_ID}`)).toEqual({
      nombre: "proceso",
      id: PROCESO_ID,
    });
  });

  it("el alta desde un cliente lleva el cliente en la ruta", () => {
    expect(resolverRuta(`/clientes/${CLIENTE_ID}/procesos/nuevo`)).toEqual({
      nombre: "proceso-nuevo",
      clienteId: CLIENTE_ID,
    });
  });

  it("ida y vuelta: cada ruta se arma y se vuelve a resolver igual", () => {
    const rutas = [
      { nombre: "procesos" } as const,
      { nombre: "proceso-nuevo", clienteId: null } as const,
      { nombre: "proceso-nuevo", clienteId: CLIENTE_ID } as const,
      { nombre: "proceso", id: PROCESO_ID } as const,
    ];

    for (const ruta of rutas) {
      expect(resolverRuta(enlaceDe(ruta))).toEqual(ruta);
    }
  });

  it("una ruta de proceso mal formada no se inventa un identificador", () => {
    expect(resolverRuta("/procesos//editar")).toHaveProperty(
      "nombre",
      "desconocida",
    );
    expect(resolverRuta("/procesos/%ZZ")).toHaveProperty(
      "nombre",
      "desconocida",
    );
    expect(resolverRuta("/procesos/x/y/z")).toHaveProperty(
      "nombre",
      "desconocida",
    );
  });

  it("escapa el identificador en el enlace", () => {
    expect(enlaceDe({ nombre: "proceso", id: "a b/c" })).toBe(
      "/procesos/a%20b%2Fc",
    );
  });
});
