/**
 * La lógica del tablero de Inicio (`odd/tasks/inicio-tablero.md`, T-2), sin
 * React y sin DOM.
 *
 * Misma frontera que el resto de las pantallas: lo que se puede probar como
 * función vive en un `.ts` y corre en este runner; el `.tsx` es el dibujo.
 * Incluida **la geometría de los gráficos**: dónde cae cada barra y qué
 * altura tiene es aritmética, y es justo la que se rompe sin que nadie lo
 * vea hasta que un mes con cero dibuja una barra negativa.
 */
import { describe, expect, it } from "vitest";

import type {
  CotizacionDelInicio,
  MesDelInicio,
  PendienteDelInicio,
} from "../worker/contract";
import {
  ESTADOS,
  agruparPendientes,
  barrasDeLaSerie,
  barrasDeLaDistribucion,
  descripcionDeLaDistribucion,
  descripcionDeLaSerie,
  enlaceDeCotizacion,
  enlaceDePendiente,
  etiquetaDeEstado,
  marcasDelEje,
  mesCorto,
  mesLargo,
  tasaLegible,
  vencimientoDeCotizacion,
} from "../src/pantallas/inicio/presentacion";

const HOY = "2026-10-27";

function pendiente(texto: string, venceEn: string | null): PendienteDelInicio {
  return {
    id: texto,
    texto,
    venceEn,
    procesoId: "proceso-1",
    procesoTitulo: "Residencia de Marta Quintero",
    clienteNombre: "Marta Quintero",
  };
}

function cotizacion(
  estado: CotizacionDelInicio["estado"],
  venceEn: string | null,
): CotizacionDelInicio {
  return {
    id: "c1",
    codigo: "COT-2026-0001",
    clienteNombre: "Marta Quintero",
    estado,
    venceEn,
  };
}

function mes(
  clave: string,
  cuenta: Partial<Omit<MesDelInicio, "mes">> = {},
): MesDelInicio {
  return { mes: clave, borrador: 0, emitida: 0, ganada: 0, perdida: 0, ...cuenta };
}

describe("los pendientes se agrupan contra hoy, sin callarse ninguno", () => {
  it("vencidos, hoy, los próximos siete días y lo que queda después", () => {
    const grupos = agruparPendientes(
      [
        pendiente("ayer", "2026-10-26"),
        pendiente("hoy", HOY),
        pendiente("mañana", "2026-10-28"),
        pendiente("en siete", "2026-11-03"),
        pendiente("en ocho", "2026-11-04"),
        pendiente("sin fecha", null),
      ],
      HOY,
    );

    expect(grupos.map((g) => [g.clave, g.pendientes.map((p) => p.texto)])).toEqual([
      ["vencidos", ["ayer"]],
      ["hoy", ["hoy"]],
      ["proximos", ["mañana", "en siete"]],
      ["despues", ["en ocho", "sin fecha"]],
    ]);
    expect(grupos.map((g) => g.titulo)).toEqual([
      "Vencidos",
      "Vencen hoy",
      "Próximos 7 días",
      "Más adelante o sin fecha",
    ]);
  });

  it("un grupo vacío no se dibuja", () => {
    const grupos = agruparPendientes([pendiente("hoy", HOY)], HOY);
    expect(grupos.map((g) => g.clave)).toEqual(["hoy"]);
  });

  it("cada pendiente lleva a la pestaña de pendientes de su proceso", () => {
    expect(enlaceDePendiente(pendiente("x", null))).toBe(
      "/procesos/proceso-1/pendientes",
    );
  });
});

describe("las cotizaciones por atender dicen por qué", () => {
  it("una emitida vencida, una que vence hoy y una que vence pronto", () => {
    expect(vencimientoDeCotizacion(cotizacion("emitida", "2026-10-24"), HOY)).toMatch(
      /^Venció el /,
    );
    expect(vencimientoDeCotizacion(cotizacion("emitida", HOY), HOY)).toBe(
      "Vence hoy",
    );
    expect(vencimientoDeCotizacion(cotizacion("emitida", "2026-10-30"), HOY)).toMatch(
      /^Vence el /,
    );
  });

  it("un borrador sin vencimiento dice que falta emitirlo", () => {
    expect(vencimientoDeCotizacion(cotizacion("borrador", null), HOY)).toBe(
      "Sin emitir",
    );
  });

  it("lleva a la cotización", () => {
    expect(enlaceDeCotizacion(cotizacion("borrador", null))).toBe(
      "/cotizaciones/c1",
    );
  });
});

