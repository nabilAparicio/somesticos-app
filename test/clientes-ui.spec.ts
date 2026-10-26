/**
 * La lógica de las pantallas de cliente.
 *
 * Esta es la deuda que T-1 difirió a T-4 y T-4 difirió acá: `src/` no tenía
 * una sola prueba unitaria. Se difirió dos veces con razón —no había lógica
 * propia que probar, solo andamio y layout— y T-5 es la tarea donde esa razón
 * deja de valer.
 *
 * Lo que se prueba es **lógica pura**: resolución de rutas, el borrador del
 * formulario y su validación, y los derivados de presentación. Por eso estos
 * módulos no importan React ni tocan el DOM, y por eso esta prueba corre en el
 * mismo runner que el resto en vez de arrastrar un entorno de navegador.
 *
 * La validación del formulario es **la segunda copia** de la regla del
 * contacto obligatorio: la primera, la que manda, vive en el Worker y está
 * probada en `clientes-api.spec.ts`. La del navegador existe para avisar antes
 * de mandar, no para autorizar. Las dos se prueban por separado a propósito:
 * aflojar una tiene que matar sus propias pruebas y no las de la otra.
 */
import { describe, expect, it } from "vitest";

import type { Cliente, Cotizacion, TipoCliente } from "../worker/contract";
import {
  BORRADOR_VACIO,
  aPeticion,
  borradorDesde,
  tiposSeleccionables,
  validarBorrador,
  type BorradorDeCliente,
} from "../src/pantallas/clientes/formulario";
import {
  contactoDe,
  cotizacionesDeCliente,
  documentoDe,
  filtrarClientes,
  ordenarPorNombre,
  tipoDe,
} from "../src/pantallas/clientes/presentacion";
import { enlaceDe, resolverRuta } from "../src/ruteo";

const ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";

function cliente(ajustes: Partial<Cliente> = {}): Cliente {
  return {
    id: ID,
    tipoClienteId: null,
    tipoClienteNombre: null,
    nombre: "Carlos Pérez",
    documentoTipo: null,
    documentoNumero: null,
    representanteLegal: null,
    email: null,
    telefono: null,
    notas: null,
    creadoPor: "7335d417-61da-459d-899c-0a01c76a2f94",
    creadoPorNombre: "Itzel",
    creadoEn: "2026-10-22T14:03:00.000Z",
    ...ajustes,
  };
}

