/**
 * La lógica de los pendientes del lado del navegador (T-9), sin React y sin
 * DOM.
 *
 * Misma frontera que T-5, T-6, T-7 y T-8: lo que se puede probar como
 * función se escribe como función y vive en un `.ts`, para que corra en este
 * runner en vez de exigir un navegador para comparar cadenas. Lo que queda
 * en el `.tsx` es el dibujo.
 *
 * **Ésta es la segunda copia de las reglas del pendiente**, declarada como
 * tal. La que manda vive en `worker/pendientes/dominio.ts` y en su
 * repositorio; ésta avisa antes de mandar. Cada copia tiene sus propias
 * pruebas, para que aflojar una mate las suyas y no las de la otra.
 *
 * Acá vive además lo que hace que el pendiente **no se calle**: el resumen
 * contado de la cabecera y la marca de vencido. Las dos son funciones puras
 * a propósito, porque son la parte que tiene que ser imposible de romper en
 * silencio.
 */
import { describe, expect, it } from "vitest";

import { diaLegible } from "../src/formatos";
import type {
  EtapaDeProceso,
  PendienteDeProceso,
  Usuario,
} from "../worker/contract";
import {
  AVISO_PENDIENTE_NO_SE_REABRE,
  BORRADOR_DE_PENDIENTE_VACIO,
  aPeticionDePendiente,
  estaVencido,
  firmaDeAutor,
  firmaDeCierre,
  firmaDeResponsable,
  hoyEnPanama,
  responsablesSeleccionables,
  resumenDePendientes,
  separarPendientes,
  validarPendiente,
} from "../src/pantallas/procesos/pendientes";

const MOMENTO = "2026-10-20T14:30:00.000Z";

const NOMBRES = [
  "Recepción y revisión de documentos",
  "Presentación ante el Servicio Nacional de Migración",
  "Entrevista y verificación domiciliaria",
  "Resolución y entrega del carné",
] as const;

const ITZEL: Usuario = {
  id: "u-itzel",
  nombre: "Itzel",
  email: "itzel@bufete.test",
  activo: true,
};
const RICARDO: Usuario = {
  id: "u-ricardo",
  nombre: "Ricardo",
  email: "ricardo@bufete.test",
  activo: true,
};
const RETIRADA: Usuario = {
  id: "u-retirada",
  nombre: "Pasante que ya no está",
  email: "pasante@bufete.test",
  activo: false,
};

const EQUIPO = [ITZEL, RICARDO, RETIRADA] as const;

function plan(cumplidas: number): EtapaDeProceso[] {
  return NOMBRES.map((nombre, orden) => ({
    id: `e${String(orden)}`,
    nombre,
    orden,
    alcanzadaEn: orden < cumplidas ? MOMENTO : null,
  }));
}

function pendiente(
  parcial: Partial<PendienteDeProceso> = {},
): PendienteDeProceso {
  return {
    id: "p1",
    procesoEtapaId: "e0",
    procesoEtapaNombre: NOMBRES[0],
    texto: "Falta el certificado de matrimonio apostillado.",
    autorId: ITZEL.id,
    autorNombre: ITZEL.nombre,
    responsableId: null,
    responsableNombre: null,
    creadoEn: MOMENTO,
    venceEn: null,
    cerradoEn: null,
    cerradoPor: null,
    cerradoPorNombre: null,
    ...parcial,
  };
}

describe("el día de hoy en Panamá", () => {
  it("usa la hora de Panamá y no la de UTC", () => {
    // Panamá es UTC−5 todo el año, sin horario de verano. A las 2 de la
    // mañana UTC del 23 todavía es 21 del 22 en Panamá, y un pendiente que
    // vence el 22 no puede aparecer vencido esa noche.
    expect(hoyEnPanama(new Date("2026-10-23T02:00:00.000Z"))).toBe(
      "2026-10-22",
    );
  });

  it("cambia de día a la medianoche de Panamá, no antes", () => {
    expect(hoyEnPanama(new Date("2026-10-23T04:59:59.999Z"))).toBe(
      "2026-10-22",
    );
    expect(hoyEnPanama(new Date("2026-10-23T05:00:00.000Z"))).toBe(
      "2026-10-23",
    );
  });
});

