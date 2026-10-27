/**
 * El cliente que nace desde el alta de cotización, en su parte pura.
 *
 * Lo que este archivo protege son dos cosas, y la segunda es nueva.
 *
 * ## Que no haya una segunda validación
 *
 * El modal da de alta un cliente, y la tentación obvia —escribir acá «nombre
 * y uno de los dos contactos»— produciría la peor clase de defecto: dos
 * puertas al mismo invariante que aceptan cosas distintas. La que acepta más
 * es siempre la nueva, porque la vieja ya tiene pruebas.
 *
 * Así que lo que se mide es la reutilización, no la regla: la regla ya está
 * probada en `test/clientes-ui.spec.ts` —y su copia que manda, la del Worker,
 * en `test/clientes-api.spec.ts`—. Acá se comprueba que los valores del modal
 * lleguen a `validarBorrador` y a `aPeticion` **sin pasar por nada propio**.
 *
 * ## Que las dos puertas pregunten lo mismo
 *
 * El modal llevaba cuatro campos de los ocho del formulario completo, y el
 * usuario cerró esa diferencia: «Deja los campos opcionales, están bien. El
 * modal es compacto y tenemos espacio.» Con la ficha entera adentro, lo que
 * hay que medir es que la lista del modal **sea** la del formulario completo:
 * los mismos campos, los mismos rótulos y las mismas ayudas.
 *
 * Los rótulos se afirman acá contra literales y no contra la lista real de
 * `FormularioDeCliente.tsx`, y no por comodidad: esa lista es privada de un
 * módulo React, y este proyecto de pruebas compila **sin DOM** a propósito
 * (ver el comentario de `test/tsconfig.json`), así que importarlo no es
 * posible ni deseable. Quien compara los dos dibujos de verdad es
 * `e2e/cotizaciones.spec.ts`, que lee las etiquetas de las dos pantallas en un
 * navegador y las enfrenta. Esta prueba es la red de abajo: fija el texto para
 * que un renombre acá se vea sin arrancar Playwright.
 */
import { describe, expect, it } from "vitest";

import {
  BORRADOR_VACIO,
  aPeticion,
  validarBorrador,
  type BorradorDeCliente,
} from "../src/pantallas/clientes/formulario";
import {
  AYUDA_DEL_CLIENTE,
  CAMPOS_DEL_CLIENTE_NUEVO,
  MARCADOR_DEL_CLIENTE,
  NOMBRE_DE_LA_LISTA_DE_CLIENTES,
  ROTULO_DEL_CLIENTE,
  ROTULO_DE_ABRIR_CLIENTE_NUEVO,
  SIN_CLIENTES,
  sinClienteQueCoincida,
} from "../src/pantallas/cotizaciones/cliente-nuevo";

function borrador(
  ajustes: Partial<BorradorDeCliente> = {},
): BorradorDeCliente {
  return { ...BORRADOR_VACIO, ...ajustes };
}

