/**
 * El ciclo de vida en pantalla (T-4 y T-5, unidad B), del lado puro.
 *
 * Lo que se prueba acá es **qué controles existen en cada estado** y **qué
 * dice la pantalla antes de que alguien apriete uno**. Nada de esto monta un
 * navegador: `src/pantallas/cotizaciones/ciclo.ts` no importa React ni toca
 * el DOM, igual que `presentacion.ts` y por el mismo motivo —son funciones de
 * datos a texto, y adentro de un `.tsx` sólo se pueden probar levantando un
 * navegador para leer lo que ya era una cadena—.
 *
 * Que los controles aparezcan **dibujados** es de `e2e/cotizaciones.spec.ts`.
 * Las dos mitades hacen falta: ésta prueba la regla, aquélla prueba el
 * cableado.
 *
 * ## La fuente de verdad, y por qué se repite acá a mano
 *
 * Las tres transiciones legales las manda `migrations/0007_ciclo_de_vida.sql`:
 *
 *     borrador ──> emitida ──> ganada | perdida
 *
 * Esta suite las escribe **literales**, estado por estado, y no las deriva de
 * ninguna tabla compartida con el código bajo prueba. Es la restricción 6 de
 * la tajada: una prueba que calcula lo que espera con la misma estructura que
 * prueba pasa aunque las dos estén mal. Si mañana la base admite una cuarta
 * flecha, esta suite tiene que ponerse roja y obligar a escribirla a mano.
 */
import { describe, expect, it } from "vitest";

import type {
  Cotizacion,
  EstadoDeCotizacion,
  LineaDeCotizacion,
  Proceso,
} from "../worker/contract";
import { textoDeProblema } from "../src/api/peticiones";
import {
  AVISO_DE_LINEAS_NO_LEIDAS,
  ROTULOS_DE_ACCION,
  aAperturaDeProcesos,
  accionesDe,
  confirmacionDeEmitir,
  propuestaDeProcesos,
  propuestaVacia,
  salidasEnProsa,
  textoDeAperturaDeProcesos,
  textoDeProcedencia,
  textoDeProcesosAbiertos,
  validarPropuesta,
  type AccionDeCiclo,
} from "../src/pantallas/cotizaciones/ciclo";
import { avisoDeNoEsBorrador } from "../src/pantallas/cotizaciones/presentacion";

const ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const ID_DEL_ORIGEN = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e60";
const CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";

function cotizacion(ajustes: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: ID,
    codigo: "COT-2026-0007",
    estado: "borrador",
    clienteId: CLIENTE_ID,
    clienteNombre: "Carlos Pérez",
    fecha: "2026-10-22T14:03:00.000Z",
    venceEn: null,
    moneda: "USD",
    duplicadaDeId: null,
    creadaPor: "7335d417-61da-459d-899c-0a01c76a2f94",
    creadaPorNombre: "Itzel",
    creadaEn: "2026-10-22T14:03:00.000Z",
    ...ajustes,
  };
}

/** Los cuatro estados, escritos a mano. Ver la cabecera del archivo. */
const ESTADOS: readonly EstadoDeCotizacion[] = [
  "borrador",
  "emitida",
  "ganada",
  "perdida",
];

function accionesEn(estado: EstadoDeCotizacion): readonly AccionDeCiclo[] {
  return accionesDe(cotizacion({ estado }));
}

// ---------------------------------------------------------------------------
// Las tres flechas, y ni una más
// ---------------------------------------------------------------------------

describe("accionesDe, estado por estado", () => {
  it("un borrador se emite, y se puede duplicar", () => {
    expect(accionesEn("borrador")).toEqual(["emitir", "duplicar"]);
  });

  it("una emitida se gana o se pierde, y se puede duplicar", () => {
    expect(accionesEn("emitida")).toEqual(["ganar", "perder", "duplicar"]);
  });

  it("una ganada no tiene salida más que duplicar", () => {
    expect(accionesEn("ganada")).toEqual(["duplicar"]);
  });

  it("una perdida no tiene salida más que duplicar", () => {
    expect(accionesEn("perdida")).toEqual(["duplicar"]);
  });
});

