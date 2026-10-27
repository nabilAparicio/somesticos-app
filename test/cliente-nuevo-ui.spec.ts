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
 *
 * ## Y los textos del campo al que ese botón acompaña (T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`)
 *
 * El selector de cliente pasó de `<select>` a combobox buscable, y sus textos
 * viven en el mismo módulo que el botón de al lado por una razón que se lee en
 * las frases: **lo que se dice cuando no hay ningún cliente es un puntero a ese
 * botón**. Separarlos dejaría la frase en un archivo y el control que nombra en
 * otro, que es cómo una de las dos mitades se renombra sola.
 */
import { describe, expect, it } from "vitest";

import {
  BORRADOR_VACIO,
  aPeticion,
  validarBorrador,
} from "../src/pantallas/clientes/formulario";
import {
  AYUDA_DEL_CLIENTE,
  CAMPOS_DEL_CLIENTE_NUEVO,
  MARCADOR_DEL_CLIENTE,
  NOMBRE_DE_LA_LISTA_DE_CLIENTES,
  ROTULO_DEL_CLIENTE,
  ROTULO_DE_ABRIR_CLIENTE_NUEVO,
  SIN_CLIENTES,
  VALORES_DEL_CLIENTE_NUEVO_VACIOS,
  borradorDelClienteNuevo,
  sinClienteQueCoincida,
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

  it("cada campo dice en su etiqueta qué exige", () => {
    // Esta prueba afirmaba lo contrario —«de los contactos alcanza uno, y eso
    // lo dice la ayuda del modal, no una marca por campo»— y se dio vuelta
    // con el diseño, a pedido del usuario: la ayuda eran dos párrafos arriba
    // del formulario y el primero existía sólo para **corregir una etiqueta
    // que mentía**. Los dos contactos decían «opcional» cuando uno de los dos
    // hace falta.
    //
    // Es además la convención que `FormularioDeCliente.tsx` ya tenía escrita:
    // la exigencia va en la propia etiqueta, no en una ayuda al pie.
    expect(
      Object.fromEntries(
        CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => [campo.campo, campo.exigencia]),
      ),
    ).toEqual({
      nombre: "obligatorio",
      telefono: "uno de los dos",
      email: "uno de los dos",
    });
  });

  it("ningún contacto se marca «opcional», porque sería mentira", () => {
    // El contrapeso de la de arriba, y la que de verdad atrapa la regresión:
    // `validarBorrador` rechaza un cliente sin teléfono **y** sin correo, así
    // que una etiqueta que diga «opcional» en cualquiera de los dos está
    // prometiendo algo que el guardado no cumple.
    const contactos = CAMPOS_DEL_CLIENTE_NUEVO.filter(
      ({ campo }) => campo === "telefono" || campo === "email",
    );

    expect(contactos.length, "la prueba está rota: no encontró los contactos").toBe(2);
    for (const contacto of contactos) {
      expect(
        contacto.exigencia,
        `«${contacto.rotulo}» se marca «opcional» y no lo es: guardar sin` +
          " ninguno de los dos contactos falla con `contacto_requerido`",
      ).not.toBe("opcional");
    }
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

// ---------------------------------------------------------------------------
// Los textos del selector de cliente (T-1 de
// `odd/tasks/el-selector-de-cliente-busca.md`)
//
// Viven en este módulo y no en `combobox.ts` por pertenencia: `combobox.ts` es
// la mecánica, que no sabe de qué dominio son las opciones que recorre, y
// estas frases son del campo de cliente del alta. Y viven junto al rótulo del
// botón porque **una de ellas nombra ese botón**: lo que se dice cuando no hay
// ningún cliente es un puntero a él.
// ---------------------------------------------------------------------------

describe("los textos del selector de cliente", () => {
  it("el rótulo es una palabra y el marcador dice qué hacer con el campo", () => {
    // Corto porque el campo convive con el botón en la misma franja, y un
    // rótulo de cuatro palabras ocupa dos renglones a 320px. Lo que el campo
    // ya no puede dar por sentado es que se sepa que se escribe: un
    // `<select>` se abría, y esto se teclea.
    expect(ROTULO_DEL_CLIENTE).toBe("Cliente");
    expect(MARCADOR_DEL_CLIENTE.toLowerCase()).toContain("buscar");
    expect(MARCADOR_DEL_CLIENTE.toLowerCase()).toContain("cliente");
  });

  it("la lista tiene nombre propio, y no el del otro combobox", () => {
    // En el detalle de una cotización hay un `role="listbox"` por línea
    // —«Servicios que coinciden»— y en el alta está éste. Dos listas que se
    // anuncian igual son dos controles indistinguibles para quien las oye.
    expect(NOMBRE_DE_LA_LISTA_DE_CLIENTES.toLowerCase()).toContain("cliente");
    expect(
      NOMBRE_DE_LA_LISTA_DE_CLIENTES.toLowerCase(),
      "la lista de clientes se anuncia como la de servicios: son dos" +
        " comboboxes distintos y un lector de pantalla no los va a poder" +
        " separar",
    ).not.toContain("servicio");
  });

  it("sin ningún cliente, el texto lo dice y manda al botón de al lado", () => {
    expect(SIN_CLIENTES.toLowerCase()).toContain("ningún cliente");
    expect(
      SIN_CLIENTES.toLowerCase(),
      "la frase dice que no hay clientes y no dice qué hacer: deja a quien" +
        " lee buscando dónde se crea uno, que es justo lo que el botón de al" +
        " lado resolvió",
    ).toContain("botón");
    // Y no manda a otra pantalla. El botón crea el cliente sin salir de acá, y
    // una frase que mandara a `/clientes/nuevo` deshace el viaje ahorrado.
    expect(SIN_CLIENTES.toLowerCase()).not.toContain("pantalla de clientes");
  });

  it("la ayuda dice que se escribe para buscar y nombra la salida", () => {
    // El cambio que hay que explicar no es el control: es que ahora se
    // escribe. Y la salida —el cliente que no está en la lista— se nombra
    // siempre y no sólo cuando la lista queda vacía.
    expect(AYUDA_DEL_CLIENTE.toLowerCase()).toContain("buscar");
    expect(AYUDA_DEL_CLIENTE.toLowerCase()).toContain("botón");
  });

  it("una búsqueda sin resultados dice qué fue lo que no se encontró", () => {
    // Entrecomillado, igual que la del selector de servicio: «ningún
    // resultado» a secas no deja ver que lo que falta es una letra de más.
    expect(sinClienteQueCoincida("Pérez")).toBe(
      "Ningún cliente coincide con «Pérez».",
    );
  });

  it("y esa frase no habla de servicios", () => {
    // La guardia contra el copiado: el texto del otro combobox dice «Ningún
    // servicio coincide», y pegarlo acá dejaría el selector de cliente
    // avisando sobre el catálogo de precios.
    expect(sinClienteQueCoincida("Pérez").toLowerCase()).not.toContain(
      "servicio",
    );
  });

  it("el botón que esas frases nombran sigue diciendo el verbo entero", () => {
    // La costura entre las dos mitades de este módulo. Si alguien dejara el
    // botón en «+» o en «Nuevo», las frases seguirían diciendo «el botón de al
    // lado» y nadie podría saber cuál.
    expect(ROTULO_DE_ABRIR_CLIENTE_NUEVO.toLowerCase()).toContain("cliente");
    expect(ROTULO_DE_ABRIR_CLIENTE_NUEVO.toLowerCase()).toContain("nuevo");
  });
});
