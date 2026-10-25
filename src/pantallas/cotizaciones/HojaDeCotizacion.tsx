/**
 * La hoja imprimible de una cotización (T-6).
 *
 * Es el papel: lo que el cliente tiene delante. Sin controles del ciclo de
 * vida, sin editores, sin bitácora y sin nada que se pueda apretar — lo
 * único que no es documento es la franja de arriba, que no se imprime.
 *
 * ## De dónde salen los datos, que es toda la tarea
 *
 * > **De `GET /api/cotizaciones/{id}/documento`, y de ninguna otra parte.**
 *
 * Este componente hace **una sola lectura**, y es la del documento
 * congelado. No pide `/modulos`, no pide `/lineas` y no pide la cotización
 * viva, y las tres ausencias son la decisión: una cotización emitida en
 * marzo tiene que imprimirse igual en septiembre aunque al cliente le hayan
 * cambiado el nombre, aunque el trámite se llame distinto y aunque el
 * catálogo haya movido un rótulo. Si imprimiera lo que hay hoy, T-4 entero
 * —la emisión, el snapshot, los cinco disparadores de `0006`— sería
 * decoración.
 *
 * Y no se sostiene con disciplina: `impresion.ts` sólo acepta
 * `DocumentoCongelado`, así que pasarle lo que el detalle ya tiene en
 * pantalla **no compila**.
 *
 * ## Tampoco se suma nada
 *
 * Los subtotales y el total llegan adentro del documento y se muestran tal
 * cual. El total que el cliente vio es un hecho histórico: recalcularlo
 * desde las líneas congeladas el día que la aritmética cambie —el ITBMS de
 * T-12, un redondeo— daría un número que nadie le prometió a nadie.
 *
 * ## Lo que el documento congelado NO tiene, y por eso no se imprime
 *
 * **Los datos del bufete.** `congelar` no guarda ninguno, y la tabla
 * `tenant` no tiene más que `id` y `nombre` —ni RUC, ni dirección, ni
 * membrete—, así que no hay nada que poner en el encabezado ni siquiera
 * yendo a buscarlo. Leerlo vivo tampoco serviría: sería el dato de hoy
 * sobre un papel de marzo, que es exactamente lo que esta pantalla existe
 * para no hacer. Queda como lo que es, una pregunta abierta para quien
 * amplíe el snapshot, y no disfrazado de omisión de esta pantalla. Lo
 * único del bufete que el documento sí congeló es **quién la emitió**, y va
 * en el pie.
 *
 * ## Un borrador no se imprime
 *
 * La API contesta 409 y acá se dice por qué, con la frase de
 * `AVISO_SIN_DOCUMENTO`. El argumento completo de por qué no hay una vista
 * previa rotulada está ahí, en `impresion.ts`, al lado del texto.
 */
import { useEffect, useState } from "react";

import type { DocumentoCongelado } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { enlaceDe } from "../../ruteo";
import { cargarDocumento, textoDeProblema } from "./api";
import {
  AVISO_DEL_TOTAL,
  AYUDA_DE_LA_HOJA,
  ROTULO_DE_IMPRIMIR,
  ROTULO_DE_VOLVER,
  datosDeLaPropuesta,
  datosDelCliente,
  esBorradorSinDocumento,
  familiasDelDocumento,
  hayGastoEnElDocumento,
  pieDelDocumento,
  textoDeProblemaDeLaHoja,
  tituloDeLaHoja,
} from "./impresion";
import { importeLegible, renglonDelImpuesto } from "./lineas";

type Props = {
  readonly id: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; documento: DocumentoCongelado }
  /** `borrador` separa el 409 esperable de un fallo de verdad. */
  | { fase: "problema"; mensaje: string; borrador: boolean };

/** Una fila de la ficha del cliente o del encabezado de la propuesta. */
function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="hoja__dato">
      <dt className="hoja__dato-rotulo">{rotulo}</dt>
      <dd className="hoja__dato-valor">{valor}</dd>
    </div>
  );
}