describe("los estados y la tasa", () => {
  it("los cuatro estados, en el orden del ciclo de vida, con las etiquetas de cotizaciones", () => {
    expect(ESTADOS).toEqual(["borrador", "emitida", "ganada", "perdida"]);
    expect(ESTADOS.map(etiquetaDeEstado)).toEqual([
      "Borrador",
      "Emitida",
      "Ganada",
      "Perdida",
    ]);
  });

  it("la tasa se dice en por ciento entero, y nula es un guion", () => {
    expect(tasaLegible(0.5)).toBe("50 %");
    expect(tasaLegible(2 / 3)).toBe("67 %");
    expect(tasaLegible(1)).toBe("100 %");
    expect(tasaLegible(null)).toBe("—");
  });

  it("los meses se nombran en español", () => {
    expect(mesCorto("2026-10")).toBe("oct");
    expect(mesCorto("2026-01")).toBe("ene");
    expect(mesLargo("2026-10")).toBe("octubre de 2026");
  });
});

describe("el eje", () => {
  it("redondea hacia arriba a números limpios", () => {
    expect(marcasDelEje(7)).toEqual([0, 2, 4, 6, 8]);
    expect(marcasDelEje(3)).toEqual([0, 1, 2, 3]);
    expect(marcasDelEje(23)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(marcasDelEje(48)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("sin datos sigue teniendo un eje: de 0 a 1", () => {
    expect(marcasDelEje(0)).toEqual([0, 1]);
  });
});

describe("la serie de seis meses", () => {
  const serie = [
    mes("2026-05"),
    mes("2026-06"),
    mes("2026-07"),
    mes("2026-08", { borrador: 2 }),
    mes("2026-09", { emitida: 4, ganada: 1 }),
    mes("2026-10", { borrador: 3, emitida: 2, ganada: 1, perdida: 1 }),
  ];
  const lienzo = { ancho: 600, alto: 200 };

  it("cuatro barras por mes, en el orden de los estados, ninguna más gruesa que 24", () => {
    const barras = barrasDeLaSerie(serie, lienzo);
    expect(barras).toHaveLength(24);
    expect(barras.slice(20).map((b) => b.estado)).toEqual(ESTADOS);
    expect(barras.every((b) => b.ancho > 0 && b.ancho <= 24)).toBe(true);
  });

  it("la altura es proporcional al valor contra el tope del eje, y cero es cero", () => {
    const barras = barrasDeLaSerie(serie, lienzo);
    const emitidaDeSeptiembre = barras.find(
      (b) => b.mes === "2026-09" && b.estado === "emitida",
    );
    const borradorDeMayo = barras.find(
      (b) => b.mes === "2026-05" && b.estado === "borrador",
    );
    // El tope del eje para un máximo de 4 es 4: la barra llena el alto útil.
    expect(emitidaDeSeptiembre?.alto).toBeCloseTo(lienzo.alto);
    expect(emitidaDeSeptiembre?.y).toBeCloseTo(0);
    expect(borradorDeMayo?.alto).toBe(0);
    expect(borradorDeMayo?.y).toBe(lienzo.alto);
  });

  it("los meses avanzan de izquierda a derecha sin pisarse", () => {
    const barras = barrasDeLaSerie(serie, lienzo);
    for (let i = 1; i < barras.length; i += 1) {
      expect(barras[i].x).toBeGreaterThanOrEqual(barras[i - 1].x + barras[i - 1].ancho);
    }
    const ultima = barras[barras.length - 1];
    expect(ultima.x + ultima.ancho).toBeLessThanOrEqual(lienzo.ancho);
  });

  it("su descripción accesible nombra el período", () => {
    expect(descripcionDeLaSerie(serie)).toBe(
      "Cotizaciones por estado de mayo de 2026 a octubre de 2026.",
    );
  });
});

describe("la distribución de hoy", () => {
  const cuenta = { borrador: 4, emitida: 2, ganada: 1, perdida: 0 };

  it("una barra por estado, la más larga llena el ancho", () => {
    const barras = barrasDeLaDistribucion(cuenta, 300);
    expect(barras.map((b) => [b.estado, b.valor])).toEqual([
      ["borrador", 4],
      ["emitida", 2],
      ["ganada", 1],
      ["perdida", 0],
    ]);
    expect(barras[0].largo).toBe(300);
    expect(barras[1].largo).toBe(150);
    expect(barras[3].largo).toBe(0);
  });

  it("sin cotizaciones no divide por cero", () => {
    const barras = barrasDeLaDistribucion(
      { borrador: 0, emitida: 0, ganada: 0, perdida: 0 },
      300,
    );
    expect(barras.every((b) => b.largo === 0)).toBe(true);
  });

  it("su descripción accesible dice cada número", () => {
    expect(descripcionDeLaDistribucion(cuenta)).toBe(
      "Cotizaciones por estado hoy: Borrador 4, Emitida 2, Ganada 1, Perdida 0.",
    );
  });
});