function motivos(fallas: readonly { motivo: string }[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

// ---------------------------------------------------------------------------
// Qué campos lleva el modal
// ---------------------------------------------------------------------------

describe("CAMPOS_DEL_CLIENTE_NUEVO", () => {
  it("lleva la ficha entera, en el orden del formulario completo", () => {
    // El orden es el de la conversación telefónica, igual que en el
    // formulario completo: cómo se llama, cómo se le vuelve a hablar, y
    // después los datos que se averiguan con el expediente en la mano.
    //
    // El tipo de cliente no está en esta lista y no falta: es un desplegable
    // que necesita el catálogo, y el componente lo dibuja aparte. Que no
    // pueda estar lo garantiza el tipo de `campo`, que lo excluye.
    expect(CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => campo.campo)).toEqual([
      "nombre",
      "telefono",
      "email",
      "documentoTipo",
      "documentoNumero",
      "representanteLegal",
      "notas",
    ]);
  });

  it("cada campo dice en su etiqueta qué exige", () => {
    // La convención que `FormularioDeCliente.tsx` tiene escrita: la exigencia
    // va en la propia etiqueta, no en una ayuda al pie. Son tres estados y no
    // un booleano porque hay un requisito que no es ni «este campo» ni
    // «ninguno», sino **uno de estos dos**.
    expect(
      Object.fromEntries(
        CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => [campo.campo, campo.exigencia]),
      ),
    ).toEqual({
      nombre: "obligatorio",
      telefono: "uno de los dos",
      email: "uno de los dos",
      documentoTipo: "opcional",
      documentoNumero: "opcional",
      representanteLegal: "opcional",
      notas: "opcional",
    });
  });

  it("ningún contacto se marca «opcional», porque sería mentira", () => {
    // La que de verdad atrapa la regresión: `validarBorrador` rechaza un
    // cliente sin teléfono **y** sin correo, así que una etiqueta que diga
    // «opcional» en cualquiera de los dos está prometiendo algo que el
    // guardado no cumple. Y ahora que el modal sí tiene campos opcionales de
    // verdad, la marca equivocada es más fácil de pegar por descuido.
    const contactos = CAMPOS_DEL_CLIENTE_NUEVO.filter(
      ({ campo }) => campo === "telefono" || campo === "email",
    );

    expect(
      contactos.length,
      "la prueba está rota: no encontró los contactos",
    ).toBe(2);
    for (const contacto of contactos) {
      expect(
        contacto.exigencia,
        `«${contacto.rotulo}» se marca «opcional» y no lo es: guardar sin` +
          " ninguno de los dos contactos falla con `contacto_requerido`",
      ).not.toBe("opcional");
    }
  });

  it("los rótulos son los del formulario completo, letra por letra", () => {
    // No es cosmética. Quien carga un cliente por las dos puertas tiene que
    // reconocer los campos, y «Correo» en una y «Email» en la otra se leen
    // como dos campos distintos. El porqué de que acá haya literales y no una
    // constante compartida está en el encabezado de este archivo.
    expect(
      Object.fromEntries(
        CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => [campo.campo, campo.rotulo]),
      ),
    ).toEqual({
      nombre: "Nombre",
      telefono: "Teléfono",
      email: "Correo",
      documentoTipo: "Tipo de documento",
      documentoNumero: "Número de documento",
      representanteLegal: "Representante legal",
      notas: "Notas",
    });
  });

  it("las ayudas son las del formulario completo, letra por letra", () => {
    // Las dos ayudas que el formulario completo escribe, y sólo esas dos. La
    // del tipo de documento existe porque «tipo de documento» no dice qué se
    // espera adentro; la del representante, porque el campo sólo tiene
    // sentido cuando el cliente es una entidad.
    expect(
      Object.fromEntries(
        CAMPOS_DEL_CLIENTE_NUEVO.filter(
          (campo) => campo.ayuda !== undefined,
        ).map((campo) => [campo.campo, campo.ayuda]),
      ),
    ).toEqual({
      documentoTipo: "Cédula, RUC, pasaporte…",
      representanteLegal: "Quién firma, cuando el cliente es una entidad.",
    });
  });

  it("las notas son el único campo de prosa, y el resto son de una línea", () => {
    // El campo dice **qué control es**, y el componente no distingue las
    // notas por su nombre. Un `control` por dato es lo que impide la otra
    // forma de este defecto: un `if (campo === "notas")` enterrado en el JSX,
    // que es invisible desde acá y se olvida al agregar la segunda nota.
    const prosa = CAMPOS_DEL_CLIENTE_NUEVO.filter(
      (campo) => campo.control === "prosa",
    );

    expect(
      prosa.map((campo) => campo.campo),
      "las notas no se dibujan como prosa: un `<input>` de una línea para un" +
        " texto de varias esconde lo que ya se escribió",
    ).toEqual(["notas"]);

    // Y la otra mitad: ningún campo corto quedó marcado como prosa, porque un
    // teléfono en un `<textarea>` acepta saltos de línea.
    for (const campo of CAMPOS_DEL_CLIENTE_NUEVO) {
      if (campo.control === "texto") {
        expect(
          ["text", "email", "tel"],
          `«${campo.rotulo}» no declara un tipo de control válido`,
        ).toContain(campo.tipo);
      }
    }
  });

  it("los dos contactos declaran el teclado que les corresponde", () => {
    // `type="tel"` y `type="email"` no son decoración: en un teléfono abren
    // el teclado numérico y el de correo. Cargar un lead desde el celular es
    // el caso que esta tajada existe para servir.
    const porCampo = new Map(
      CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => [campo.campo, campo]),
    );

    expect(porCampo.get("telefono")).toMatchObject({
      control: "texto",
      tipo: "tel",
    });
    expect(porCampo.get("email")).toMatchObject({
      control: "texto",
      tipo: "email",
    });
  });

  it("no nombra ningún campo que el borrador de cliente no tenga", () => {
    // La guardia contra el error de tipeo que deja un control sin estado: un
    // campo que no es clave del borrador se dibujaría y no guardaría nada.
    for (const { campo } of CAMPOS_DEL_CLIENTE_NUEVO) {
      expect(Object.keys(BORRADOR_VACIO)).toContain(campo);
    }
  });

  it("cubre el borrador entero salvo el tipo, que se dibuja aparte", () => {
    // El contrapeso del de arriba, y el que de verdad dice qué es este modal
    // ahora: **la ficha completa**. Un campo del borrador que no esté en esta
    // lista y no sea el tipo es un dato que el modal no puede cargar y que
    // obliga a pasar por `/clientes/nuevo`, que es el viaje que esta pantalla
    // existe para ahorrar.
    const pedidos = new Set<string>(
      CAMPOS_DEL_CLIENTE_NUEVO.map((campo) => campo.campo),
    );
    const faltantes = Object.keys(BORRADOR_VACIO).filter(
      (campo) => campo !== "tipoClienteId" && !pedidos.has(campo),
    );

    expect(
      faltantes,
      "el borrador de cliente tiene campos que el modal no pregunta: el modal" +
        " dejó de ser la ficha completa y vuelve a haber clientes cargados a" +
        " medias",
    ).toEqual([]);
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
    expect(motivos(validarBorrador(borrador({ nombre: "Carlos" })))).toContain(
      "contacto_requerido",
    );
  });

  it("el alta mínima con teléfono pasa, igual que en la pantalla completa", () => {
    // Lo que el usuario pidió conservar: los campos nuevos son opcionales de
    // verdad. Que estén dibujados no los vuelve exigibles.
    expect(
      validarBorrador(
        borrador({ nombre: "Carlos Pérez", telefono: "+507 6123-4567" }),
      ),
    ).toEqual([]);
  });

  it("un correo que no tiene forma de correo no pasa", () => {
    expect(
      motivos(validarBorrador(borrador({ nombre: "Carlos Pérez", email: "carlos" }))),
    ).toContain("correo_invalido");
  });

  it("medio documento no pasa, y ahora esa falla se puede corregir adentro", () => {
    // El giro que trajo la ficha completa. `documento_incompleto` existía en
    // `validarBorrador` y era **inalcanzable** desde el modal de cuatro
    // campos: la prueba vieja afirmaba justamente eso, porque una falla sobre
    // un campo que no se dibuja es una falla que nadie puede corregir.
    //
    // Ahora los dos campos del documento están a la vista, así que la regla
    // vale y se mide: tipo sin número, y número sin tipo.
    expect(
      motivos(
        validarBorrador(
          borrador({
            nombre: "Istmo S.A.",
            telefono: "+507 200-0000",
            documentoTipo: "RUC",
          }),
        ),
      ),
      "el documento a medias pasó: se guardaría un tipo sin número, que" +
        " después nadie puede interpretar",
    ).toContain("documento_incompleto");

    expect(
      motivos(
        validarBorrador(
          borrador({
            nombre: "Istmo S.A.",
            telefono: "+507 200-0000",
            documentoNumero: "155555555-2-2015",
          }),
        ),
      ),
    ).toContain("documento_incompleto");
  });

  it("el documento entero pasa, y ninguno de los dos pasa también", () => {
    const entero = validarBorrador(
      borrador({
        nombre: "Istmo S.A.",
        telefono: "+507 200-0000",
        documentoTipo: "RUC",
        documentoNumero: "155555555-2-2015",
      }),
    );
    expect(entero).toEqual([]);

    const sinDocumento = validarBorrador(
      borrador({ nombre: "Istmo S.A.", telefono: "+507 200-0000" }),
    );
    expect(sinDocumento).toEqual([]);
  });

  it("el representante y las notas no son exigibles por sí mismos", () => {
    // La guardia contra la regresión más probable de esta tajada: que alguien
    // confunda «dibujado» con «obligatorio». Cargar un lead con el nombre y
    // un teléfono tiene que seguir alcanzando.
    for (const extra of [
      { representanteLegal: "Marcela Quintero" },
      { notas: "Llamó por una sociedad nueva." },
      {
        representanteLegal: "Marcela Quintero",
        notas: "Llamó por una sociedad nueva.",
      },
    ]) {
      expect(
        validarBorrador(
          borrador({
            nombre: "Istmo S.A.",
            telefono: "+507 200-0000",
            ...extra,
          }),
        ),
      ).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Qué cuerpo sale hacia la API
// ---------------------------------------------------------------------------

describe("lo que el modal manda", () => {
  it("manda `null` y no `\"\"` en todo lo que no se preguntó", () => {
    // La razón por la que el estado del modal es el borrador entero y no un
    // objeto de los campos que se tocaron: `aPeticion` convierte lo vacío en
    // `null`, y es ahí donde «todavía nadie lo sabe» se distingue de «no
    // tiene». Un `""` guardado es un documento que existe y está en blanco.
    const datos = aPeticion(
      borrador({ nombre: "Carlos Pérez", telefono: "+507 6123-4567" }),
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

  it("manda la ficha entera cuando se cargó entera", () => {
    // Lo que la tajada agrega, medido en el cuerpo que viaja: los cuatro
    // campos nuevos llegan al servidor. Sin esto el modal los dibujaría y los
    // perdería, que es la peor de las dos mitades.
    const datos = aPeticion(
      borrador({
        nombre: "Inversiones del Istmo, S.A.",
        telefono: "+507 200-0000",
        email: "contacto@istmo.test",
        tipoClienteId: "6d1f0b11-1111-4111-8111-000000000001",
        documentoTipo: "RUC",
        documentoNumero: "155555555-2-2015",
        representanteLegal: "Marcela Quintero Ríos",
        notas: "Llamó por una sociedad nueva.",
      }),
    );

    expect(datos).toEqual({
      nombre: "Inversiones del Istmo, S.A.",
      tipoClienteId: "6d1f0b11-1111-4111-8111-000000000001",
      documentoTipo: "RUC",
      documentoNumero: "155555555-2-2015",
      representanteLegal: "Marcela Quintero Ríos",
      email: "contacto@istmo.test",
      telefono: "+507 200-0000",
      notas: "Llamó por una sociedad nueva.",
    });
  });

  it("recorta el nombre y baja el correo, como la pantalla completa", () => {
    // No es cosmética: `aPeticion` ya lo hace, y que el modal pase por ahí es
    // lo que evita que el mismo cliente entre con dos correos distintos según
    // por qué puerta se cargó.
    const datos = aPeticion(
      borrador({ nombre: "  Carlos Pérez  ", email: "Carlos@Istmo.TEST" }),
    );

    expect(datos.nombre).toBe("Carlos Pérez");
    expect(datos.email).toBe("carlos@istmo.test");
  });

  it("manda el tipo cuando se eligió uno, y `null` cuando no", () => {
    const conTipo = aPeticion(
      borrador({
        nombre: "Istmo S.A.",
        telefono: "+507 200-0000",
        tipoClienteId: "6d1f0b11-1111-4111-8111-000000000001",
      }),
    );
    expect(conTipo.tipoClienteId).toBe("6d1f0b11-1111-4111-8111-000000000001");

    const sinTipo = aPeticion(
      borrador({ nombre: "Istmo S.A.", telefono: "+507 200-0000" }),
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