export function HojaDeCotizacion({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    const control = new AbortController();

    void cargarDocumento(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", documento: resultado.valor }
          : {
              fase: "problema",
              mensaje: textoDeProblemaDeLaHoja(resultado, (otro) =>
                textoDeProblema(otro),
              ),
              borrador: esBorradorSinDocumento(resultado),
            },
      );
    });

    return () => {
      control.abort();
    };
  }, [id]);

  const documento = estado.fase === "listo" ? estado.documento : null;

  /**
   * El título de la pestaña, que es **el nombre que el diálogo de impresión
   * le propone al archivo**.
   *
   * «Imprimir a PDF» lo saca de `document.title`, así que sin esto el papel
   * del bufete se guardaría con el título del armazón. Es un efecto y no un
   * `<title>` porque esta aplicación no tiene un componente de cabecera: el
   * `index.html` trae el suyo y nadie más lo toca.
   *
   * El `return` lo restituye al desmontar. Sin eso, volver al detalle
   * dejaría la pestaña nombrando una cotización que ya no se está mirando,
   * y el siguiente «Imprimir a PDF» de cualquier otra pantalla propondría
   * ese nombre.
   */
  useEffect(() => {
    if (documento === null) return;

    const anterior = document.title;
    document.title = tituloDeLaHoja(documento);

    return () => {
      document.title = anterior;
    };
  }, [documento]);

  if (estado.fase === "cargando") return <p>Consultando…</p>;

  if (estado.fase === "problema") {
    return (
      <Pila>
        {/*
          El aviso del borrador va en tono neutro y el resto en error, y la
          diferencia no es cosmética: que una cotización todavía no se haya
          emitido no es un fallo de nada, es el estado corriente de la mitad
          de las cotizaciones del bufete. Pintarlo de rojo haría buscar un
          problema donde lo que hay es una tarea pendiente.
        */}
        <Aviso tono={estado.borrador ? "neutro" : "error"}>
          {estado.mensaje}
        </Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "cotizacion", id })}>
            {ROTULO_DE_VOLVER}
          </Enlace>
        </p>
      </Pila>
    );
  }

  const familias = familiasDelDocumento(estado.documento);
  const { moneda } = estado.documento.cotizacion;

  // El impuesto del documento congelado, o `null` si no llevaba (T-12). **Es
  // la misma función que usa el editor**, para que el borrador y el papel no
  // puedan decidir distinto cuándo hay renglón de ITBMS.
  const impuesto = renglonDelImpuesto(estado.documento.totales);

  return (
    <Pila espacio="holgado">
      {/*
        La franja de controles. Lleva `.solo-pantalla` y es lo único de esta
        pantalla que `@media print` esconde además de la navegación del
        armazón: todo lo demás es documento.
      */}
      <div className="solo-pantalla">
        <Pila espacio="ceñido">
          <Fila alinear="entre">
            <Enlace href={enlaceDe({ nombre: "cotizacion", id })}>
              {ROTULO_DE_VOLVER}
            </Enlace>
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => {
                window.print();
              }}
            >
              {ROTULO_DE_IMPRIMIR}
            </button>
          </Fila>
          <p className="texto-apagado">{AYUDA_DE_LA_HOJA}</p>
        </Pila>
      </div>

      <article className="hoja" aria-label="Documento de la cotización">
        <header className="hoja__encabezado">
          <h1 className="hoja__titulo">Propuesta de servicios</h1>
          <dl className="hoja__datos">
            {datosDeLaPropuesta(estado.documento).map((dato) => (
              <Dato key={dato.rotulo} rotulo={dato.rotulo} valor={dato.valor} />
            ))}
          </dl>
        </header>

        <section className="hoja__cliente">
          <h2 className="hoja__seccion">Cliente</h2>
          <p className="hoja__cliente-nombre">{estado.documento.cliente.nombre}</p>
          <dl className="hoja__datos">
            {datosDelCliente(estado.documento).map((dato) => (
              <Dato key={dato.rotulo} rotulo={dato.rotulo} valor={dato.valor} />
            ))}
          </dl>
        </section>

        {/*
          Los módulos de prosa, en el orden del documento. El orden **es** la
          posición en el arreglo: el snapshot no guarda un `orden` al lado
          porque sería un segundo lugar diciendo lo mismo, así que acá no
          hay nada que ordenar y ordenar sería inventar un criterio.
        */}
        {estado.documento.modulos.map((modulo, posicion) => (
          <section
            key={`${modulo.tipo}-${String(posicion)}`}
            className="hoja__modulo"
          >
            <h2 className="hoja__seccion">{modulo.rotulo}</h2>
            <p className="hoja__prosa">{modulo.contenido}</p>
          </section>
        ))}

        {/*
          Las dos familias, después de la prosa: primero qué se va a hacer y
          después cuánto cuesta, que es el orden en que se lee una
          propuesta.
        */}
        {familias.map((familia) => (
          <section key={familia.clase} className="hoja__familia">
            <h2 className="hoja__seccion">{familia.rotulo}</h2>

            {familia.aviso !== null && (
              <p className="hoja__aviso">{familia.aviso}</p>
            )}

            <table className="hoja__tabla">
              <caption className="hoja__caption">
                {familia.rotulo}, con su {familia.rotuloDelSubtotal.toLowerCase()}
              </caption>
              <tbody>
                {familia.lineas.map((linea, posicion) => (
                  <tr
                    key={`${linea.concepto}-${String(posicion)}`}
                    className="hoja__linea"
                  >
                    <td className="hoja__concepto">
                      {linea.concepto}
                      {linea.tipoProceso !== null && (
                        <span className="hoja__tramite">
                          {linea.tipoProceso}
                        </span>
                      )}
                    </td>
                    <td className="hoja__importe numerico">
                      {importeLegible(linea.monto, moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="hoja__linea hoja__subtotal">
                  <th scope="row" className="hoja__concepto">
                    {familia.rotuloDelSubtotal}
                  </th>
                  <td className="hoja__importe numerico">
                    {importeLegible(familia.subtotal, moneda)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        ))}

        {/*
          El total. Va en su propio bloque y no como una fila más de la
          última tabla: es de las dos familias juntas, y colgarlo de la
          segunda lo haría leer como el subtotal de los gastos.
        */}
        <section className="hoja__total-bloque">
          <table className="hoja__tabla">
            <caption className="hoja__caption">El total de la propuesta</caption>
            <tbody>
              {/*
                El ITBMS, si el documento lo llevaba el día que se emitió
                (T-12).

                **Sale del documento congelado y no de un cálculo de hoy**, y
                ésa es la garantía entera de T-4 aplicada al impuesto: una
                propuesta emitida antes de que el bufete facturara ITBMS no
                tiene este renglón, y no lo va a tener nunca, aunque mañana el
                interruptor se encienda. El papel que el cliente guardó y éste
                dicen lo mismo para siempre.

                Y al revés: una emitida con impuesto lo conserva aunque el
                interruptor se apague.
              */}
              {impuesto !== null && (
                <tr className="hoja__linea hoja__impuesto">
                  <th scope="row" className="hoja__concepto">
                    {impuesto.rotulo}
                  </th>
                  <td className="hoja__importe numerico">
                    {importeLegible(impuesto.importe, moneda)}
                  </td>
                </tr>
              )}

              <tr className="hoja__linea hoja__total">
                <th scope="row" className="hoja__concepto">
                  Total
                </th>
                <td className="hoja__importe numerico">
                  {importeLegible(estado.documento.totales.total, moneda)}
                </td>
              </tr>
            </tbody>
          </table>

          {hayGastoEnElDocumento(estado.documento) && (
            <p className="hoja__aviso">{AVISO_DEL_TOTAL}</p>
          )}
        </section>

        <footer className="hoja__pie">
          <p>{pieDelDocumento(estado.documento)}</p>
        </footer>
      </article>
    </Pila>
  );
}