describe("un pendiente vencido", () => {
  const hoy = "2026-10-22";

  it("lo está cuando su fecha ya pasó", () => {
    expect(estaVencido(pendiente({ venceEn: "2026-10-21" }), hoy)).toBe(true);
  });

  it("NO lo está el mismo día en que vence", () => {
    // Vencer «el 22» quiere decir que el 22 todavía se puede hacer.
    expect(estaVencido(pendiente({ venceEn: hoy }), hoy)).toBe(false);
  });

  it("no lo está si vence más adelante, ni si no vence nunca", () => {
    expect(estaVencido(pendiente({ venceEn: "2026-10-23" }), hoy)).toBe(false);
    expect(estaVencido(pendiente({ venceEn: null }), hoy)).toBe(false);
  });

  it("un pendiente CERRADO nunca está vencido, por vieja que sea la fecha", () => {
    // Lo cerrado ya no se persigue: marcarlo en rojo sería ruido sobre algo
    // que no hay que hacer.
    expect(
      estaVencido(
        pendiente({
          venceEn: "2020-01-01",
          cerradoEn: MOMENTO,
          cerradoPor: ITZEL.id,
        }),
        hoy,
      ),
    ).toBe(false);
  });
});

describe("el resumen contado de la cabecera", () => {
  const hoy = "2026-10-22";

  it("dice que no hay nada cuando no hay nada", () => {
    expect(resumenDePendientes([], hoy)).toBe(
      "No hay ningún pendiente abierto en este proceso.",
    );
  });

  it("cuenta uno en singular", () => {
    expect(resumenDePendientes([pendiente()], hoy)).toBe(
      "1 pendiente abierto.",
    );
  });

  it("cuenta varios", () => {
    expect(
      resumenDePendientes([pendiente(), pendiente({ id: "p2" })], hoy),
    ).toBe("2 pendientes abiertos.");
  });

  it("separa los vencidos, que es el número que obliga a mirar", () => {
    expect(
      resumenDePendientes(
        [
          pendiente({ venceEn: "2026-10-01" }),
          pendiente({ id: "p2", venceEn: "2026-12-01" }),
          pendiente({ id: "p3" }),
        ],
        hoy,
      ),
    ).toBe("3 pendientes abiertos, 1 vencido.");
  });

  it("pone los vencidos en plural cuando son varios", () => {
    expect(
      resumenDePendientes(
        [
          pendiente({ venceEn: "2026-10-01" }),
          pendiente({ id: "p2", venceEn: "2026-10-02" }),
        ],
        hoy,
      ),
    ).toBe("2 pendientes abiertos, 2 vencidos.");
  });
});

describe("abiertos y cerrados se separan", () => {
  it("el abierto va a su lista y el cerrado a la suya", () => {
    const abierto = pendiente({ id: "abierto" });
    const cerrado = pendiente({
      id: "cerrado",
      cerradoEn: MOMENTO,
      cerradoPor: ITZEL.id,
      cerradoPorNombre: ITZEL.nombre,
    });

    expect(separarPendientes([abierto, cerrado])).toEqual({
      abiertos: [abierto],
      cerrados: [cerrado],
    });
  });

  it("una lista vacía da dos listas vacías y no explota", () => {
    expect(separarPendientes([])).toEqual({ abiertos: [], cerrados: [] });
  });
});