describe("accionesDe, lo que nunca ofrece", () => {
  it("no ofrece ganar ni perder sobre un borrador", () => {
    // `borrador → ganada` es la peor de las transiciones que la base cerró:
    // no es «ganar un borrador», es fabricar un documento congelado sin
    // pasar por emitir. La pantalla no puede ser la que lo pida.
    expect(accionesEn("borrador")).not.toContain("ganar");
    expect(accionesEn("borrador")).not.toContain("perder");
  });

  it("no ofrece emitir nada que ya haya salido del borrador", () => {
    for (const estado of ["emitida", "ganada", "perdida"] as const) {
      expect(
        accionesEn(estado),
        `«emitir» no puede ofrecerse sobre una ${estado}`,
      ).not.toContain("emitir");
    }
  });

  it("ganada y perdida son el final: ni se ganan ni se pierden de nuevo", () => {
    for (const estado of ["ganada", "perdida"] as const) {
      expect(accionesEn(estado)).not.toContain("ganar");
      expect(accionesEn(estado)).not.toContain("perder");
    }
  });

  it("duplicar nace un borrador desde cualquier estado", () => {
    for (const estado of ESTADOS) {
      expect(
        accionesEn(estado),
        `duplicar tiene que existir sobre una ${estado}`,
      ).toContain("duplicar");
    }
  });

  it("ninguna acción se repite ni se cuela una que no sea del ciclo", () => {
    // El mapa es literal y una duplicación dibujaría dos botones iguales,
    // que es la forma que toma un copiar-pegar mal terminado.
    for (const estado of ESTADOS) {
      const acciones = accionesEn(estado);
      expect(new Set(acciones).size, `${estado} repite una acción`).toBe(
        acciones.length,
      );
    }
  });
});

describe("ROTULOS_DE_ACCION", () => {
  it("cada acción tiene su rótulo, y ninguno se repite", () => {
    const rotulos = Object.values(ROTULOS_DE_ACCION);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it("emitir y el botón que confirma no se llaman igual", () => {
    // Dos controles con el mismo nombre accesible son dos controles que
    // ninguna prueba —ni ninguna persona con lector de pantalla— puede
    // distinguir.
    expect(ROTULOS_DE_ACCION.emitir).not.toBe(
      ROTULOS_DE_ACCION.emitir + " y congelar",
    );
  });
});

// ---------------------------------------------------------------------------
// Emitir es irreversible, y la pantalla tiene que decirlo
// ---------------------------------------------------------------------------

describe("confirmacionDeEmitir", () => {
  const TEXTO = confirmacionDeEmitir(cotizacion({ codigo: "COT-2026-0042" }));

  it("nombra la cotización que se está por congelar", () => {
    // «¿Confirmás?» en una pantalla con tres cotizaciones abiertas en tres
    // pestañas no dice cuál se está por congelar.
    expect(TEXTO).toContain("COT-2026-0042");
  });

  it("dice que el documento se congela y deja de poder editarse", () => {
    expect(TEXTO).toContain("congela");
    expect(TEXTO).toContain("no se vuelve a editar");
  });

  it("nombra las dos mitades del contenido que quedan congeladas", () => {
    // Que no se pueda editar «la cotización» deja afuera lo que la persona
    // acaba de escribir, que son los módulos y las líneas.
    expect(TEXTO).toContain("módulos");
    expect(TEXTO).toContain("líneas");
  });

  it("dice que no se deshace por ningún otro camino", () => {
    // Lo cierran disparadores de `0006`: no es una regla de esta pantalla
    // que alguien pueda saltarse entrando por otro lado.
    expect(TEXTO).toContain("ningún otro camino");
  });

  it("no pregunta si está seguro: informa", () => {
    // El criterio de la unidad: que diga qué pasa, no que pregunte. «¿Estás
    // seguro?» no informa a nadie, y una confirmación que no informa se
    // aprieta sin leer.
    expect(TEXTO.toLowerCase()).not.toContain("seguro");
    expect(TEXTO).not.toContain("¿");
  });

  it("nombra lo que queda después, que es el ciclo que sigue", () => {
    expect(TEXTO).toContain("ganada");
    expect(TEXTO).toContain("perdida");
    expect(TEXTO).toContain("duplicarla");
  });
});

// ---------------------------------------------------------------------------
// Lo que la pantalla dice en cada estado
// ---------------------------------------------------------------------------

describe("salidasEnProsa", () => {
  it("una emitida tiene tres salidas y se nombran las tres", () => {
    expect(salidasEnProsa(cotizacion({ estado: "emitida" }))).toBe(
      "marcarla ganada, marcarla perdida o duplicarla",
    );
  });

  it("una ganada tiene una sola salida y no lleva coordinación", () => {
    expect(salidasEnProsa(cotizacion({ estado: "ganada" }))).toBe(
      "duplicarla",
    );
  });

  it("un borrador nombra emitir primero", () => {
    expect(salidasEnProsa(cotizacion({ estado: "borrador" }))).toBe(
      "emitirla o duplicarla",
    );
  });
});

describe("avisoDeNoEsBorrador, ahora que las salidas existen", () => {
  it("un borrador no tiene nada que avisar", () => {
    expect(avisoDeNoEsBorrador(cotizacion({ estado: "borrador" }))).toBeNull();
  });

  it("una emitida nombra sus tres salidas y no promete editar", () => {
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "emitida" })) ?? "";

    expect(aviso).toContain("Emitida");
    expect(aviso).toContain("marcarla ganada");
    expect(aviso).toContain("marcarla perdida");
    expect(aviso).toContain("duplicarla");
  });

  it("una ganada nombra duplicar y **no** nombra ganar ni perder", () => {
    // Es la lección de la unidad B de T-2 con otra piel: nombrar una salida
    // que no existe manda a buscar un botón que no está. Ganada y perdida
    // son el final.
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "ganada" })) ?? "";

    expect(aviso).toContain("duplicarla");
    expect(aviso).not.toContain("ganada,");
    expect(aviso).not.toContain("marcarla perdida");
  });

  it("una perdida tampoco ofrece volver a ganarla", () => {
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "perdida" })) ?? "";

    expect(aviso).toContain("duplicarla");
    expect(aviso).not.toContain("marcarla ganada");
  });
});

