/**
 * El plan de pagos de una cotización (T-11, unidad B).
 *
 * **Este archivo no decide nada.** El cronograma, el cotejo contra el total,
 * las dos clases de cuota, la conversión entre puntos básicos y lo que la
 * persona escribe, y la validación del borrador viven en `./plan.ts`, que se
 * prueba sin navegador. Acá queda el cableado: qué botón llama a qué, qué se
 * dibuja mientras se espera y qué se muestra cuando el servidor dice que no.
 *
 * ## La pantalla no suma, no divide y no aplica porcentajes
 *
 * Es la barandilla de la tajada y acá se cumple **por omisión**: no hay un
 * solo operador aritmético sobre dinero en este archivo. El importe de cada
 * cuota, el total del plan y la base contra la que se compara salen de
 * `plan`, que es lo que el servidor manda en un solo cuerpo
 * (`PlanDePagos`), y las tres rutas lo traen entero.
 *
 * Por eso el estado guarda **un solo objeto** y no tres campos sueltos: las
 * cuotas, el total y la base se reemplazan juntos o no se reemplazan, y
 * separarlos sería el camino para que en algún redibujado el cronograma sea
 * el nuevo y el total el viejo. Es la misma forma que `EditorDeLineas` con
 * sus totales y que `PanelDeGastos` con su saldo.
 *
 * ## El residuo se ve, y la pantalla no lo arregla
 *
 * Tres cuotas del 33,33 % de mil dólares suman 999,90. Las dos cifras —la
 * suma del plan y el total de la cotización— se dibujan **una debajo de la
 * otra**, con el cotejo en palabras encima. La diferencia se lee comparando
 * dos renglones, y no hay ningún número que esta pantalla haya inventado:
 * el argumento entero está en `cotejoDelPlan`.
 *
 * **Sobre un plan sin cuotas el cotejo no se dibuja**, porque no hay plan
 * que cotejar. Quien lo decide es `cotejoDelPlan`, que devuelve `null`;
 * acá no hay una segunda condición que lo repita.
 *
 * ## Las dos clases se eligen con radios y no con un desplegable
 *
 * Y no es estética. Las dos opciones **cambian qué campo se dibuja debajo**
 * —un importe en dólares o un porcentaje—, y un desplegable esconde esa
 * consecuencia detrás de un clic que hay que dar para enterarse. Con dos
 * radios visibles, la ayuda de cada clase se lee sin elegirla, que es lo que
 * hace falta cuando «50» puede significar cincuenta dólares o la mitad del
 * encargo.
 *
 * Lo mismo con el disparador: una fecha y un hito piden controles distintos.
 *
 * **Hay un solo campo de cifra y uno solo de «cuándo» dibujado a la vez.** Un
 * segundo campo escondido guardaría lo que alguien escribió para la otra
 * opción y lo mandaría sin que se vea, que es exactamente la cuota con monto
 * **y** porcentaje que la migración rechaza. Con un campo por vez, esa fila
 * no se puede ni intentar desde acá.
 *
 * ## Lo que esta pantalla no ofrece
 *
 * **No hay «editar cuota»**, porque la ruta no existe: se quita y se vuelve a
 * poner. La ausencia del botón es cómo se dice eso, y el aviso de
 * `AVISO_LA_CUOTA_NO_SE_EDITA` lo explica para que no se lea como un defecto.
 *
 * **No hay nada que diga si una cuota se cobró**, y eso tiene su aviso
 * propio: `cuota` no tiene columna `pagada_en` porque registrar un cobro es
 * un modelo que este sistema todavía no tiene (`docs/diseno.md` §2). Una
 * lista de cuotas sin esa aclaración se lee como un estado de cuenta.
 *
 * ## El plan no se cierra al emitir, al revés que los dos editores
 *
 * `DetalleDeCotizacion` le pasa `editable` a `EditorDeModulos` y a
 * `EditorDeLineas` porque I-4 e I-5 congelan el documento al emitirlo. **A
 * esta sección no se lo pasa**, y es la decisión de la unidad A: las cuotas
 * no entran al snapshot, así que agregar una no toca lo que quedó congelado
 * — y es justo cuando una cotización se gana que el plan se termina de
 * acomodar. Cerrar la escritura al emitir dejaría imposible de cargar el
 * plan del caso mayoritario.
 */