function cotizacion(ajustes: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: "c1",
    codigo: "COT-2026-0001",
    estado: "borrador",
    clienteId: ID,
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

function borrador(ajustes: Partial<BorradorDeCliente> = {}): BorradorDeCliente {
  return { ...BORRADOR_VACIO, ...ajustes };
}

function motivos(fallas: readonly { motivo: string }[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

// ---------------------------------------------------------------------------
// Ruteo
// ---------------------------------------------------------------------------

describe("resolverRuta", () => {
  it("resuelve las rutas de cliente, incluidas las que llevan id", () => {
    expect(resolverRuta("/")).toEqual({ nombre: "inicio" });
    expect(resolverRuta("/clientes")).toEqual({ nombre: "clientes" });
    expect(resolverRuta("/clientes/nuevo")).toEqual({ nombre: "cliente-nuevo" });
    expect(resolverRuta(`/clientes/${ID}`)).toEqual({
      nombre: "cliente",
      id: ID,
    });
    expect(resolverRuta(`/clientes/${ID}/editar`)).toEqual({
      nombre: "cliente-edicion",
      id: ID,
    });
  });

  it("no confunde `/clientes/nuevo` con un cliente llamado «nuevo»", () => {
    // El error clásico del ruteo a mano: el segmento literal cae en la rama
    // del parámetro y la pantalla de alta no se alcanza nunca.
    expect(resolverRuta("/clientes/nuevo")).not.toMatchObject({
      nombre: "cliente",
    });
  });

  it("tolera la barra final, que es lo que pega la gente", () => {
    expect(resolverRuta("/clientes/")).toEqual({ nombre: "clientes" });
    expect(resolverRuta(`/clientes/${ID}/`)).toEqual({
      nombre: "cliente",
      id: ID,
    });
  });

  it("decodifica el identificador que viene percent-encoded", () => {
    expect(resolverRuta("/clientes/a%20b")).toEqual({
      nombre: "cliente",
      id: "a b",
    });
  });

  it("no inventa una ruta para lo que no conoce", () => {
    expect(resolverRuta("/clientes/x/y/z")).toMatchObject({
      nombre: "desconocida",
    });
    // `/procesos` era desconocida hasta T-7, que la estrenó. Lo que sigue
    // valiendo es que una sección inventada no resuelva a nada.
    expect(resolverRuta("/expedientes")).toMatchObject({
      nombre: "desconocida",
    });
    // Un id vacío no es un id.
    expect(resolverRuta("/clientes//editar")).toMatchObject({
      nombre: "desconocida",
    });
  });

  it("los enlaces que genera vuelven a resolver a la misma ruta", () => {
    // La ida y la vuelta: sin esto, `enlaceDe` y `resolverRuta` pueden
    // divergir y el enlace de la tabla lleva a una pantalla desconocida.
    for (const ruta of [
      { nombre: "clientes" },
      { nombre: "cliente-nuevo" },
      { nombre: "cliente", id: ID },
      { nombre: "cliente-edicion", id: ID },
    ] as const) {
      expect(resolverRuta(enlaceDe(ruta))).toEqual(ruta);
    }
  });

  it("escapa un identificador con caracteres de ruta", () => {
    const raro = "a/b?c";
    expect(enlaceDe({ nombre: "cliente", id: raro })).not.toContain("a/b");
    expect(resolverRuta(enlaceDe({ nombre: "cliente", id: raro }))).toEqual({
      nombre: "cliente",
      id: raro,
    });
  });
});

// ---------------------------------------------------------------------------
// El borrador del formulario
// ---------------------------------------------------------------------------

describe("validarBorrador", () => {
  it("rechaza un borrador sin nombre", () => {
    expect(
      motivos(validarBorrador(borrador({ telefono: "+507 6123-4567" }))),
    ).toContain("nombre_requerido");
  });

  it("rechaza un nombre que es solo espacios", () => {
    expect(
      motivos(
        validarBorrador(borrador({ nombre: "  ", telefono: "+507 6000-0000" })),
      ),
    ).toContain("nombre_requerido");
  });

  it("rechaza un borrador sin ningún medio de contacto", () => {
    expect(motivos(validarBorrador(borrador({ nombre: "Carlos" })))).toContain(
      "contacto_requerido",
    );
  });

  it("acepta el alta mínima con teléfono, que es el criterio de T-5", () => {
    expect(
      validarBorrador(
        borrador({ nombre: "Carlos Pérez", telefono: "+507 6123-4567" }),
      ),
    ).toEqual([]);
  });

  it("acepta el alta mínima con correo", () => {
    expect(
      validarBorrador(
        borrador({ nombre: "Ana Gómez", email: "ana@ejemplo.test" }),
      ),
    ).toEqual([]);
  });

  it("rechaza un correo que no es un correo", () => {
    expect(
      motivos(validarBorrador(borrador({ nombre: "Ana", email: "no tengo" }))),
    ).toContain("correo_invalido");
  });

  it("rechaza un teléfono sin dígitos", () => {
    expect(
      motivos(validarBorrador(borrador({ nombre: "Ana", telefono: "no sé" }))),
    ).toContain("telefono_invalido");
  });

  it("rechaza medio documento, en las dos mitades", () => {
    expect(
      motivos(
        validarBorrador(
          borrador({
            nombre: "Istmo",
            telefono: "+507 300-0000",
            documentoTipo: "RUC",
          }),
        ),
      ),
    ).toContain("documento_incompleto");

    expect(
      motivos(
        validarBorrador(
          borrador({
            nombre: "Istmo",
            telefono: "+507 300-0000",
            documentoNumero: "155-2-2024",
          }),
        ),
      ),
    ).toContain("documento_incompleto");
  });

  it("acepta el documento completo", () => {
    expect(
      validarBorrador(
        borrador({
          nombre: "Istmo",
          telefono: "+507 300-0000",
          documentoTipo: "RUC",
          documentoNumero: "155-2-2024",
        }),
      ),
    ).toEqual([]);
  });

  it("no exige tipo, documento ni representante legal", () => {
    // El invariante de §5: si el formulario exigiera más que nombre y un
    // contacto, no se podría cotizarle a un prospecto.
    const minimo = borrador({
      nombre: "Carlos Pérez",
      telefono: "+507 6123-4567",
    });

    expect(minimo.tipoClienteId).toBe("");
    expect(minimo.representanteLegal).toBe("");
    expect(validarBorrador(minimo)).toEqual([]);
  });
});

describe("aPeticion", () => {
  it("manda null, no cadena vacía, por cada campo en blanco", () => {
    // Importa de verdad: `""` guardado en la base es un documento que existe
    // y está vacío, y después nada distingue «no lo sabemos» de «no tiene».
    expect(
      aPeticion(borrador({ nombre: "Carlos", telefono: "+507 6123-4567" })),
    ).toEqual({
      nombre: "Carlos",
      tipoClienteId: null,
      documentoTipo: null,
      documentoNumero: null,
      representanteLegal: null,
      email: null,
      telefono: "+507 6123-4567",
      notas: null,
    });
  });

  it("recorta y baja el correo a minúsculas", () => {
    const peticion = aPeticion(
      borrador({ nombre: "  Ana  ", email: "  Ana@Ejemplo.TEST " }),
    );

    expect(peticion.nombre).toBe("Ana");
    expect(peticion.email).toBe("ana@ejemplo.test");
  });
});

describe("borradorDesde", () => {
  it("convierte los nulos en campos vacíos editables", () => {
    expect(borradorDesde(cliente({ telefono: "+507 6123-4567" }))).toEqual({
      nombre: "Carlos Pérez",
      tipoClienteId: "",
      documentoTipo: "",
      documentoNumero: "",
      representanteLegal: "",
      email: "",
      telefono: "+507 6123-4567",
      notas: "",
    });
  });

  it("la ida y vuelta por el formulario no pierde ningún campo", () => {
    // La prueba que atrapa el campo olvidado: si mañana se agrega uno al
    // cliente y no al borrador, la edición lo borraría en silencio al guardar.
    const completo = cliente({
      tipoClienteId: "tipo-1",
      tipoClienteNombre: "Empresa",
      documentoTipo: "RUC",
      documentoNumero: "155-2-2024",
      representanteLegal: "María Candanedo",
      email: "contacto@istmo.test",
      telefono: "+507 300-1122",
      notas: "Pide factura.",
    });

    expect(aPeticion(borradorDesde(completo))).toEqual({
      nombre: completo.nombre,
      tipoClienteId: completo.tipoClienteId,
      documentoTipo: completo.documentoTipo,
      documentoNumero: completo.documentoNumero,
      representanteLegal: completo.representanteLegal,
      email: completo.email,
      telefono: completo.telefono,
      notas: completo.notas,
    });
  });
});

describe("tiposSeleccionables", () => {
  const tipos: TipoCliente[] = [
    { id: "t1", nombre: "Empresa", activo: true },
    { id: "t2", nombre: "Particular", activo: true },
    { id: "t3", nombre: "Asociación", activo: false },
  ];

  it("ofrece solo los tipos vigentes", () => {
    expect(tiposSeleccionables(tipos, "").map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("conserva el tipo que el cliente ya tiene aunque esté dado de baja", () => {
    // Si no, abrir a editar un cliente viejo y guardar sin tocar nada le
    // cambiaría el tipo sin que nadie lo pidiera.
    expect(tiposSeleccionables(tipos, "t3").map((t) => t.id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });

  it("no duplica el tipo seleccionado cuando está vigente", () => {
    expect(tiposSeleccionables(tipos, "t1").map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

describe("derivados de presentación", () => {
  it("muestra los dos contactos cuando los hay, y un guion cuando no", () => {
    expect(
      contactoDe(cliente({ telefono: "+507 6123-4567", email: "a@b.test" })),
    ).toBe("+507 6123-4567 · a@b.test");
    expect(contactoDe(cliente({ telefono: "+507 6123-4567" }))).toBe(
      "+507 6123-4567",
    );
    expect(contactoDe(cliente({ email: "a@b.test" }))).toBe("a@b.test");
    expect(contactoDe(cliente())).toBe("—");
  });

  it("muestra el documento como tipo y número juntos", () => {
    expect(
      documentoDe(cliente({ documentoTipo: "RUC", documentoNumero: "155-2" })),
    ).toBe("RUC 155-2");
    expect(documentoDe(cliente())).toBe("—");
  });

  it("nombra el tipo, y dice «sin tipo» cuando no lo hay", () => {
    expect(tipoDe(cliente({ tipoClienteNombre: "Empresa" }))).toBe("Empresa");
    expect(tipoDe(cliente())).toBe("Sin tipo");
  });

  it("ordena por nombre con las reglas del español", () => {
    const nombres = ordenarPorNombre([
      cliente({ id: "1", nombre: "Zapata" }),
      cliente({ id: "2", nombre: "ávila" }),
      cliente({ id: "3", nombre: "Álvarez" }),
      cliente({ id: "4", nombre: "Núñez" }),
      cliente({ id: "5", nombre: "Nuñez" }),
    ]).map((c) => c.nombre);

    // `Álvarez` antes que `ávila` y los dos antes que `Nuñez`: con un
    // `sort()` crudo las mayúsculas y los acentos se van al final.
    expect(nombres).toEqual([
      "Álvarez",
      "ávila",
      "Nuñez",
      "Núñez",
      "Zapata",
    ]);
  });

  it("no muta el arreglo que recibe", () => {
    const original = [
      cliente({ id: "1", nombre: "Zapata" }),
      cliente({ id: "2", nombre: "Álvarez" }),
    ];
    ordenarPorNombre(original);

    expect(original.map((c) => c.nombre)).toEqual(["Zapata", "Álvarez"]);
  });

  it("filtra ignorando acentos y mayúsculas", () => {
    const lista = [
      cliente({ id: "1", nombre: "Álvarez Núñez, Ana" }),
      cliente({ id: "2", nombre: "Zapata", telefono: "+507 6123-4567" }),
      cliente({ id: "3", nombre: "Istmo", documentoNumero: "155-2-2024" }),
      cliente({ id: "4", nombre: "Gómez", email: "ANA@ejemplo.test" }),
    ];

    expect(filtrarClientes(lista, "alvarez nunez").map((c) => c.id)).toEqual([
      "1",
    ]);
    expect(filtrarClientes(lista, "6123").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarClientes(lista, "155-2").map((c) => c.id)).toEqual(["3"]);
    expect(filtrarClientes(lista, "ana@").map((c) => c.id)).toEqual(["4"]);
  });

  it("una consulta vacía no filtra nada", () => {
    const lista = [cliente({ id: "1" }), cliente({ id: "2" })];
    expect(filtrarClientes(lista, "   ")).toHaveLength(2);
  });

  it("una consulta sin coincidencias no devuelve nada", () => {
    // El contrapeso de la de arriba: un filtro que devolviera siempre la
    // lista entera pasaría todas las afirmaciones de coincidencia.
    expect(filtrarClientes([cliente({ nombre: "Zapata" })], "xyz")).toEqual([]);
  });
});

/* ==========================================================================
   Las cotizaciones del cliente (T-16)

   El detalle del cliente mostraba procesos, bitácora y notas, y **no sus
   cotizaciones**: desde la ficha de un cliente con una cotización ganada no
   había forma de llegar a ella.

   El filtro corre en el navegador sobre el listado entero, que es lo que ya
   hace `procesosDeCotizacion` para los procesos que abrió una cotización.
   `GET /api/cotizaciones` devuelve cada fila con su `clienteId`, así que no
   hizo falta ni una ruta nueva ni un parámetro nuevo.
   ========================================================================== */

describe("cotizacionesDeCliente", () => {
  const OTRO = "0e2c4c1f-9a6b-4d8a-9c5e-7b904a3f1d0e";

  it("se queda con las del cliente y deja afuera las de los demás", () => {
    const lista = [
      cotizacion({ id: "1", clienteId: ID }),
      cotizacion({ id: "2", clienteId: OTRO }),
      cotizacion({ id: "3", clienteId: ID }),
    ];

    expect(cotizacionesDeCliente(lista, ID).map((c) => c.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("un cliente sin ninguna cotización no se queda con las ajenas", () => {
    // El contrapeso: un filtro que devolviera la lista entera pasaría la
    // afirmación de arriba sobre el cliente que sí tiene.
    const lista = [cotizacion({ id: "2", clienteId: OTRO })];

    expect(cotizacionesDeCliente(lista, ID)).toEqual([]);
  });

  it("compara por identificador y no por nombre", () => {
    // El nombre es texto de cara a una persona y puede repetirse entre dos
    // fichas; lo que ata las dos filas es la llave.
    const lista = [
      cotizacion({ id: "1", clienteId: OTRO, clienteNombre: "Carlos Pérez" }),
    ];

    expect(cotizacionesDeCliente(lista, ID)).toEqual([]);
  });

  it("no muta el arreglo que recibe", () => {
    const original = [
      cotizacion({ id: "1", clienteId: ID }),
      cotizacion({ id: "2", clienteId: OTRO }),
    ];
    cotizacionesDeCliente(original, ID);

    expect(original.map((c) => c.id)).toEqual(["1", "2"]);
  });
});