// ---------------------------------------------------------------------------
// La cadena de duplicación
// ---------------------------------------------------------------------------

describe("textoDeProcedencia", () => {
  it("nombra la cotización de la que salió", () => {
    expect(
      textoDeProcedencia(
        cotizacion({ id: ID_DEL_ORIGEN, codigo: "COT-2025-0001" }),
      ),
    ).toContain("COT-2025-0001");
  });

  it("dice de dónde vino sin prometer que sea la primera de la cadena", () => {
    // El salto es **uno**: la de arriba puede a su vez haber nacido
    // duplicando, y eso se ve abriéndola. Decir «la original» acá sería
    // afirmar algo que esta pantalla no leyó.
    const texto = textoDeProcedencia(
      cotizacion({ id: ID_DEL_ORIGEN, codigo: "COT-2025-0001" }),
    );

    expect(texto.toLowerCase()).not.toContain("original");
    expect(texto.toLowerCase()).not.toContain("primera");
  });

  it("si no se pudo leer la de arriba, lo dice en vez de inventarla", () => {
    // La fila existe siempre —la llave foránea y el disparador de tenencia
    // de `0004` lo garantizan—, así que un hueco acá es una lectura que
    // falló y no una cotización huérfana. Decirlo es lo que distingue un
    // fallo de red de un dato ausente.
    const texto = textoDeProcedencia(null);

    expect(texto).toContain("duplicando");
    expect(texto).toContain("no se pudo leer");
  });
});

// ---------------------------------------------------------------------------
// El 409 de ganar o perder algo que no está emitido
// ---------------------------------------------------------------------------

