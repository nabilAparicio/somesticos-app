/**
 * El cliente que nace desde el alta de cotización, en su parte pura.
 *
 * Lo que este archivo protege es **que no haya una segunda validación**. El
 * modal del alta de cotización muestra cuatro campos de los nueve del
 * formulario completo, y la tentación obvia —escribir acá «nombre y uno de
 * los dos contactos»— produciría la peor clase de defecto: dos puertas al
 * mismo invariante que aceptan cosas distintas. La que acepta más es siempre
 * la nueva, porque la vieja ya tiene pruebas.
 *
 * Así que lo que se mide es la reutilización, no la regla: la regla ya está
 * probada en `test/clientes-ui.spec.ts` —y su copia que manda, la del Worker,
 * en `test/clientes-api.spec.ts`—. Acá se comprueba que el modal llegue a
 * `validarBorrador` y a `aPeticion` con un borrador **completo**, y que los
 * cinco campos que no muestra viajen como «todavía nadie lo sabe» y no como
 * «está vacío».
 *
 * Esa distinción es la razón de ser de `borradorDelClienteNuevo`. Un `""` en
 * `documentoNumero` es un documento que existe y está en blanco, y después
 * nada lo distingue de uno que no se preguntó: el argumento entero está en
 * `src/pantallas/clientes/formulario.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  BORRADOR_VACIO,
  aPeticion,
  validarBorrador,
} from "../src/pantallas/clientes/formulario";
import {
  CAMPOS_DEL_CLIENTE_NUEVO,
  VALORES_DEL_CLIENTE_NUEVO_VACIOS,
  borradorDelClienteNuevo,
  type ValoresDelClienteNuevo,
} from "../src/pantallas/cotizaciones/cliente-nuevo";

function valores(
  ajustes: Partial<ValoresDelClienteNuevo> = {},
): ValoresDelClienteNuevo {
  return { ...VALORES_DEL_CLIENTE_NUEVO_VACIOS, ...ajustes };
}

function motivos(fallas: readonly { motivo: string }[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

// ---------------------------------------------------------------------------
// Qué campos lleva el modal
// ---------------------------------------------------------------------------

describe("CAMPOS_DEL_CLIENTE_NUEVO", () => {
  it("lleva el nombre y los dos medios de contacto, en ese orden", () => {
    // El orden es el de la conversación telefónica, igual que en el
    // formulario completo: cómo se llama y cómo se le vuelve a hablar.
    expect(CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => campo.campo)).toEqual([
      "nombre",
      "telefono",
      "email",
    ]);
  });

  it("marca obligatorio sólo el nombre", () => {
    // Lo que hace abandonar un alta es creer que hay que averiguar algo
    // antes de guardar. Acá el único exigible es el nombre: de los contactos
    // alcanza uno, y eso lo dice la ayuda del modal, no una marca por campo.
    expect(
      CAMPOS_DEL_CLIENTE_NUEVO.filter((campo) => campo.obligatorio === true).map(
        (campo) => campo.campo,
      ),
    ).toEqual(["nombre"]);
  });

  it("no nombra ningún campo que el borrador de cliente no tenga", () => {
    // La guardia contra el error de tipeo que deja un control sin estado: un
    // campo que no es clave del borrador se dibujaría y no guardaría nada.
    for (const { campo } of CAMPOS_DEL_CLIENTE_NUEVO) {
      expect(Object.keys(BORRADOR_VACIO)).toContain(campo);
    }
  });

  it("no pide el documento, el representante ni las notas", () => {
    // El alcance de la tajada: el resto de la ficha se completa después,
    // desde la pantalla del cliente. Un campo más acá es la pantalla
    // completa metida en un modal, que es lo que esta tarea no es.
    const pedidos = CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => campo.campo);
    for (const ajeno of [
      "documentoTipo",
      "documentoNumero",
      "representanteLegal",
      "notas",
    ]) {
      expect(pedidos).not.toContain(ajeno);
    }
  });
});

// ---------------------------------------------------------------------------
// El borrador completo que sale de los cuatro valores
// ---------------------------------------------------------------------------

describe("borradorDelClienteNuevo", () => {
  it("completa con lo vacío los cinco campos que el modal no muestra", () => {
    const borrador = borradorDelClienteNuevo(
      valores({ nombre: "Carlos Pérez", telefono: "+507 6123-4567" }),
    );

    expect(borrador).toEqual({
      ...BORRADOR_VACIO,
      nombre: "Carlos Pérez",
      telefono: "+507 6123-4567",
    });
  });

  it("deja pasar los cuatro valores que sí muestra", () => {
    const borrador = borradorDelClienteNuevo(
      valores({
        nombre: "Istmo S.A.",
        telefono: "+507 200-0000",
        email: "contacto@istmo.test",
        tipoClienteId: "t1",
      }),
    );

    expect(borrador.nombre).toBe("Istmo S.A.");
    expect(borrador.telefono).toBe("+507 200-0000");
    expect(borrador.email).toBe("contacto@istmo.test");
    expect(borrador.tipoClienteId).toBe("t1");
  });
});

// ---------------------------------------------------------------------------
// La validación es la compartida, y se comprueba que lo sea
// ---------------------------------------------------------------------------

describe("la validación del modal es la del formulario completo", () => {
  it("un nombre sin ningún contacto no pasa, con el motivo que ya existía", () => {
    // `contacto_requerido` es el motivo de `validarBorrador` y tiene su
    // texto en `src/mensajes.ts` desde T-6. Un motivo nuevo inventado acá se
    // dibujaría sin texto, y eso es la señal de que alguien escribió una
    // segunda validación.
    expect(
      motivos(
        validarBorrador(borradorDelClienteNuevo(valores({ nombre: "Carlos" }))),
      ),
    ).toContain("contacto_requerido");
  });

  it("el alta mínima con teléfono pasa, igual que en la pantalla completa", () => {
    expect(
      validarBorrador(
        borradorDelClienteNuevo(
          valores({ nombre: "Carlos Pérez", telefono: "+507 6123-4567" }),
        ),
      ),
    ).toEqual([]);
  });

  it("un correo que no tiene forma de correo no pasa", () => {
    expect(
      motivos(
        validarBorrador(
          borradorDelClienteNuevo(
            valores({ nombre: "Carlos Pérez", email: "carlos" }),
          ),
        ),
      ),
    ).toContain("correo_invalido");
  });

  it("nunca puede fallar por un documento que el modal no pide", () => {
    // La otra mitad de reusar la validación entera: `documento_incompleto`
    // existe en `validarBorrador` y es inalcanzable desde acá. Si apareciera,
    // el modal mostraría una falla sobre un campo que no dibuja, o sea una
    // falla que nadie puede corregir.
    const nombres = [
      "",
      "Carlos",
      "   ",
      "Inversiones y Desarrollos del Istmo, S.A.",
    ];

    for (const nombre of nombres) {
      for (const telefono of ["", "sin números", "+507 6000-0000"]) {
        for (const email of ["", "carlos", "carlos@istmo.test"]) {
          expect(
            motivos(
              validarBorrador(
                borradorDelClienteNuevo(valores({ nombre, telefono, email })),
              ),
            ),
          ).not.toContain("documento_incompleto");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Qué cuerpo sale hacia la API
// ---------------------------------------------------------------------------

describe("lo que el modal manda", () => {
  it("manda `null` y no `\"\"` en todo lo que no se preguntó", () => {
    const datos = aPeticion(
      borradorDelClienteNuevo(
        valores({ nombre: "Carlos Pérez", telefono: "+507 6123-4567" }),
      ),
    );

    expect(datos).toEqual({
      nombre: "Carlos Pérez",
      tipoClienteId: null,
      documentoTipo: null,
      documentoNumero: null,
      representanteLegal: null,
      email: null,
      telefono: "+507 6123-4567",
      notas: null,
    });
  });

  it("recorta el nombre y baja el correo, como la pantalla completa", () => {
    // No es cosmética: `aPeticion` ya lo hace, y que el modal pase por ahí es
    // lo que evita que el mismo cliente entre con dos correos distintos según
    // por qué puerta se cargó.
    const datos = aPeticion(
      borradorDelClienteNuevo(
        valores({ nombre: "  Carlos Pérez  ", email: "Carlos@Istmo.TEST" }),
      ),
    );

    expect(datos.nombre).toBe("Carlos Pérez");
    expect(datos.email).toBe("carlos@istmo.test");
  });

  it("manda el tipo cuando se eligió uno, y `null` cuando no", () => {
    const conTipo = aPeticion(
      borradorDelClienteNuevo(
        valores({
          nombre: "Istmo S.A.",
          telefono: "+507 200-0000",
          tipoClienteId: "6d1f0b11-1111-4111-8111-000000000001",
        }),
      ),
    );
    expect(conTipo.tipoClienteId).toBe("6d1f0b11-1111-4111-8111-000000000001");

    const sinTipo = aPeticion(
      borradorDelClienteNuevo(
        valores({ nombre: "Istmo S.A.", telefono: "+507 200-0000" }),
      ),
    );
    expect(sinTipo.tipoClienteId).toBeNull();
  });
});