import { useEffect, useState, type FormEvent } from "react";

import type { FallaDeValidacion, PlanDePagos as Plan } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import type { Resultado } from "../../api/peticiones";
import { agregarCuota, cargarPlan, quitarCuota, textoDeProblema } from "./api";
import {
  AVISO_EL_PLAN_NO_REGISTRA_COBROS,
  AVISO_LA_CUOTA_NO_SE_EDITA,
  AYUDA_DEL_PLAN,
  BORRADOR_DE_CUOTA_VACIO,
  COMO_SE_COBRA,
  COMO_SE_DISPARA,
  PLAN_VACIO,
  ROTULO_DE_LA_BASE,
  ROTULO_DE_LA_SUMA,
  clasesDeCuotaDisponibles,
  cotejoDelPlan,
  mensajeDeFalla,
  normalizarBorradorDeCuota,
  renglonesDelPlan,
  type BorradorDeCuota,
  type ClaseDeCuota,
  type DisparadorDeCuota,
} from "./plan";

type Props = {
  readonly cotizacionId: string;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

/** Un plan vacío, para antes de que llegue la primera respuesta. */
const PLAN_EN_BLANCO: Plan = { cuotas: [], total: 0, base: null };

const DISPARADORES: readonly DisparadorDeCuota[] = ["fecha", "hito"];

export function PlanDePagos({ cotizacionId }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  /**
   * **Del servidor, entero y siempre.** Las cuotas, el total y la base se
   * reemplazan juntos: es I-7 y la barandilla de la tajada, escritas como
   * estado.
   */
  const [plan, setPlan] = useState<Plan>(PLAN_EN_BLANCO);
  const [nueva, setNueva] = useState<BorradorDeCuota>(BORRADOR_DE_CUOTA_VACIO);
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    void cargarPlan(cotizacionId, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setPlan(resultado.valor);
        setCarga({ fase: "listo" });
        return;
      }

      setCarga({ fase: "problema", mensaje: textoDeProblema(resultado) });
    });

    return () => {
      control.abort();
    };
  }, [cotizacionId]);

  /**
   * El envoltorio por el que pasan las escrituras. Existe por el `finally`:
   * `pedir` devuelve un `Resultado` para todo lo que sabe que puede pasar,
   * pero su `respuesta.json()` del camino feliz no está cubierto, y un 200
   * con un cuerpo que no es JSON hace que la promesa **rechace**. Sin esto,
   * `ocupado` se quedaría arriba para siempre y la sección entera quedaría
   * muerta hasta recargar. Es el mismo recurso que `EditorDeLineas` y
   * `PanelDeGastos`.
   */
  async function conLaSeccionOcupada(accion: () => Promise<void>) {
    setOcupado(true);
    try {
      await accion();
    } catch {
      setProblema(
        "No se pudo completar la operación. Hay que volver a cargar la" +
          " página para ver cómo quedó el plan.",
      );
    } finally {
      setOcupado(false);
    }
  }

  /** Qué hacer con lo que contestó una escritura del plan. */
  function aplicar(resultado: Resultado<Plan>): boolean {
    if (resultado.estado === "ok") {
      setPlan(resultado.valor);
      setFallas([]);
      setProblema(null);
      return true;
    }

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      setProblema(null);
      return false;
    }

    setFallas([]);
    setProblema(textoDeProblema(resultado));
    return false;
  }

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const normalizado = normalizarBorradorDeCuota(nueva);
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    await conLaSeccionOcupada(async () => {
      const ok = aplicar(await agregarCuota(cotizacionId, normalizado.datos));
      // El borrador se vacía **sólo si el servidor lo guardó**: tirar lo que
      // alguien escribió porque el servidor dijo que no es perder trabajo
      // ajeno.
      if (ok) setNueva(BORRADOR_DE_CUOTA_VACIO);
    });
  }

  async function quitar(cuotaId: string) {
    if (ocupado) return;

    await conLaSeccionOcupada(async () => {
      aplicar(await quitarCuota(cotizacionId, cuotaId));
    });
  }

  if (carga.fase === "cargando") {
    return (
      <section aria-labelledby="plan-de-pagos">
        <Pila>
          <h2 id="plan-de-pagos">Plan de pagos</h2>
          <p>Consultando…</p>
        </Pila>
      </section>
    );
  }

  const renglones = renglonesDelPlan(plan.cuotas);
  const cotejo = cotejoDelPlan(plan);
  const clases = clasesDeCuotaDisponibles(plan.base);

  return (
    <section aria-labelledby="plan-de-pagos">
      <Pila>
        <h2 id="plan-de-pagos">Plan de pagos</h2>

        {carga.fase === "problema" ? (
          <Aviso tono="error">{carga.mensaje}</Aviso>
        ) : (
          <>
            <Prosa como="p" className="texto-apagado">
              {AYUDA_DEL_PLAN}
            </Prosa>

            <Aviso>{AVISO_EL_PLAN_NO_REGISTRA_COBROS}</Aviso>

            {problema !== null && <Aviso tono="error">{problema}</Aviso>}

            {fallas.length > 0 && (
              <Aviso tono="error">
                <ul className="lista-de-fallas">
                  {fallas.map((falla) => (
                    <li key={`${falla.campo}-${falla.motivo}`}>
                      {mensajeDeFalla(falla.motivo)}
                    </li>
                  ))}
                </ul>
              </Aviso>
            )}

            {/* ---------------------------------------------------------
                El cronograma. Un `<ol>` de verdad, igual que las líneas y
                los módulos: el orden **es** el dato —es el orden en que el
                abogado dictó el plan, y el que el servidor devuelve— así
                que el número lo pone el navegador.
                --------------------------------------------------------- */}
            {renglones.length === 0 ? (
              <p className="texto-apagado">{PLAN_VACIO}</p>
            ) : (
              <ol className="cuotas">
                {renglones.map((renglon) => (
                  <li className="cuota" key={renglon.id}>
                    <Pila espacio="ceñido">
                      <Fila alinear="entre">
                        <span className="cuota__concepto">
                          {renglon.concepto}
                          <span className="cuota__detalle">
                            {renglon.comoSeCobra} · {renglon.rotuloDelCuando}:{" "}
                            {renglon.cuando}
                          </span>
                        </span>
                        <span className="cuota__importe">
                          {renglon.importeLegible}
                        </span>
                      </Fila>

                      <Fila>
                        <button
                          type="button"
                          className="boton boton--tenue"
                          aria-label={`Quitar «${renglon.concepto}» del plan`}
                          disabled={ocupado}
                          onClick={() => void quitar(renglon.id)}
                        >
                          Quitar
                        </button>
                      </Fila>
                    </Pila>
                  </li>
                ))}
              </ol>
            )}

            {/* ---------------------------------------------------------
                El cotejo: lo que el plan suma, contra lo que la cotización
                cobra.

                Las dos cifras van **una debajo de la otra** y el titular en
                palabras encima: la diferencia se lee comparando dos
                renglones, y esta pantalla no resta nada. Ver
                `cotejoDelPlan`.

                Ningún color distingue los tres estados: lo dice el titular,
                que sobrevive a una impresora que no imprime fondos y a un
                lector de pantalla.

                **Y no se dibuja cuando no hay plan.** `cotejoDelPlan`
                devuelve `null` sobre un plan sin ninguna cuota, y esto se
                limita a escribir lo que devolvió: la decisión vive allá,
                donde se prueba sin navegador. Una segunda condición acá
                —«si hay renglones»— sería la otra mitad de la misma guarda,
                y entonces quitar cualquiera de las dos no mataría ninguna
                prueba.
                --------------------------------------------------------- */}
            {cotejo !== null && (
              <section aria-labelledby="cotejo-del-plan" className="cotejo">
                <Pila espacio="ceñido">
                  <h3 id="cotejo-del-plan" className="cotejo__titulo">
                    {cotejo.titular}
                  </h3>

                  <p className="cotejo__cifra cotejo__cifra--suma">
                    <span className="cotejo__rotulo">{ROTULO_DE_LA_SUMA}</span>
                    <span className="cotejo__importe">{cotejo.sumaLegible}</span>
                  </p>

                  {cotejo.baseLegible !== null && (
                    <p className="cotejo__cifra">
                      <span className="cotejo__rotulo">{ROTULO_DE_LA_BASE}</span>
                      <span className="cotejo__importe">
                        {cotejo.baseLegible}
                      </span>
                    </p>
                  )}

                  <Prosa como="p" className="texto-apagado">
                    {cotejo.explicacion}
                  </Prosa>
                </Pila>
              </section>
            )}

            <Aviso>{AVISO_LA_CUOTA_NO_SE_EDITA}</Aviso>

            {/* ---------------------------------------------------------
                Cargar una cuota. Va al final, igual que los formularios de
                nota, de pendiente y de movimiento: escribir no puede
                empujar hacia abajo lo que hay que leer.
                --------------------------------------------------------- */}
            <form onSubmit={(evento) => void agregar(evento)} noValidate>
              <Pila espacio="ceñido">
                <h3>Cargar una cuota</h3>

                <div className="campo">
                  {/*
                    **«Concepto de la cuota» y no «Concepto» a secas.** El
                    editor de líneas vive en esta misma página y su campo se
                    llama «Concepto»; `getByLabel` busca por subcadena, así
                    que dos rótulos donde uno contiene al otro vuelven
                    imposible apuntar a uno solo desde una prueba. Medido: con
                    «Concepto» pelado, tres pruebas de
                    `e2e/cotizaciones.spec.ts` dejaron de resolver.

                    Es la misma razón por la que el botón de abajo dice
                    «Cargar la cuota» y no «Agregar la cuota»: el de módulos
                    se llama «Agregar».
                  */}
                  <label className="campo__rotulo" htmlFor="cuota-concepto">
                    Concepto de la cuota
                    <span className="campo__marca"> · obligatorio</span>
                  </label>
                  <input
                    id="cuota-concepto"
                    className="campo__control"
                    type="text"
                    value={nueva.concepto}
                    onChange={(evento) => {
                      setNueva((anterior) => ({
                        ...anterior,
                        concepto: evento.target.value,
                      }));
                    }}
                  />
                  <p className="campo__ayuda">
                    Qué cobra esta cuota: «anticipo a la firma», «saldo contra
                    inscripción».
                  </p>
                </div>

                {/* Las clases salen de `clasesDeCuotaDisponibles`, no de una
                    lista escrita acá: con un plan sin base —el de un trámite
                    suelto— el porcentaje no se dibuja, porque el servidor lo
                    rechazaría y un control que existe es una promesa. */}
                <fieldset className="campo">
                  <legend className="campo__rotulo">
                    Cómo se cobra
                    <span className="campo__marca"> · obligatorio</span>
                  </legend>
                  {clases.map((clase) => (
                    <label className="campo__casilla" key={clase}>
                      <input
                        type="radio"
                        name="cuota-clase"
                        value={clase}
                        checked={nueva.clase === clase}
                        onChange={() => {
                          // La cifra se vacía al cambiar de clase: «50»
                          // escrito como importe no es «50» escrito como
                          // porcentaje, y arrastrarlo es el camino a cobrar
                          // cincuenta dólares donde iba la mitad del encargo.
                          setNueva((anterior) => ({
                            ...anterior,
                            clase,
                            cifra: "",
                          }));
                        }}
                      />
                      <span>
                        {COMO_SE_COBRA[clase].rotulo}
                        <span className="opcion__ayuda">
                          {COMO_SE_COBRA[clase].ayuda}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                {/* Un solo campo de cifra, y sólo cuando ya se eligió la
                    clase: su rótulo y su ayuda salen del mismo registro que
                    dibujó la opción, así que no pueden decir cosas distintas. */}
                {esClaseElegida(nueva.clase) && (
                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="cuota-cifra">
                      {COMO_SE_COBRA[nueva.clase].rotuloDelCampo}
                      <span className="campo__marca"> · obligatorio</span>
                    </label>
                    <input
                      id="cuota-cifra"
                      className="campo__control campo__control--importe"
                      type="text"
                      inputMode="decimal"
                      value={nueva.cifra}
                      onChange={(evento) => {
                        setNueva((anterior) => ({
                          ...anterior,
                          cifra: evento.target.value,
                        }));
                      }}
                    />
                    <p className="campo__ayuda">
                      {COMO_SE_COBRA[nueva.clase].ayudaDelCampo}
                    </p>
                  </div>
                )}

                <fieldset className="campo">
                  <legend className="campo__rotulo">
                    Cuándo se cobra
                    <span className="campo__marca"> · obligatorio</span>
                  </legend>
                  {DISPARADORES.map((disparador) => (
                    <label className="campo__casilla" key={disparador}>
                      <input
                        type="radio"
                        name="cuota-disparador"
                        value={disparador}
                        checked={nueva.disparador === disparador}
                        onChange={() => {
                          setNueva((anterior) => ({
                            ...anterior,
                            disparador,
                            venceEn: "",
                            hito: "",
                          }));
                        }}
                      />
                      <span>
                        {COMO_SE_DISPARA[disparador].rotulo}
                        <span className="opcion__ayuda">
                          {COMO_SE_DISPARA[disparador].ayuda}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <Rejilla minimo="12rem">
                  {nueva.disparador === "fecha" && (
                    <div className="campo">
                      <label className="campo__rotulo" htmlFor="cuota-vence">
                        Vence
                        <span className="campo__marca"> · obligatorio</span>
                      </label>
                      {/*
                        **Sin `min`**, al revés que el vencimiento de una
                        cotización. Cargar hoy el plan de un encargo que
                        empezó el mes pasado es el caso corriente, y su
                        primera cuota venció antes de que nadie la
                        escribiera. Es la misma decisión que tomó la unidad A
                        del lado del servidor.
                      */}
                      <input
                        id="cuota-vence"
                        className="campo__control"
                        type="date"
                        value={nueva.venceEn}
                        onChange={(evento) => {
                          setNueva((anterior) => ({
                            ...anterior,
                            venceEn: evento.target.value,
                          }));
                        }}
                      />
                    </div>
                  )}

                  {nueva.disparador === "hito" && (
                    <div className="campo">
                      <label className="campo__rotulo" htmlFor="cuota-hito">
                        Hito
                        <span className="campo__marca"> · obligatorio</span>
                      </label>
                      <input
                        id="cuota-hito"
                        className="campo__control"
                        type="text"
                        value={nueva.hito}
                        onChange={(evento) => {
                          setNueva((anterior) => ({
                            ...anterior,
                            hito: evento.target.value,
                          }));
                        }}
                      />
                      <p className="campo__ayuda">
                        {COMO_SE_DISPARA.hito.ayuda}
                      </p>
                    </div>
                  )}
                </Rejilla>

                <Fila>
                  <button
                    type="submit"
                    className="boton boton--primario"
                    disabled={ocupado}
                  >
                    {ocupado ? "Guardando…" : "Cargar la cuota"}
                  </button>
                </Fila>
              </Pila>
            </form>
          </>
        )}
      </Pila>
    </section>
  );
}

/**
 * Si lo que hay en el borrador es una de las dos clases.
 *
 * Es un estrechamiento y no una validación: lo que valida es
 * `normalizarBorradorDeCuota`. Acá sólo decide si hay un campo de cifra que
 * dibujar, y el tipo es lo que permite indexar `COMO_SE_COBRA` sin un `as`.
 */
function esClaseElegida(valor: string): valor is ClaseDeCuota {
  return valor === "monto_fijo" || valor === "porcentaje";
}