describe("textoDeProblema, sobre `cotizacion_no_es_emitida`", () => {
  const CONFLICTO = {
    estado: "conflicto",
    motivo: "cotizacion_no_es_emitida",
    bloqueo: null,
    duplicado: null,
  } as const;

  it("tiene su propia frase y no cae en el texto de reserva", () => {
    const texto = textoDeProblema(CONFLICTO, "esa cotización");

    // Se afirma **algo del texto nuevo** y no sólo la ausencia de «borrar»:
    // un `not.toContain` a secas lo pasa cualquier reserva que no use esa
    // palabra, así que no demostraría que la entrada se esté usando.
    expect(texto).toContain("no está emitida");
    expect(texto).toContain("volver a cargar");

    // El texto de reserva habla de un borrado con dependientes: ante este
    // 409 diría «no se pudo borrar», que es un borrado que nadie pidió. Es
    // el mismo defecto que ya apareció dos veces en esta tajada.
    expect(texto.toLowerCase()).not.toContain("no se pudo borrar");
  });

  it("distingue las dos formas de no estar emitida", () => {
    // Un borrador todavía no salió; una ganada o una perdida ya cerraron.
    // Son dos cosas distintas y la frase no puede confundirlas.
    const texto = textoDeProblema(CONFLICTO, "esa cotización");

    expect(texto).toContain("todavía no se mandó");
    expect(texto).toContain("ya cerraron");
  });
});

/* ==========================================================================
   T-15 · En qué quedó esta cotización, corregido por T-13

   La pregunta que sostiene el bloque es la de tres meses después: «esta
   cotización, ¿en qué quedó?». Se contesta leyendo el listado de procesos
   cada vez que el detalle se dibuja, y este texto es lo que encabeza esa
   lista.

   **Lo que T-13 corrigió es el porqué del cero.** T-15 lo explicaba
   —«ninguna de sus líneas lleva tipo de proceso»— y era cierto mientras
   ganar abriera los procesos solo. Ahora ganar no abre nada, así que una
   ganada con cinco líneas de trámite también muestra cero hasta que
   alguien confirme la propuesta, y la explicación vieja mandaría a revisar
   líneas que no tienen nada malo.

   El cero **se sigue diciendo**, y por el mismo motivo de siempre: «no
   abrió ninguno» y «no sé cuántos abrió» se ven igual si el bloque
   desaparece, y la primera es información mientras la segunda es un hueco.
   ========================================================================== */

const PROCESO_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

function unProceso(ajustes: Partial<Proceso> = {}): Proceso {
  return {
    id: PROCESO_ID,
    clienteId: CLIENTE_ID,
    clienteNombre: "Carlos Pérez",
    tipoProcesoId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    tipoProcesoNombre: "Visa de trabajo",
    areaNombre: "Migración y naturalización",
    origen: "cotizacion",
    titulo: "Visa de trabajo de Carlos Pérez",
    estado: "abierto",
    responsableId: null,
    responsableNombre: null,
    abiertoEn: "2026-10-22T14:03:00.000Z",
    cerradoEn: null,
    etapasCumplidas: 0,
    etapasTotales: 3,
    etapaVigente: "Recepción de documentos",
    cotizacionDeOrigen: { id: ID, codigo: "COT-2026-0007" },
    ...ajustes,
  };
}

describe("qué abrió una cotización ganada", () => {
  it("dice cuántos procesos abrió, en plural", () => {
    expect(
      textoDeProcesosAbiertos([
        unProceso(),
        unProceso({ id: "otro", titulo: "Permiso de residencia" }),
      ]),
    ).toBe("Esta cotización está ganada y abrió 2 procesos:");
  });

  it("y en singular cuando abrió uno solo", () => {
    // El singular es el caso corriente —la mayoría de las cotizaciones
    // llevan una sola línea con trámite— y «1 procesos» es exactamente la
    // clase de detalle que delata una pantalla sin terminar.
    expect(textoDeProcesosAbiertos([unProceso()])).toBe(
      "Esta cotización está ganada y abrió 1 proceso:",
    );
  });

  it("dice el cero en vez de callarse", () => {
    expect(textoDeProcesosAbiertos([])).toBe(
      "Esta cotización está ganada y todavía no abrió ningún proceso.",
    );
  });

  it("y el cero ya no culpa a las líneas, que es lo que T-13 corrigió", () => {
    // La frase de T-15 explicaba el cero con «ninguna de sus líneas lleva
    // tipo de proceso». Desde que ganar no abre nada, eso es falso de una
    // ganada con trámites de sobra: el cero quiere decir que todavía nadie
    // confirmó la propuesta. Esta aserción es la que mata la frase vieja
    // si alguien la devuelve.
    expect(textoDeProcesosAbiertos([])).not.toContain("líneas");
    // Y «todavía» es la palabra que hace la diferencia: sin ella, el cero
    // se lee como definitivo y el panel de abajo no tendría sentido.
    expect(textoDeProcesosAbiertos([])).toContain("todavía");
  });

  it("la lectura que no salió no se confunde con el cero", () => {
    // Las dos frases tienen que ser distinguibles **sin mirar el código**:
    // «no abrió ninguno» es un hecho del negocio y «no se pudo leer» es un
    // fallo de red, y confundirlos manda a alguien a buscar procesos que
    // sí existen.
    expect(textoDeProcesosAbiertos(null)).toBe(
      "Esta cotización está ganada. Los procesos que abrió no se pudieron" +
        " leer ahora.",
    );
    expect(textoDeProcesosAbiertos(null)).not.toBe(
      textoDeProcesosAbiertos([]),
    );
  });
});

