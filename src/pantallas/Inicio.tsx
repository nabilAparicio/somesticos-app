/**
 * Inicio: lo primero que alguien abre. Qué me espera a mí —mis pendientes,
 * mis cotizaciones por atender— y cómo se movieron las cotizaciones este mes
 * (`odd/tasks/inicio-tablero.md`).
 *
 * Es el contenedor: pide los datos y decide qué fase mostrar. El dibujo vive
 * en `src/pantallas/inicio/`, y lo que se decide sin React en su
 * `presentacion.ts`, con pruebas.
 *
 * **El alcance cambia los números, no lo mío.** «Mías / Del bufete» mueve
 * los indicadores y los dos gráficos; mis pendientes y mis cotizaciones son
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
import { Enlace } from "../layout/Enlace";
import { Pila } from "../layout/Pila";
import { Prosa } from "../layout/Prosa";
import { Rejilla } from "../layout/Rejilla";
import { GraficoDeDistribucion } from "./inicio/GraficoDeDistribucion";
import { GraficoDeSerie } from "./inicio/GraficoDeSerie";
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
      <header>
        <h1>Procesos del bufete</h1>
      </header>

      {/*
        Esta prosa describe lo que el sistema hace **hoy**, en presente, y por
        eso no nombra nada como «lo que sigue».

        La versión anterior era de T-5 y prometía como futuro el catálogo, las
        plantillas de etapas y el plan de trabajo: las tres estaban entregadas
        desde T-6, T-7 y T-11, y el texto siguió diciendo lo contrario seis
        tajadas. Es la misma clase de defecto que la revisión marcó en una
        migración y que ya se corrigió dos veces en comentarios: texto que
        caduca porque habla en futuro de algo que después pasa.

        Quien agregue una capacidad nueva agrega acá su frase en presente. Lo
        que **no** se vuelve a escribir es una promesa.
      */}
      <Prosa>
        <p>
          El bufete lleva acá sus <Enlace href="/clientes">clientes</Enlace> —
          dar de alta un prospecto cuesta un nombre y un teléfono, que es lo
          que se sabe de alguien que acaba de llamar — y sus{" "}
          <Enlace href="/catalogos">catálogos</Enlace> de áreas y tipos de
          proceso, cada tipo con su plantilla de etapas.
        </p>
        <p>
          Con eso se abre un <Enlace href="/procesos">proceso</Enlace>, que es
          donde está el trabajo: su plan de etapas, editable caso por caso sin
          tocar la plantilla; sus notas; sus pendientes con responsable y
          fecha de vencimiento; y su bitácora, que anota sola quién cambió qué
          y cuándo. Un proceso se cierra cuando termina, y se reabre si hacía
          falta.
        </p>
        <p>
          Debajo, cada quien ve lo que le espera: los pendientes abiertos a su
          nombre, sus borradores y sus cotizaciones emitidas que vencen pronto;
          y cuántas cotizaciones se abrieron, se emitieron, se ganaron y se
          perdieron este mes, las suyas o las de todo el bufete.
        </p>
      </Prosa>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {estado.fase === "listo" && (
        <Pila espacio="holgado">
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

              <Rejilla minimo="20rem">
                <section aria-labelledby="la-serie">
                  <Pila>
                    <h3 id="la-serie">Los últimos seis meses</h3>
                    <GraficoDeSerie serie={estado.datos.serie} />
                  </Pila>
                </section>
                <section aria-labelledby="la-distribucion">
                  <Pila>
                    <h3 id="la-distribucion">Dónde están hoy</h3>
                    <GraficoDeDistribucion
                      distribucion={estado.datos.distribucion}
                    />
                  </Pila>
                </section>
              </Rejilla>
            </Pila>
          </section>
        </Pila>
      )}
    </Pila>
  );
}
