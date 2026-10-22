/**
 * Las reglas de qué es un cliente aceptable. Puras: ni D1 ni HTTP.
 *
 * La regla que manda es la del criterio de T-5, y vale la pena escribirla
 * entera porque es contraintuitiva: **lo mínimo es un nombre y un medio de
 * contacto, cualquiera de los dos**. Todo lo demás es opcional. Un formulario
 * que exigiera tipo, documento y representante legal haría que los invariantes
 * I-1 e I-2 (`docs/diseno.md` §5) impidieran cotizarle a un prospecto, que es
 * exactamente el momento en que se cotiza: alguien llamó y todavía no se sabe
 * casi nada de él.
 *
 * Lo que sí se exige es que lo que se escriba signifique algo. Un contacto en
 * blanco no es un contacto, y un "no sé" escrito en el campo de teléfono deja
 * un cliente incontactable con la apariencia de uno contactable.
 */

import type {
  DatosDeCliente,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../contract";

export type Normalizacion =
  | { ok: true; datos: DatosDeCliente }
  | { ok: false; fallas: FallaDeValidacion[] };

/** Los campos editables, en el orden en que los muestra el formulario. */
const CAMPOS = [
  "nombre",
  "tipoClienteId",
  "documentoTipo",
  "documentoNumero",
  "representanteLegal",
  "email",
  "telefono",
  "notas",
] as const;

type Campo = (typeof CAMPOS)[number];

/**
 * Un correo mínimamente creíble: algo, una arroba, algo, un punto, algo, y
 * ningún espacio.
 *
 * Deliberadamente laxo. Validar correos con una expresión regular estricta es
 * una forma conocida de rechazar direcciones reales, y acá el costo de un
 * falso rechazo es alto: el bufete pierde el prospecto. Lo que esta forma sí
 * atrapa es lo que de verdad pasa — un nombre, un "no tiene", un teléfono
 * escrito en el campo equivocado.
 */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function falla(campo: Campo, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/** Texto recortado, o `null` si no quedó nada. Nunca cadena vacía. */
function recortar(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

export function esCorreoCreible(correo: string): boolean {
  return FORMA_DE_CORREO.test(correo);
}

/**
 * Un teléfono tiene que tener al menos un dígito.
 *
 * No se valida el formato: los números llegan como "+507 6123-4567", como
 * "6123 4567", con extensión y con anotaciones ("casa"), y un formato impuesto
 * haría que el alta de un minuto se vuelva una pelea. Lo que no puede pasar es
 * que el campo tenga texto sin un solo dígito y el sistema lo cuente como
 * medio de contacto.
 */
export function esTelefonoCreible(telefono: string): boolean {
  return /\d/.test(telefono);
}

/**
 * De un cuerpo JSON cualquiera a datos de cliente, o a la lista de por qué no.
 *
 * Devuelve **todas** las fallas, no la primera: un formulario que corrige de a
 * un error por envío es el formulario que hace que nadie cargue clientes.
 */
export function normalizarDatos(cuerpo: unknown): Normalizacion {
  if (typeof cuerpo !== "object" || cuerpo === null || Array.isArray(cuerpo)) {
    return { ok: false, fallas: [falla("nombre", "tipo_invalido")] };
  }

  const crudo = cuerpo as Record<string, unknown>;
  const fallas: FallaDeValidacion[] = [];
  const texto: Record<Campo, string | null> = {
    nombre: null,
    tipoClienteId: null,
    documentoTipo: null,
    documentoNumero: null,
    representanteLegal: null,
    email: null,
    telefono: null,
    notas: null,
  };

  for (const campo of CAMPOS) {
    const valor = crudo[campo];

    if (valor === undefined || valor === null) continue;
    if (typeof valor !== "string") {
      fallas.push(falla(campo, "tipo_invalido"));
      continue;
    }

    // Los correos se guardan en minúsculas, igual que los compara la puerta
    // de acceso (`worker/acceso/identidad.ts`). Una sola caja en todo el
    // sistema, o mañana hay dos filas para la misma persona.
    texto[campo] =
      campo === "email" ? recortar(valor.toLowerCase()) : recortar(valor);
  }

  if (texto.nombre === null) fallas.push(falla("nombre", "nombre_requerido"));

  const correoUtil = texto.email !== null && esCorreoCreible(texto.email);
  const telefonoUtil =
    texto.telefono !== null && esTelefonoCreible(texto.telefono);

  if (texto.email !== null && !correoUtil) {
    fallas.push(falla("email", "correo_invalido"));
  }
  if (texto.telefono !== null && !telefonoUtil) {
    fallas.push(falla("telefono", "telefono_invalido"));
  }

  // La regla del criterio de T-5. Se mide sobre contactos **utilizables**:
  // un correo que no es un correo no deja al cliente contactable.
  if (!correoUtil && !telefonoUtil) {
    fallas.push(falla("telefono", "contacto_requerido"));
  }

  // Un tipo de documento sin número no identifica a nadie, y un número sin
  // tipo no se sabe leer. El par va junto o no va.
  if ((texto.documentoTipo === null) !== (texto.documentoNumero === null)) {
    fallas.push(
      falla(
        texto.documentoTipo === null ? "documentoTipo" : "documentoNumero",
        "documento_incompleto",
      ),
    );
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      // `nombre` ya quedó comprobado arriba; el `??` es para el compilador.
      nombre: texto.nombre ?? "",
      tipoClienteId: texto.tipoClienteId,
      documentoTipo: texto.documentoTipo,
      documentoNumero: texto.documentoNumero,
      representanteLegal: texto.representanteLegal,
      email: texto.email,
      telefono: texto.telefono,
      notas: texto.notas,
    },
  };
}