/* ==========================================================================
   T-13 B · La propuesta de procesos

   La derivación que el servidor dejó de hacer y que vive acá desde T-13:
   qué procesos sugieren las líneas de una cotización ganada. Es pura y se
   prueba como pura; que el panel la dibuje es de `e2e/cotizaciones.spec.ts`.

   Las líneas de prueba se escriben **a mano** y los valores esperados
   también: ninguno sale de `propuestaDeProcesos` ni de ninguna función del
   Worker. Es la restricción 6 de la tajada, y acá importa especialmente
   porque lo que se mide es un filtro y un mapeo —las dos cosas que un eco
   contra sí mismo pasaría sin notar.
   ========================================================================== */

const TRAMITE_VISA = "5e2a0d11-1111-4111-8111-000000000001";
const TRAMITE_SOCIEDAD = "5e2a0d11-2222-4222-8222-000000000002";

function linea(ajustes: Partial<LineaDeCotizacion> = {}): LineaDeCotizacion {
  return {
    id: "8b1f0c11-1111-4111-8111-000000000001",
    clase: "honorario",
    concepto: "Gestión de la visa de trabajo",
    monto: 150_000,
    tipoProcesoId: TRAMITE_VISA,
    tipoProcesoNombre: "Visa de trabajo",
    // De dónde salió el precio no cambia qué procesos propone una cotización
    // ganada, que es lo que este archivo mide: el doble lo lleva en nulo
    // porque el contrato lo exige, y ninguna prueba de acá lo mira.
    arancelRenglonId: null,
    arancelConcepto: null,
    orden: 0,
    ...ajustes,
  };
}