describe("el autor y el responsable se dicen distinto", () => {
  it("el autor es quien lo anotó", () => {
    expect(firmaDeAutor(pendiente())).toBe("Anotado por Itzel");
  });

  it("el responsable es quien lo tiene que resolver", () => {
    expect(
      firmaDeResponsable(
        pendiente({
          responsableId: RICARDO.id,
          responsableNombre: RICARDO.nombre,
        }),
      ),
    ).toBe("Responsable: Ricardo");
  });

  it("un pendiente sin responsable lo DICE, no lo deja en blanco", () => {
    // Un cabo suelto que nadie tiene asignado es exactamente el que se
    // pierde. Un espacio vacío en la pantalla no se ve; esta frase sí.
    expect(firmaDeResponsable(pendiente())).toBe(
      "Sin responsable asignado",
    );
  });

  it("nombra a quien ya no está en vez de dejar el hueco", () => {
    expect(firmaDeAutor(pendiente({ autorNombre: null }))).toBe(
      "Anotado por —",
    );
  });

  it("el cierre tiene su propia firma, y no la hay si sigue abierto", () => {
    expect(firmaDeCierre(pendiente())).toBeNull();
    expect(
      firmaDeCierre(
        pendiente({
          cerradoEn: MOMENTO,
          cerradoPor: RICARDO.id,
          cerradoPorNombre: RICARDO.nombre,
        }),
      ),
    ).toBe("Cerrado por Ricardo");
  });
});

describe("la validación del navegador avisa antes de mandar", () => {
  const etapas = plan(1);

  it("acepta un pendiente con texto sobre un proceso con plan", () => {
    expect(
      validarPendiente(
        { ...BORRADOR_DE_PENDIENTE_VACIO, texto: "Falta el apostillado" },
        etapas,
        EQUIPO,
      ),
    ).toEqual([]);
  });

  it("rechaza un pendiente vacío", () => {
    expect(
      validarPendiente(BORRADOR_DE_PENDIENTE_VACIO, etapas, EQUIPO),
    ).toEqual([{ campo: "texto", motivo: "texto_requerido" }]);
  });

  it("rechaza un pendiente en blanco", () => {
    expect(
      validarPendiente(
        { ...BORRADOR_DE_PENDIENTE_VACIO, texto: "  \n\t " },
        etapas,
        EQUIPO,
      ),
    ).toEqual([{ campo: "texto", motivo: "texto_requerido" }]);
  });

  it("rechaza anotar en un proceso sin plan", () => {
    // `pendiente.proceso_etapa_id` es `NOT NULL`: no hay de dónde colgarlo.
    expect(
      validarPendiente(
        { ...BORRADOR_DE_PENDIENTE_VACIO, texto: "Algo" },
        [],
        EQUIPO,
      ),
    ).toEqual([{ campo: "procesoEtapaId", motivo: "proceso_sin_etapas" }]);
  });

  it("rechaza un responsable que no está en el equipo", () => {
    expect(
      validarPendiente(
        { texto: "Algo", responsableId: "el-del-vecino", venceEn: "" },
        etapas,
        EQUIPO,
      ),
    ).toEqual([
      { campo: "responsableId", motivo: "responsable_desconocido" },
    ]);
  });

  it("acepta como responsable a alguien que ya no está activo", () => {
    // Lo válido y lo seleccionable son cosas distintas (T-5). Si el
    // formulario ya lo tenía elegido, no se lo invalida por sorpresa.
    expect(
      validarPendiente(
        { texto: "Algo", responsableId: RETIRADA.id, venceEn: "" },
        etapas,
        EQUIPO,
      ),
    ).toEqual([]);
  });

  it.each(["mañana", "2026-13-01", "2026-02-31", "31/12/2026", "2026-1-5"])(
    "rechaza «%s» como vencimiento",
    (venceEn) => {
      expect(
        validarPendiente({ texto: "Algo", responsableId: "", venceEn }, etapas, EQUIPO),
      ).toEqual([{ campo: "venceEn", motivo: "vencimiento_invalido" }]);
    },
  );

  it("acepta un 29 de febrero que existe de verdad", () => {
    expect(
      validarPendiente(
        { texto: "Algo", responsableId: "", venceEn: "2028-02-29" },
        etapas,
        EQUIPO,
      ),
    ).toEqual([]);
  });
});

