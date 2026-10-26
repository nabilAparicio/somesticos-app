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

import type {
  EtapaDeProceso,
  PendienteDeProceso,
  Proceso,
} from "../worker/contract";
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
  AVISO_GUARDAR_NO_SINCRONIZA,
  AVISO_TIPO_NUEVO_NO_REASIGNA,
  BORRADOR_DE_GUARDADO_VACIO,
  aPeticionDeGuardado,
  resumenDelPlan,
  validarGuardado,
} from "../src/pantallas/procesos/plantilla";
import {
  avanceDe,
  avisoDeProcesoCerrado,
  estadoLegible,
  etiquetaDeOrigen,
  filtrarPorEstado,
  filtrarProcesos,
  ocultosPorEstado,
  ordenarProcesos,
  procesosDeCotizacion,
  proximoPaso,
  resumenDeTrabajoVigente,
  textoDeOrigen,
} from "../src/pantallas/procesos/presentacion";
import { enlaceDe, resolverRuta } from "../src/ruteo";

const PROCESO_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const CLIENTE_ID = "11111111-2222-4333-8444-555555555555";
const TIPO_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const AREA_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

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
    // T-15: el caso corriente es el proceso abierto a mano, y lo escribe
    // **el molde** en vez de dejarlo implícito. Un campo ausente del molde
    // llega `undefined` y no `null`, y una aserción de ausencia contra
    // `undefined` pasa sin que el código haya decidido nada.
    cotizacionDeOrigen: null,
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

  /*
   * T-15 · el selector de responsable. El mapeo ya existía desde T-7; lo que
   * faltaba era la pantalla que lo poblara. Esta prueba cierra el hueco de
   * cobertura del otro lado del `<select>`: lo que manda cuando sí se
   * eligió a alguien.
   */
  it("manda el responsable elegido, sin los espacios del valor", () => {
    expect(
      aPeticionDeProceso(borrador({ responsableId: "  u2  " })).responsableId,
    ).toBe("u2");
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

// ---------------------------------------------------------------------------
// T-11 · Guardar el plan como plantilla, desde la pantalla del proceso
// ---------------------------------------------------------------------------

describe("el borrador de «guardar como plantilla»", () => {
  const CON_PLAN = 4;

  it("con el destino «actualizar» no pide nada más", () => {
    expect(
      validarGuardado({ ...BORRADOR_DE_GUARDADO_VACIO }, CON_PLAN),
    ).toEqual([]);
  });

  it("rechaza guardar un plan vacío: no hay plan que guardar", () => {
    expect(
      validarGuardado({ ...BORRADOR_DE_GUARDADO_VACIO }, 0).map(
        (falla) => falla.motivo,
      ),
    ).toEqual(["plan_vacio"]);
  });

  it("un tipo nuevo exige nombre y área", () => {
    const motivos = validarGuardado(
      { ...BORRADOR_DE_GUARDADO_VACIO, destino: "nuevo" },
      CON_PLAN,
    ).map((falla) => falla.motivo);

    expect(motivos).toContain("nombre_requerido");
    expect(motivos).toContain("area_requerida");
  });

  it("un nombre de solo espacios no es un nombre", () => {
    const motivos = validarGuardado(
      {
        destino: "nuevo",
        areaId: AREA_ID,
        nombre: "   ",
        descripcion: "",
      },
      CON_PLAN,
    ).map((falla) => falla.motivo);

    expect(motivos).toEqual(["nombre_requerido"]);
  });

  it("acepta un tipo nuevo completo", () => {
    expect(
      validarGuardado(
        {
          destino: "nuevo",
          areaId: AREA_ID,
          nombre: "Residencia permanente, variante acelerada",
          descripcion: "",
        },
        CON_PLAN,
      ),
    ).toEqual([]);
  });

  it("manda solo el destino cuando se actualiza la plantilla del tipo", () => {
    expect(aPeticionDeGuardado({ ...BORRADOR_DE_GUARDADO_VACIO })).toEqual({
      destino: "actualizar",
    });
  });

  it("manda el área, el nombre y la descripción recortados para un tipo nuevo", () => {
    expect(
      aPeticionDeGuardado({
        destino: "nuevo",
        areaId: ` ${AREA_ID} `,
        nombre: "  Residencia express  ",
        descripcion: "  La variante con cita previa.  ",
      }),
    ).toEqual({
      destino: "nuevo",
      areaId: AREA_ID,
      nombre: "Residencia express",
      descripcion: "La variante con cita previa.",
    });
  });

  it("una descripción en blanco viaja como nula, no como cadena vacía", () => {
    expect(
      aPeticionDeGuardado({
        destino: "nuevo",
        areaId: AREA_ID,
        nombre: "Residencia express",
        descripcion: "   ",
      }),
    ).toEqual({
      destino: "nuevo",
      areaId: AREA_ID,
      nombre: "Residencia express",
      descripcion: null,
    });
  });

  it("dice cuántos pasos se guardan, contando los cumplidos", () => {
    expect(resumenDelPlan(4, 2)).toBe(
      "Se guardan los 4 pasos del plan, los 2 ya cumplidos incluidos.",
    );
    expect(resumenDelPlan(3, 0)).toBe("Se guardan los 3 pasos del plan.");
    expect(resumenDelPlan(1, 0)).toBe("Se guarda el único paso del plan.");
    expect(resumenDelPlan(0, 0)).toBe(
      "Este proceso no tiene plan todavía: no hay nada que guardar.",
    );
  });
});

describe("los avisos de guardar como plantilla dicen lo que el diseño pide", () => {
  it("avisa que guardar NO sincroniza los procesos ya abiertos, ni éste", () => {
    // El punto donde más gente va a suponer lo contrario: acaba de ajustar
    // un plan y lo está «guardando», así que es natural creer que eso lo
    // sincroniza todo (`docs/diseno.md` §6).
    expect(AVISO_GUARDAR_NO_SINCRONIZA).toMatch(/no cambia/i);
    expect(AVISO_GUARDAR_NO_SINCRONIZA).toMatch(/procesos ya abiertos/i);
    expect(AVISO_GUARDAR_NO_SINCRONIZA).toMatch(/ni siquiera éste/i);
  });

  it("avisa que un tipo nuevo no reasigna el proceso de origen", () => {
    expect(AVISO_TIPO_NUEVO_NO_REASIGNA).toMatch(/sigue siendo/i);
    expect(AVISO_TIPO_NUEVO_NO_REASIGNA).toMatch(/tipo/i);
  });
});

// ---------------------------------------------------------------------------
// T-14 · El estado del proceso en la pantalla
// ---------------------------------------------------------------------------

const CERRADO_EN = "2026-10-22T18:00:00.000Z";

function cerrado(ajustes: Partial<Proceso> = {}): Proceso {
  return proceso({ estado: "cerrado", cerradoEn: CERRADO_EN, ...ajustes });
}

function pendienteAbierto(
  ajustes: Partial<PendienteDeProceso> = {},
): PendienteDeProceso {
  return {
    id: "pendiente-1",
    procesoEtapaId: "e1",
    procesoEtapaNombre: "Recepción",
    texto: "Falta el certificado apostillado",
    autorId: "u1",
    autorNombre: "Itzel",
    responsableId: null,
    responsableNombre: null,
    creadoEn: MOMENTO,
    venceEn: null,
    cerradoEn: null,
    cerradoPor: null,
    cerradoPorNombre: null,
    ...ajustes,
  };
}

describe("el filtro por estado del listado", () => {
  const filas = [
    proceso({ id: "p1", titulo: "Sigue" }),
    cerrado({ id: "p2", titulo: "Terminado" }),
    cerrado({ id: "p3", titulo: "También terminado" }),
  ];

  it("muestra solo los abiertos, que es lo que el bufete abre a ver", () => {
    expect(filtrarPorEstado(filas, "abiertos").map((p) => p.id)).toEqual([
      "p1",
    ]);
  });

  it("muestra solo los cerrados cuando se los pide", () => {
    expect(filtrarPorEstado(filas, "cerrados").map((p) => p.id)).toEqual([
      "p2",
      "p3",
    ]);
  });

  it("«todos» no filtra nada", () => {
    expect(filtrarPorEstado(filas, "todos")).toHaveLength(3);
  });

  it("no toca el arreglo que recibe: puede ser estado de React", () => {
    const copia = [...filas];
    filtrarPorEstado(filas, "abiertos");
    expect(filas).toEqual(copia);
  });

  it("DICE lo que está escondiendo, en vez de esconderlo callado", () => {
    // Un filtro por defecto que oculta filas sin decirlo es una cuenta que
    // nadie puede comprobar: «4 de 6» no explica por qué faltan dos.
    expect(ocultosPorEstado(filas, "abiertos")).toBe(
      "Hay 2 procesos cerrados que no se están mostrando.",
    );
    expect(ocultosPorEstado([filas[0], filas[1]], "abiertos")).toBe(
      "Hay 1 proceso cerrado que no se está mostrando.",
    );
  });

  it("lo dice en las dos direcciones, no solo en la cómoda", () => {
    // Una regla y no dos: el aviso nombra lo que el filtro deja afuera, sea
    // lo que sea. La versión que solo avisa de los cerrados obliga a
    // recordar cuál de las dos opciones era la que callaba.
    expect(ocultosPorEstado(filas, "cerrados")).toBe(
      "Hay 1 proceso abierto que no se está mostrando.",
    );
  });

  it("no dice nada cuando no esconde nada", () => {
    expect(ocultosPorEstado(filas, "todos")).toBeNull();
    expect(ocultosPorEstado([proceso({ id: "p1" })], "abiertos")).toBeNull();
    expect(ocultosPorEstado([cerrado({ id: "p2" })], "cerrados")).toBeNull();
  });
});

describe("el estado del proceso, dicho", () => {
  it("un proceso abierto lo dice sin fecha, porque no hay ninguna", () => {
    expect(estadoLegible(proceso())).toBe("Abierto");
  });

  it("un proceso cerrado dice cuándo se cerró", () => {
    // El valor esperado va escrito a mano. Hasta T-18 esta aserción decía
    // `Cerrado el ${fechaLegible(CERRADO_EN)}`, o sea calculaba lo esperado
    // con la misma función que tenía el defecto: concordaba consigo misma
    // escribiera `22 oct 2026` o `10/22/2026`. Con el defecto adentro, pasó.
    //
    // La hora va con un patrón y no con una cifra porque `fechaLegible`
    // escribe en el huso local: lo que esta prueba vigila es la **frase**,
    // y el orden de la fecha tiene su propia prueba literal en
    // `test/formatos.spec.ts`.
    expect(estadoLegible(cerrado())).toMatch(
      /^Cerrado el 22 oct 2026, \d{1,2}:\d{2} [ap]\. m\.$/,
    );
  });

  it("un proceso cerrado SIN fecha no se inventa una", () => {
    // No puede pasar por la API, pero el dato llega del cable y rellenarlo
    // sería escribir una fecha que nadie firmó.
    expect(estadoLegible(cerrado({ cerradoEn: null }))).toBe("Cerrado");
  });
});

describe("el aviso de que el proceso está cerrado", () => {
  it("no aparece mientras el proceso sigue abierto", () => {
    expect(avisoDeProcesoCerrado(proceso())).toBeNull();
  });

  it("nombra lo que no se puede y la salida, no solo la prohibición", () => {
    const aviso = avisoDeProcesoCerrado(cerrado());
    expect(aviso).not.toBeNull();

    const texto = aviso ?? "";
    // Las tres prohibiciones, para que nadie descubra una apretando.
    expect(texto).toContain("avanza");
    expect(texto).toContain("plan");
    expect(texto).toContain("pendientes");
    // Y las dos salidas, que es lo que lo vuelve un aviso y no una pared.
    expect(texto).toContain("nota");
    expect(texto).toContain("reabr");
  });
});

describe("el trabajo vigente que cuenta la cabecera", () => {
  it("con el proceso abierto cuenta igual que siempre", () => {
    expect(
      resumenDeTrabajoVigente(proceso(), [pendienteAbierto()], "2026-10-23"),
    ).toBe("1 pendiente abierto.");
  });

  it("con el proceso abierto marca los vencidos", () => {
    expect(
      resumenDeTrabajoVigente(
        proceso(),
        [pendienteAbierto({ venceEn: "2026-10-01" })],
        "2026-10-23",
      ),
    ).toBe("1 pendiente abierto, 1 vencido.");
  });

  it("DECISIÓN DE T-14: con el proceso cerrado no los cuenta como trabajo", () => {
    // La cuenta de la cabecera es «lo que obliga a mirar hoy». Un trámite
    // terminado no obliga a nada, así que el número deja de ser una tarea.
    const texto = resumenDeTrabajoVigente(
      cerrado(),
      [pendienteAbierto(), pendienteAbierto({ id: "pendiente-2" })],
      "2026-10-23",
    );

    expect(texto).not.toBe("2 pendientes abiertos.");
    expect(texto).toContain("cerrado");
    // Pero sin ocultar cuántos quedaron: no alarmar no es esconder.
    expect(texto).toContain("2");
  });

  it("con el proceso cerrado se apaga la alarma de lo vencido", () => {
    // Rojo sobre algo que nadie va a perseguir es ruido, igual que la marca
    // de vencido en un pendiente ya cerrado.
    const texto = resumenDeTrabajoVigente(
      cerrado(),
      [pendienteAbierto({ venceEn: "2026-10-01" })],
      "2026-10-23",
    );

    expect(texto).not.toContain("vencido");
  });

  it("un proceso cerrado sin cabos sueltos lo dice", () => {
    expect(resumenDeTrabajoVigente(cerrado(), [], "2026-10-23")).toContain(
      "cerrado",
    );
  });
});

/* ==========================================================================
   T-15 · De dónde viene cada proceso

   `Proceso.cotizacionDeOrigen` llega del cable ya resuelto: la cotización
   que lo abrió, con su código al lado. Lo que vive acá es qué **dice** la
   pantalla con eso, escrito como función para afirmarlo sin montar un
   navegador.

   Cada cosa se afirma en **las dos direcciones**, y no es simetría
   decorativa: una aserción de ausencia no mide nada sin su aserción de
   presencia al lado. `etiquetaDeOrigen` cableada a `null` pasaría sola la
   mitad que dice que un proceso directo no lleva distintivo.
   ========================================================================== */

const COTIZACION_ID = "cc111111-2222-4333-8444-555555555555";
const OTRA_COTIZACION_ID = "cc111111-2222-4333-8444-555555555556";

/** Un proceso nacido de una cotización ganada. */
function nacido(ajustes: Partial<Proceso> = {}): Proceso {
  return proceso({
    origen: "cotizacion",
    cotizacionDeOrigen: { id: COTIZACION_ID, codigo: "COT-2026-0001" },
    ...ajustes,
  });
}

describe("el distintivo de procedencia del listado", () => {
  it("nombra la cotización de la que nace el proceso", () => {
    expect(etiquetaDeOrigen(nacido())).toBe("De COT-2026-0001");
  });

  it("dice el código que trae, y no uno fijo", () => {
    expect(
      etiquetaDeOrigen(
        nacido({ cotizacionDeOrigen: { id: OTRA_COTIZACION_ID, codigo: "COT-2024-0099" } }),
      ),
    ).toBe("De COT-2024-0099");
  });

  it("el proceso abierto a mano no lleva distintivo", () => {
    expect(etiquetaDeOrigen(proceso())).toBeNull();
  });
});

describe("la procedencia dicha en el detalle del proceso", () => {
  it("nombra la cotización, entre comillas, en una frase", () => {
    expect(textoDeOrigen(nacido())).toBe(
      "Este proceso nace de la cotización «COT-2026-0001».",
    );
  });

  it("el abierto a mano no tiene de dónde nacer, y no se le inventa una frase", () => {
    // El `null` es lo que decide que **no haya botón**: un proceso directo
    // no tiene cotización, así que ofrecerle el enlace sería prometer una
    // pantalla que el servidor contestaría con un 404. Es la lección de la
    // unidad B de T-2, y por eso la condición de la frase y la del enlace
    // son **una sola lectura** y no dos guardas que puedan discrepar.
    expect(textoDeOrigen(proceso())).toBeNull();
  });
});

describe("los procesos que abrió una cotización", () => {
  /*
   * El montón mezcla tres procedencias a propósito. Un doble coherente
   * consigo mismo —tres procesos y los tres de la misma cotización— no
   * distingue **mostrar** la lista que llegó de **elegir** la que
   * corresponde: las dos dan el mismo resultado.
   */
  const MONTON: readonly Proceso[] = [
    nacido({ id: "p1", titulo: "Visa de trabajo" }),
    proceso({ id: "p2", titulo: "Abierto a mano" }),
    nacido({
      id: "p3",
      titulo: "De otra cotización",
      cotizacionDeOrigen: { id: OTRA_COTIZACION_ID, codigo: "COT-2024-0099" },
    }),
    nacido({ id: "p4", titulo: "Permiso de residencia" }),
  ];

  it("son los que nacen de ella, y ninguno más", () => {
    expect(
      procesosDeCotizacion(MONTON, COTIZACION_ID).map((suyo) => suyo.id),
    ).toEqual(["p1", "p4"]);
  });

  it("una cotización que no abrió ninguno devuelve la lista vacía", () => {
    expect(procesosDeCotizacion(MONTON, "cc000000-0000-4000-8000-000000000000")).toEqual(
      [],
    );
  });

  it("no toca el arreglo que llega: puede ser estado de React", () => {
    const entrada = [...MONTON];
    procesosDeCotizacion(entrada, COTIZACION_ID);
    expect(entrada.map((suyo) => suyo.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });
});

describe("el buscador del listado también encuentra por la cotización", () => {
  it("encuentra el proceso escribiendo el código de la cotización", () => {
    const lista = [nacido({ id: "p1" }), proceso({ id: "p2" })];
    expect(filtrarProcesos(lista, "COT-2026-0001").map((suyo) => suyo.id)).toEqual(
      ["p1"],
    );
  });

  it("y el directo no aparece por un código que no tiene", () => {
    expect(filtrarProcesos([proceso()], "COT-2026-0001")).toEqual([]);
  });
});