describe("qué procesos propone una cotización ganada", () => {
  it("siembra una propuesta por cada línea con trámite", () => {
    expect(
      propuestaDeProcesos([
        linea(),
        linea({
          id: "8b1f0c11-2222-4222-8222-000000000002",
          concepto: "Constitución de la sociedad anónima",
          tipoProcesoId: TRAMITE_SOCIEDAD,
          tipoProcesoNombre: "Sociedad anónima",
          orden: 1,
        }),
      ]),
    ).toEqual([
      {
        clave: "8b1f0c11-1111-4111-8111-000000000001",
        tipoProcesoId: TRAMITE_VISA,
        titulo: "Gestión de la visa de trabajo",
        responsableId: "",
      },
      {
        clave: "8b1f0c11-2222-4222-8222-000000000002",
        tipoProcesoId: TRAMITE_SOCIEDAD,
        titulo: "Constitución de la sociedad anónima",
        responsableId: "",
      },
    ]);
  });

  it("deja afuera las líneas sin trámite, que son el caso corriente", () => {
    // Una consulta y un timbre son cobros que no abren expediente, y `0004`
    // los declaró el caso corriente al hacer la columna nullable. El
    // contrapeso es la línea con trámite en el medio: con las tres sin
    // trámite, una función que devolviera siempre vacío pasaría igual.
    const filas = propuestaDeProcesos([
      linea({
        id: "sin-tramite-1",
        concepto: "Consulta inicial",
        tipoProcesoId: null,
        tipoProcesoNombre: null,
        orden: 0,
      }),
      linea({ id: "con-tramite", orden: 1 }),
      linea({
        id: "sin-tramite-2",
        clase: "gasto_estimado",
        concepto: "Timbres fiscales",
        tipoProcesoId: null,
        tipoProcesoNombre: null,
        orden: 2,
      }),
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0].clave).toBe("con-tramite");
  });

  it("una cotización sin ninguna línea de trámite no propone nada", () => {
    // Y eso **no es un error**: es el caso de `COT-2026-0007`, nueve líneas
    // y ningún trámite porque el catálogo no tenía «divorcio». El panel
    // sigue ofreciendo agregar uno a mano, que es lo que T-13 vino a
    // arreglar.
    expect(
      propuestaDeProcesos([
        linea({ tipoProcesoId: null, tipoProcesoNombre: null }),
      ]),
    ).toEqual([]);
  });

  it("el título es el concepto de la línea y no el nombre del tipo", () => {
    // Es la decisión: el concepto es el texto que el abogado ya escribió
    // para nombrar ese trabajo de cara al cliente. Con el nombre del tipo,
    // cinco visas del mismo tipo se llamarían igual — y además habría dos
    // nombres para una cosa.
    const [fila] = propuestaDeProcesos([
      linea({
        concepto: "Visa de trabajo de Carlos Pérez",
        tipoProcesoNombre: "Visa de trabajo",
      }),
    ]);

    expect(fila.titulo).toBe("Visa de trabajo de Carlos Pérez");
    expect(fila.titulo).not.toBe("Visa de trabajo");
  });

  it("conserva el orden de la lista que recibe", () => {
    // El orden de la cotización, que es el que `GET /lineas` sirve. Las
    // líneas van con los conceptos al revés del alfabeto para que un
    // `sort` escondido se note.
    expect(
      propuestaDeProcesos([
        linea({ id: "c", concepto: "Zeta", orden: 0 }),
        linea({ id: "b", concepto: "Eme", orden: 1 }),
        linea({ id: "a", concepto: "Alfa", orden: 2 }),
      ]).map((fila) => fila.titulo),
    ).toEqual(["Zeta", "Eme", "Alfa"]);
  });

  it("no toca la lista que recibe, que puede ser estado de React", () => {
    const lineas = [linea(), linea({ id: "otra", tipoProcesoId: null })];
    const copia = structuredClone(lineas);

    propuestaDeProcesos(lineas);

    expect(lineas).toEqual(copia);
  });

  it("la fila en blanco nace vacía y con la clave que le dan", () => {
    expect(propuestaVacia("nueva-0")).toEqual({
      clave: "nueva-0",
      tipoProcesoId: "",
      titulo: "",
      responsableId: "",
    });
  });
});

describe("lo que la propuesta tiene que cumplir antes de mandarse", () => {
  it("la lista vacía se rechaza: no nacería nada", () => {
    expect(validarPropuesta([])).toEqual([
      { campo: "procesos", motivo: "sin_procesos_que_abrir" },
    ]);
  });

  it("una propuesta sembrada entera pasa sin fallas", () => {
    // El contrapeso de todo el bloque: si esto fallara, las pruebas de
    // rechazo de abajo pasarían por el motivo equivocado.
    expect(validarPropuesta(propuestaDeProcesos([linea()]))).toEqual([]);
  });

  it("marca la fila sin tipo y la fila sin título, con su posición", () => {
    // La posición delante del campo, con la misma forma que usa la
    // respuesta del servidor: con tres filas en pantalla, «falta el
    // título» sin decir en cuál obliga a mirarlas una por una.
    expect(
      validarPropuesta([
        { clave: "a", tipoProcesoId: TRAMITE_VISA, titulo: "Bien", responsableId: "" },
        { clave: "b", tipoProcesoId: "", titulo: "Sin tipo", responsableId: "" },
        { clave: "c", tipoProcesoId: TRAMITE_VISA, titulo: "   ", responsableId: "" },
      ]),
    ).toEqual([
      { campo: "proceso-1.tipoProcesoId", motivo: "tipo_proceso_requerido" },
      { campo: "proceso-2.titulo", motivo: "titulo_requerido" },
    ]);
  });

  it("no inventa fallas sobre lo que no puede saber", () => {
    // Que el tipo sea de este bufete o que el responsable exista no se
    // puede decidir en la pantalla, y no se intenta: una validación que
    // adivinara eso sería la que un día contradice al servidor.
    expect(
      validarPropuesta([
        {
          clave: "a",
          tipoProcesoId: "un-tipo-que-esta-pantalla-no-puede-verificar",
          titulo: "Algo",
          responsableId: "alguien-que-esta-pantalla-no-puede-verificar",
        },
      ]),
    ).toEqual([]);
  });
});

