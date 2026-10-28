/**
 * La lógica del tablero de Inicio (`odd/tasks/inicio-tablero.md`, T-2), sin
 * React y sin DOM.
 *
 * Misma frontera que el resto de las pantallas: lo que se puede probar como
 * función vive en un `.ts` y corre en este runner; el `.tsx` es el dibujo.
 */
import { describe, expect, it } from "vitest";

import type {
  CotizacionDelInicio,
  PendienteDelInicio,
} from "../worker/contract";
import {
  ESTADOS,
  agruparPendientes,
  enlaceDeCotizacion,
  enlaceDePendiente,
  etiquetaDeEstado,
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
    expect(mesLargo("2026-10")).toBe("octubre de 2026");
    expect(mesLargo("2026-01")).toBe("enero de 2026");
  });
});