describe("lo que se manda al servidor", () => {
  it("recorta el texto y deja en nulo lo que nadie llenó", () => {
    expect(
      aPeticionDePendiente({
        texto: "  Falta el apostillado.  ",
        responsableId: "",
        venceEn: "",
      }),
    ).toEqual({
      texto: "Falta el apostillado.",
      responsableId: null,
      venceEn: null,
    });
  });

  it("manda el responsable y el vencimiento cuando se eligieron", () => {
    expect(
      aPeticionDePendiente({
        texto: "Falta el apostillado.",
        responsableId: RICARDO.id,
        venceEn: "2026-11-30",
      }),
    ).toEqual({
      texto: "Falta el apostillado.",
      responsableId: RICARDO.id,
      venceEn: "2026-11-30",
    });
  });

  it("no manda ni autor ni momento ni etapa: los pone el servidor", () => {
    const peticion = aPeticionDePendiente({
      texto: "Algo",
      responsableId: "",
      venceEn: "",
    });

    expect(Object.keys(peticion).sort()).toEqual([
      "responsableId",
      "texto",
      "venceEn",
    ]);
  });

  it("conserva los saltos de línea de adentro", () => {
    const texto = "Falta:\n- el apostillado\n- la traducción";
    expect(
      aPeticionDePendiente({ texto, responsableId: "", venceEn: "" }).texto,
    ).toBe(texto);
  });
});

describe("el aviso de que un pendiente cerrado no se reabre", () => {
  it("dice la prohibición y, sobre todo, la salida", () => {
    // Está en una constante exportada y no enterrado en el `.tsx` para que
    // su contenido se pueda afirmar acá, igual que el aviso de T-8. Decir
    // solo «no se reabre» dejaría a alguien sin saber qué hacer cuando
    // resulta que el documento que faltaba era otro.
    expect(AVISO_PENDIENTE_NO_SE_REABRE).toMatch(/no se reabre/i);
    expect(AVISO_PENDIENTE_NO_SE_REABRE).toMatch(/pendiente nuevo/i);
  });
});

describe("una fecha de vencimiento se lee sin corrimiento de un día", () => {
  it("el 30 de noviembre se lee como 30, no como 29", () => {
    // `new Date("2026-11-30")` es medianoche UTC, que en Panamá es el 29 a
    // las 7 de la tarde. Formatearla con el huso local corre la fecha un
    // día hacia atrás, y un vencimiento mal dicho es peor que ninguno.
    //
    // Esta prueba vigila el **corrimiento de día**, y nada más: `toContain`
    // se cumple igual con `11/30/2026` que con `30 nov 2026`, así que no vio
    // el defecto de orden que T-18 encontró. El orden de los campos tiene su
    // propia prueba, contra cadenas literales, en `test/formatos.spec.ts`.
    const legible = diaLegible("2026-11-30");

    expect(legible).toContain("30");
    expect(legible).toContain("2026");
    expect(legible).not.toContain("29");
  });

  it("una fecha que no se entiende no inventa nada", () => {
    expect(diaLegible("mañana")).toBe("—");
  });
});

describe("el desplegable de responsable", () => {
  it("ofrece al equipo activo, ordenado con las reglas del español", () => {
    expect(
      responsablesSeleccionables(EQUIPO, "").map((p) => p.nombre),
    ).toEqual(["Itzel", "Ricardo"]);
  });

  it("NO ofrece a quien ya no está", () => {
    expect(
      responsablesSeleccionables(EQUIPO, "").some(
        (p) => p.id === RETIRADA.id,
      ),
    ).toBe(false);
  });

  it("salvo que ya esté elegido: si no, el campo se vaciaría solo", () => {
    // Lo válido y lo seleccionable son cosas distintas (T-5). Un pendiente
    // viejo tiene como responsable a alguien que se fue, y el formulario no
    // puede perder el dato por dibujarse.
    expect(
      responsablesSeleccionables(EQUIPO, RETIRADA.id).map((p) => p.nombre),
    ).toEqual(["Itzel", RETIRADA.nombre, "Ricardo"]);
  });
});