describe("de las filas de la pantalla al cuerpo de la petición", () => {
  it("la cadena vacía del desplegable se vuelve el nulo del contrato", () => {
    expect(
      aAperturaDeProcesos([
        { clave: "a", tipoProcesoId: TRAMITE_VISA, titulo: "Con nadie", responsableId: "" },
        {
          clave: "b",
          tipoProcesoId: TRAMITE_VISA,
          titulo: "Con alguien",
          responsableId: "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90",
        },
      ]),
    ).toEqual([
      { tipoProcesoId: TRAMITE_VISA, titulo: "Con nadie", responsableId: null },
      {
        tipoProcesoId: TRAMITE_VISA,
        titulo: "Con alguien",
        responsableId: "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90",
      },
    ]);
  });

  it("recorta el título y deja la clave afuera", () => {
    // La clave es identidad de pantalla y no hay columna donde ponerla; un
    // título con espacios al final no es un título distinto, y guardar los
    // dos dejaría dos procesos que se ven iguales en el listado.
    expect(
      aAperturaDeProcesos([
        {
          clave: "nueva-3",
          tipoProcesoId: `  ${TRAMITE_VISA}  `,
          titulo: "  Constitución de la sociedad  ",
          responsableId: "  ",
        },
      ]),
    ).toEqual([
      {
        tipoProcesoId: TRAMITE_VISA,
        titulo: "Constitución de la sociedad",
        responsableId: null,
      },
    ]);
  });
});

describe("lo que el panel de apertura dice", () => {
  it("sobre la ganada que todavía no abrió ninguno, propone y dice qué hacer", () => {
    const texto = textoDeAperturaDeProcesos(false);

    // Las tres cosas que la frase tiene que decir, y ninguna es decorativa:
    // que todavía no existe nada, que se puede editar, y cómo se fusionan
    // dos en uno — que es el ejemplo de la sociedad anónima del usuario.
    expect(texto).toContain("Todavía no existe ninguno");
    expect(texto).toContain("se agrega el que falte");
    expect(texto).toContain("fusionan");
  });

  it("y nombra el paso extra, que es la otra mitad del ejemplo", () => {
    // «Un proceso con un paso extra» ya se puede armar: los pasos de un
    // proceso son editables. Sin esta frase, quien mira la propuesta ve dos
    // filas y cree que fusionarlas pierde un paso.
    expect(textoDeAperturaDeProcesos(false)).toContain("editable");
  });

  it("sobre la ganada que ya abrió, no propone: ofrece abrir otro", () => {
    const texto = textoDeAperturaDeProcesos(true);

    expect(texto).toContain("ya abrió los suyos");
    expect(texto).toContain("abrir uno más");
  });

  it("las dos frases no se pueden confundir", () => {
    // Si fueran la misma, el panel diría «estos son los que sugieren las
    // líneas» sobre una cotización que ya los abrió, que es exactamente el
    // ruido que invita a abrir dos veces lo mismo.
    expect(textoDeAperturaDeProcesos(true)).not.toBe(
      textoDeAperturaDeProcesos(false),
    );
  });

  it("el aviso de las líneas no leídas no se confunde con no tener trámites", () => {
    // Es el mismo criterio que separa el cero del fallo de red más arriba:
    // una propuesta vacía porque la cotización no tiene trámites y una
    // vacía porque no se leyó nada se ven igual, y la primera es
    // información mientras la segunda es un hueco.
    expect(AVISO_DE_LINEAS_NO_LEIDAS).toContain("no se pudieron leer");
    // Y dice que el panel sigue sirviendo, en vez de dejar a alguien
    // mirando un control que parece roto.
    expect(AVISO_DE_LINEAS_NO_LEIDAS).toContain("a mano");
  });
});
