/**
 * Inicio: lo primero que alguien abre. Qué me espera a mí —mis pendientes,
 * mis cotizaciones por atender— y cómo se movieron las cotizaciones este mes
 * (`odd/tasks/inicio-tablero.md`).
 *
 * Es el contenedor: pide los datos y decide qué fase mostrar. El dibujo vive
 * en `src/pantallas/inicio/`, y lo que se decide sin React en su
 * `presentacion.ts`, con pruebas.
 *
 * **Primero el mes, después lo mío.** Los indicadores del mes abren la
 * pantalla; debajo, mis pendientes y mis cotizaciones por atender, lado a
 * lado. Los gráficos de seis meses y de la distribución se fueron: las
 * tarjetas ya dicen lo mismo, y dos dibujos que repiten cuatro números son
 * ruido entre la persona y lo que tiene que hacer.
 *
 * Sin título visible: el armazón ya dice dónde se está. El `h1` queda para
 * los lectores de pantalla, que navegan por encabezados.
 *
 * **El alcance cambia los números, no lo mío.** «Mías / Del bufete» mueve
 * los indicadores; mis pendientes y mis cotizaciones son
 * los míos en los dos casos, porque así lo contesta el servidor.
 *
 * Al cambiar de alcance **se queda lo que ya estaba** mientras llega lo
 * nuevo: vaciar la pantalla para volver a llenarla con casi lo mismo es un
 * parpadeo que no informa nada.
 *
 * ## Lo que se fue: el estado del sistema
 *
 * La portada mostraba `/api/health` en tres tarjetas. Era diagnóstico, no
 * trabajo, y la portada ahora es del trabajo. `/api/health` sigue existiendo
 * y sigue siendo público, que es para lo que está: para que lo mire un
 * monitor, no una persona.
 *
 * La identidad tampoco se lee acá: vive en el armazón
 * (`src/layout/Esqueleto.tsx`), permanente y en toda pantalla.
 */
import { useEffect, useState } from "react";

import type {
  AlcanceDelInicio,
  RespuestaDelInicio,
} from "../../worker/contract";
import { cargarInicio } from "../api/inicio";
import { textoDeProblema } from "../api/peticiones";
import { Aviso } from "../layout/Aviso";
import { Pila } from "../layout/Pila";
import { Rejilla } from "../layout/Rejilla";
import { Indicadores } from "./inicio/Indicadores";
import { MisCotizaciones } from "./inicio/MisCotizaciones";
import { MisPendientes } from "./inicio/MisPendientes";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; datos: RespuestaDelInicio }
  | { fase: "problema"; mensaje: string };

const ALCANCES: { valor: AlcanceDelInicio; rotulo: string }[] = [
  { valor: "mio", rotulo: "Mías" },
  { valor: "bufete", rotulo: "Del bufete" },
];

export function Inicio() {
  const [alcance, setAlcance] = useState<AlcanceDelInicio>("mio");
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  /** Qué alcance muestran los números que están en pantalla. */
  const [mostrado, setMostrado] = useState<AlcanceDelInicio | null>(null);

  useEffect(() => {
    const control = new AbortController();

    void cargarInicio(alcance, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setEstado({ fase: "listo", datos: resultado.valor });
        setMostrado(alcance);
      } else {
        setEstado({
          fase: "problema",
          mensaje: textoDeProblema(resultado, "ese tablero"),
        });
      }
    });

    return () => {
      control.abort();
    };
  }, [alcance]);

  const actualizando = estado.fase === "listo" && mostrado !== alcance;

  return (
    <Pila espacio="holgado">
      <h1 className="oculto-visualmente">Inicio</h1>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {estado.fase === "listo" && (
        <Pila espacio="holgado">
          <section aria-labelledby="el-mes" aria-busy={actualizando}>
            <Pila>
              <div className="inicio__cabecera">
                <h2 id="el-mes">Cotizaciones del mes</h2>
                <div
                  className="inicio__alcance"
                  role="group"
                  aria-label="De quién se cuentan"
                >
                  {ALCANCES.map((opcion) => (
                    <button
                      key={opcion.valor}
                      type="button"
                      className={
                        opcion.valor === alcance
                          ? "boton boton--primario"
                          : "boton"
                      }
                      aria-pressed={opcion.valor === alcance}
                      onClick={() => {
                        setAlcance(opcion.valor);
                      }}
                    >
                      {opcion.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <Indicadores mes={estado.datos.mes} />
            </Pila>
          </section>

          <Rejilla minimo="20rem">
            <MisPendientes
              pendientes={estado.datos.misPendientes}
              hoy={estado.datos.hoy}
            />
            <MisCotizaciones
              cotizaciones={estado.datos.misCotizaciones}
              hoy={estado.datos.hoy}
            />
          </Rejilla>
        </Pila>
      )}
    </Pila>
  );
}
