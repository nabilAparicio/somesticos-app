/**
 * El detalle de un cliente.
 *
 * Los campos van en una lista de definiciones dentro de una rejilla que se
 * reacomoda sola: a 320px es una columna, en escritorio son varias, y no hay
 * un breakpoint escrito a mano (`docs/diseno.md` §9).
 *
 * Lo que todavía no está, y se nota: los procesos del cliente. Son T-7. Esta
 * pantalla es el lugar donde van a colgar.
 */
import { useEffect, useState } from "react";

import type { Cliente } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { enlaceDe } from "../../ruteo";
import { cargarCliente, textoDeProblema } from "./api";
import { VACIO, documentoDe, fechaLegible, tipoDe } from "./presentacion";

type Props = {
  readonly id: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; cliente: Cliente }
  | { fase: "problema"; mensaje: string };

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="definicion">
      <dt className="definicion__rotulo">{rotulo}</dt>
      <dd className="definicion__valor">{valor}</dd>
    </div>
  );
}

export function DetalleDeCliente({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    const control = new AbortController();

    void cargarCliente(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", cliente: resultado.valor }
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
          <Enlace href={enlaceDe({ nombre: "clientes" })}>
            Volver a clientes
          </Enlace>
        </p>
      </Pila>
    );
  }

  const { cliente } = estado;

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "clientes" })}>Clientes</Enlace>
          </p>
          <Fila alinear="entre">
            <h1>{cliente.nombre}</h1>
            <Enlace
              href={enlaceDe({ nombre: "cliente-edicion", id: cliente.id })}
              className="boton"
            >
              Editar
            </Enlace>
          </Fila>
        </Pila>
      </header>

      <Rejilla minimo="16rem">
        <dl className="definiciones">
          <Dato rotulo="Tipo" valor={tipoDe(cliente)} />
          <Dato rotulo="Documento" valor={documentoDe(cliente)} />
          <Dato
            rotulo="Representante legal"
            valor={cliente.representanteLegal ?? VACIO}
          />
        </dl>
        <dl className="definiciones">
          <Dato rotulo="Teléfono" valor={cliente.telefono ?? VACIO} />
          <Dato rotulo="Correo" valor={cliente.email ?? VACIO} />
          <Dato
            rotulo="Alta"
            valor={`${fechaLegible(cliente.creadoEn)} · ${
              cliente.creadoPorNombre ?? VACIO
            }`}
          />
        </dl>
      </Rejilla>

      <section aria-labelledby="notas-del-cliente">
        <Pila>
          <h2 id="notas-del-cliente">Notas</h2>
          {cliente.notas === null ? (
            <p className="texto-apagado">Sin notas.</p>
          ) : (
            <Prosa>
              <p className="notas">{cliente.notas}</p>
            </Prosa>
          )}
        </Pila>
      </section>
    </Pila>
  );
}
