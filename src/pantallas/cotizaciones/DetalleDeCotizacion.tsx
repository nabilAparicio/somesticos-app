/**
 * El detalle de una cotización.
 *
 * Los campos van en una lista de definiciones dentro de una rejilla que se
 * reacomoda sola: a 320px es una columna, en escritorio son varias, y no hay
 * un breakpoint escrito a mano (`docs/diseno.md` §9).
 *
 * Cuelga la bitácora, pedida por separado y por lo mismo que en la ficha del
 * cliente: son dos lecturas independientes, y un fallo del registro no puede
 * dejar la ficha en blanco.
 *
 * ## Lo que esta pantalla todavía no muestra, y por qué no lo insinúa
 *
 * No hay módulos ni líneas —son de la unidad C y de T-3—, no hay total —no
 * hay nada que sumar todavía, y cuando lo haya la aritmética es del sistema
 * y no de la pantalla— y no hay emitir, ganar, perder ni duplicar, que son
 * de T-4 y T-5. Nada de eso aparece apagado ni anunciado: un botón
 * deshabilitado promete una pantalla que no existe, y el criterio de este
 * proyecto es no dibujar puertas donde no hay puerta.
 *
 * «Editar» aparece **solo sobre un borrador**, que es lo único que la API
 * deja editar. El aviso de por qué no está vive en `avisoDeNoEsBorrador` y
 * se dibuja en su lugar: un botón que falta sin explicación se lee como un
 * defecto de la pantalla.
 */
import { useEffect, useState } from "react";

import type { Cotizacion } from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { enlaceDe } from "../../ruteo";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import {
  cargarBitacoraDeCotizacion,
  cargarCotizacion,
  textoDeProblema,
} from "./api";
import {
  VACIO,
  avisoDeNoEsBorrador,
  clienteDe,
  estaVencida,
  estadoLegible,
  fechaLegible,
  vencimientoDe,
} from "./presentacion";

type Props = {
  readonly id: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; cotizacion: Cotizacion }
  | { fase: "problema"; mensaje: string };

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="definicion">
      <dt className="definicion__rotulo">{rotulo}</dt>
      <dd className="definicion__valor">{valor}</dd>
    </div>
  );
}

export function DetalleDeCotizacion({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [bitacora, setBitacora] = useState<EstadoDeBitacora>({
    fase: "cargando",
  });

  useEffect(() => {
    const control = new AbortController();

    void cargarCotizacion(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", cotizacion: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    void cargarBitacoraDeCotizacion(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setBitacora(
        resultado.estado === "ok"
          ? { fase: "listo", entradas: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    return () => {
      control.abort();
    };
  }, [id]);

  if (estado.fase === "cargando") return <p>Consultando…</p>;

  if (estado.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{estado.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "cotizaciones" })}>
            Volver a cotizaciones
          </Enlace>
        </p>
      </Pila>
    );
  }

  const { cotizacion } = estado;
  const bloqueo = avisoDeNoEsBorrador(cotizacion);
  const vencida = estaVencida(cotizacion, hoyEnPanama(new Date()));

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "cotizaciones" })}>
              Cotizaciones
            </Enlace>
          </p>
          <Fila alinear="entre">
            <h1>{cotizacion.codigo}</h1>
            {bloqueo === null && (
              <Enlace
                href={enlaceDe({
                  nombre: "cotizacion-edicion",
                  id: cotizacion.id,
                })}
                className="boton"
              >
                Editar
              </Enlace>
            )}
          </Fila>
        </Pila>
      </header>

      {bloqueo !== null && <Aviso>{bloqueo}</Aviso>}

      {vencida && (
        <Aviso>
          Este borrador tiene el vencimiento pasado. Se puede seguir editando
          sin tocarle la fecha —el vencimiento que ya estaba se reenvía tal
          cual—, pero conviene correrlo antes de mandarlo.
        </Aviso>
      )}

      <Rejilla minimo="16rem">
        <dl className="definiciones">
          <Dato rotulo="Estado" valor={estadoLegible(cotizacion)} />
          <Dato rotulo="Cliente" valor={clienteDe(cotizacion)} />
          <Dato rotulo="Moneda" valor={cotizacion.moneda} />
        </dl>
        <dl className="definiciones">
          <Dato rotulo="Vence" valor={vencimientoDe(cotizacion)} />
          <Dato rotulo="Abierta" valor={fechaLegible(cotizacion.fecha)} />
          <Dato
            rotulo="Alta"
            valor={`${fechaLegible(cotizacion.creadaEn)} · ${
              cotizacion.creadaPorNombre ?? VACIO
            }`}
          />
        </dl>
      </Rejilla>

      <Bitacora estado={bitacora} id="bitacora-de-la-cotizacion" />
    </Pila>
  );
}
