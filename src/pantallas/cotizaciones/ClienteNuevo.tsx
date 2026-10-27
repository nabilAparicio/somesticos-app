/**
 * El modal que da de alta un cliente sin salir del alta de cotización.
 *
 * Las palabras del usuario, que son el criterio:
 *
 * > «Acá, al crear nueva cotización, debo ser capaz de crear un nuevo
 * > cliente. Imaginá un lead recién creado: requiere esto, una identidad
 * > rápida. Puede ser a través de un modal.»
 *
 * ## Qué es y qué no es
 *
 * **No es un segundo formulario de cliente.** La validación es
 * `validarBorrador` y el cuerpo que viaja lo arma `aPeticion`, las dos de
 * `clientes/formulario.ts` y sin una línea propia. Qué controles se dibujan
 * está en `cliente-nuevo.ts`, con el porqué. Lo único que este archivo agrega
 * es el diálogo y el cableado.
 *
 * Y desde el pedido del usuario —«Deja los campos opcionales, están bien. El
 * modal es compacto y tenemos espacio.»— es **la ficha completa**: los ocho
 * campos del borrador, con los mismos rótulos y las mismas ayudas que
 * `/clientes/nuevo`. El estado es un `BorradorDeCliente` entero y no un
 * subconjunto, así que no hay ninguna conversión entre lo que el modal tiene
 * y lo que la validación espera: son el mismo objeto.
 *
 * Por eso tampoco busca duplicados: «¿este cliente ya existe?» es un problema
 * real, pero es otro, y resolverlo a medias acá —comparando nombres, que es
 * lo único que se podría hacer sin diseñarlo— sería peor que no resolverlo.
 *
 * ## El `<dialog>` nativo, y la disciplina que ya se pagó
 *
 * Es el mismo elemento y el mismo trato que `ListaDeServicios.tsx`, y ahí
 * está el argumento largo: el velo es `::backdrop` y sale del mismo
 * `--color-velo`, la inercia de lo que queda detrás la da el navegador,
 * `Escape` no necesita un escucha global, el foco entra y **vuelve al botón
 * que abrió**, y un diálogo modal vive en la capa superior, así que no hay un
 * `z-index` que inventar.
 *
 * Y las dos mitades que ese componente midió en el navegador se repiten acá
 * porque son del elemento y no de aquella pantalla:
 *
 *  - `onCancel` y **no** `onClose`. `close` lo dispara también el `close()` de
 *    la limpieza del efecto, y con `<StrictMode>` —que `src/main.tsx` tiene
 *    puesto— React corre el efecto, su limpieza y el efecto otra vez: el modal
 *    se desmontaría en el mismo cuadro en que se abrió, y en el navegador eso
 *    se ve como un botón que no hace nada.
 *  - `useLayoutEffect` y no `useEffect`. La limpieza de un efecto pasivo corre
 *    **después** de que el nodo salió del documento, y `close()` sobre un
 *    `<dialog>` ya desprendido no devuelve el foco a ninguna parte: quien
 *    cierra con `Escape` aterriza en el `<body>`.
 *
 * ## El tipo de cliente se lee acá, y recién al abrirse
 *
 * El catálogo de tipos no lo pide el alta de cotización: lo pide este modal,
 * al montarse. Así la pantalla de siempre no paga una lectura por una puerta
 * que la mayoría de las veces no se abre.
 *
 * Y si esa lectura falla, **el modal sigue sirviendo**: el tipo es opcional
 * desde que nació, así que bloquear el alta por él convertiría un campo
 * prescindible en un requisito. Es la misma decisión que toma
 * `FormularioDeCliente.tsx`, por el mismo motivo.
 *
 * ## Dónde se ve lo que sale mal
 *
 * Adentro. Un aviso dibujado por la pantalla de atrás queda debajo del velo,
 * o sea en un lugar donde nadie lo puede leer mientras el modal está abierto,
 * y lo único visible sería un formulario que no hizo nada. Por eso este
 * componente tiene su propio estado de fallas y de problema en vez de
 * devolverlos al que lo abrió.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type {
  Cliente,
  FallaDeValidacion,
  TipoCliente,
} from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { cargarTipos, crearCliente, textoDeProblema } from "../clientes/api";
import {
  BORRADOR_VACIO,
  aPeticion,
  mensajeDeFalla,
  tiposSeleccionables,
  validarBorrador,
  type BorradorDeCliente,
  type CampoDelBorrador,
} from "../clientes/formulario";
import {
  AYUDA_DEL_CLIENTE_NUEVO,
  CAMPOS_DEL_CLIENTE_NUEVO,
  ROTULO_DE_CREAR_CLIENTE,
  TITULO_DEL_CLIENTE_NUEVO,
  esCampoDeProsa,
  esCampoDeTexto,
  type CampoDelClienteNuevo,
} from "./cliente-nuevo";

type Props = {
  /** El cliente recién nacido, para que quien abrió lo deje elegido. */
  readonly alCrear: (cliente: Cliente) => void;
  readonly alCerrar: () => void;
};

export function ClienteNuevo({ alCrear, alCerrar }: Props) {
  /*
   * Los identificadores de los controles salen de `useId` y no son literales
   * como los de `FormularioDeCliente.tsx`. La razón es que este modal vive
   * dentro de otra pantalla que ya tiene sus propios `campo-*`: un
   * `id="campo-nombre"` fijo acá sería un identificador duplicado el día que
   * alguien monte este modal sobre una pantalla que tenga un campo de nombre,
   * y un `<label for>` duplicado apunta al primero que encuentra.
   */
  const base = useId();
  const idDelTitulo = `cliente-nuevo-${base}`;
  const idDeLaIntro = `cliente-nuevo-intro-${base}`;
  const idDe = (campo: string) => `cliente-nuevo-${campo}-${base}`;
  /** El párrafo que aclara un campo, para que el campo pueda apuntarle. */
  const idDeLaAyudaDe = (campo: string) =>
    `cliente-nuevo-ayuda-${campo}-${base}`;

  const dialogo = useRef<HTMLDialogElement>(null);

  const [valores, setValores] = useState<BorradorDeCliente>(BORRADOR_VACIO);
  const [tipos, setTipos] = useState<TipoCliente[]>([]);
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /*
   * El modal se abre **una vez**, al montar, y existe sólo mientras está
   * abierto: quien lo monta es un `{abierto && …}` en el alta. Así no hay un
   * segundo estado «abierto» que pueda discrepar del de arriba, que es el
   * defecto clásico de envolver un `<dialog>` en React. El `open` del `if` y
   * el `useLayoutEffect` tienen su porqué medido en el encabezado.
   */
  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (elemento !== null && !elemento.open) elemento.showModal();

    return () => {
      if (elemento !== null && elemento.open) elemento.close();
    };
  }, []);

  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const resultado = await cargarTipos(control.signal);
      if (control.signal.aborted) return;

      // El catálogo que no carga no impide dar de alta: el tipo es opcional.
      // El desplegable queda con «Sin tipo» y su pie lo explica.
      if (resultado.estado === "ok") setTipos(resultado.valor);
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, []);

  function cambiar(campo: CampoDelBorrador, valor: string) {
    setValores((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;

    // El aviso temprano, con la validación compartida. La que manda es la del
    // Worker, y su respuesta se muestra igual más abajo.
    const previas = validarBorrador(valores);
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setGuardando(true);
    const resultado = await crearCliente(aPeticion(valores));
    setGuardando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      // Adentro, no detrás del velo. Y sin tocar lo tecleado: volver a
      // escribirlo sería el castigo por un fallo que no fue de nadie.
      setProblema(textoDeProblema(resultado));
      return;
    }

    alCrear(resultado.valor);
  }

  const seleccionables = tiposSeleccionables(tipos, valores.tipoClienteId);

  return (
    <dialog
      ref={dialogo}
      className="cliente-nuevo"
      aria-labelledby={idDelTitulo}
      /*
       * La línea de arriba es la descripción del diálogo, y se anuncia al
       * abrirlo. Antes era un `aria-describedby` de cada campo —cuando ese
       * párrafo llevaba la regla del contacto— y eso dejó de ser cierto al
       * mudarse la exigencia a las etiquetas: lo que esa línea dice ahora es
       * de qué es el formulario, o sea del diálogo entero.
       */
      aria-describedby={idDeLaIntro}
      /*
       * `onCancel` y **no** `onClose`: `Escape` cierra el diálogo sin pasar
       * por ningún manejador nuestro, así que hace falta escucharlo, pero
       * `close` lo dispara también la limpieza del efecto. El argumento
       * entero está en el encabezado y fue medido en `ListaDeServicios.tsx`.
       *
       * `preventDefault()` deja el diálogo abierto en el DOM y quien lo
       * cierra es el desmontaje, que es lo que `alCerrar` provoca. Sin eso
       * quedaría un cuadro con el diálogo cerrado y todavía montado, que es
       * el estado doble que este componente existe para no tener.
       */
      onCancel={(evento) => {
        evento.preventDefault();
        alCerrar();
      }}
      /*
       * Tocar el velo cierra. El clic en `::backdrop` llega al propio
       * `<dialog>`, así que la comparación con `currentTarget` distingue
       * «tocó afuera» de «tocó algo de adentro».
       *
       * Es una comodidad del mouse y no la única salida: el teclado ya tiene
       * `Escape`, y hay un botón «Cancelar».
       *
       * **No cierra mientras una escritura viaja.** Cerrar con el alta en
       * vuelo dejaría al cliente naciendo sin nadie que lo deje elegido, que
       * es la peor de las dos mitades: el lead quedó cargado y la cotización
       * sigue sin cliente.
       */
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !guardando) alCerrar();
      }}
    >
      <Pila>
        <div className="cliente-nuevo__encabezado">
          <h2 id={idDelTitulo}>{TITULO_DEL_CLIENTE_NUEVO}</h2>
        </div>

        {/*
          Una línea, y las etiquetas hacen el resto.

          Acá había dos párrafos: la regla del contacto y una aclaración de
          que el cliente no era de segunda. El primero se mudó a las
          etiquetas, que es donde una regla se lee a tiempo; el segundo se
          volvió falso cuando el modal pasó a preguntar la ficha completa, y
          lo que contestaba ya no tiene pregunta.
        */}
        <div className="cliente-nuevo__ayuda" id={idDeLaIntro}>
          <p className="texto-apagado">{AYUDA_DEL_CLIENTE_NUEVO}</p>
        </div>

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

        {/* Un formulario de verdad, con `onSubmit`: así funciona la tecla
            Enter y el navegador anuncia los campos como lo que son. Va acá
            dentro y no envolviendo al diálogo porque el alta de cotización ya
            es un `<form>`, y un formulario anidado no es HTML válido —por eso
            el diálogo se monta como hermano de aquél y no adentro. */}
        <form onSubmit={(evento) => void enviar(evento)} noValidate>
          <Pila espacio="holgado">
            {/*
              La rejilla lleva los campos cortos y el desplegable del tipo; la
              prosa va entera debajo. Es el mismo reparto que
              `FormularioDeCliente.tsx`, y no es una decisión de gusto: un
              `<textarea>` en una columna de 14rem da un renglón de cuarenta
              caracteres, que para una nota es menos útil que no tenerla.

              Quién va en cada mitad lo decide el dato —`control`— y no el
              nombre del campo: ver el porqué en `cliente-nuevo.ts`.
            */}
            <Rejilla minimo="14rem">
              {CAMPOS_DEL_CLIENTE_NUEVO.filter(esCampoDeTexto).map(
                ({ campo, rotulo, tipo, exigencia, ayuda }) => (
                  <div className="campo" key={campo}>
                    <Rotulo
                      para={idDe(campo)}
                      rotulo={rotulo}
                      exigencia={exigencia}
                    />
                    <input
                      id={idDe(campo)}
                      className="campo__control"
                      type={tipo}
                      /*
                       * La exigencia **no** necesita un `aria-describedby`:
                       * viaja dentro de la etiqueta, que es lo que un lector
                       * de pantalla anuncia al entrar al campo. Lo que sí
                       * necesita apuntar es la ayuda, que es un párrafo
                       * aparte y de otro modo nadie que no lo vea se entera.
                       */
                      aria-describedby={
                        ayuda === undefined
                          ? undefined
                          : idDeLaAyudaDe(campo)
                      }
                      value={valores[campo]}
                      onChange={(evento) => {
                        cambiar(campo, evento.target.value);
                      }}
                    />
                    {ayuda !== undefined && (
                      <p className="campo__ayuda" id={idDeLaAyudaDe(campo)}>
                        {ayuda}
                      </p>
                    )}
                  </div>
                ),
              )}

              <div className="campo">
                <Rotulo
                  para={idDe("tipo")}
                  rotulo="Tipo de cliente"
                  exigencia="opcional"
                />
                <select
                  id={idDe("tipo")}
                  className="campo__control"
                  value={valores.tipoClienteId}
                  onChange={(evento) => {
                    cambiar("tipoClienteId", evento.target.value);
                  }}
                >
                  <option value="">Sin tipo</option>
                  {seleccionables.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.nombre}
                    </option>
                  ))}
                </select>
                {seleccionables.length === 0 && (
                  <p className="campo__ayuda">
                    El catálogo de tipos no está disponible. El tipo se puede
                    poner después.
                  </p>
                )}
              </div>
            </Rejilla>

            {/*
              La prosa, a todo el ancho y debajo de la rejilla. Sale de la
              misma lista que los campos cortos —por eso es un `map` y no un
              `<textarea>` escrito a mano— y eso es lo que mantiene a la lista
              como la única descripción de lo que el modal pregunta.
            */}
            {CAMPOS_DEL_CLIENTE_NUEVO.filter(esCampoDeProsa).map(
              ({ campo, rotulo, exigencia, ayuda }) => (
                <div className="campo" key={campo}>
                  <Rotulo
                    para={idDe(campo)}
                    rotulo={rotulo}
                    exigencia={exigencia}
                  />
                  <textarea
                    id={idDe(campo)}
                    className="campo__control campo__control--prosa"
                    /*
                     * Los mismos cuatro renglones que el formulario completo,
                     * y por el mismo motivo: es el alto que el atributo deja
                     * si la hoja de estilos no carga. Con ella cargada manda
                     * el piso de `campo__control--prosa`, que son seis
                     * renglones y se puede estirar en vertical.
                     */
                    rows={4}
                    aria-describedby={
                      ayuda === undefined ? undefined : idDeLaAyudaDe(campo)
                    }
                    value={valores[campo]}
                    onChange={(evento) => {
                      cambiar(campo, evento.target.value);
                    }}
                  />
                  {ayuda !== undefined && (
                    <p className="campo__ayuda" id={idDeLaAyudaDe(campo)}>
                      {ayuda}
                    </p>
                  )}
                </div>
              ),
            )}

            <Fila>
              <button
                type="submit"
                className="boton boton--primario"
                disabled={guardando}
              >
                {guardando ? "Creando…" : ROTULO_DE_CREAR_CLIENTE}
              </button>
              <button
                type="button"
                className="boton boton--tenue"
                disabled={guardando}
                onClick={alCerrar}
              >
                Cancelar
              </button>
            </Fila>
          </Pila>
        </form>
      </Pila>
    </dialog>
  );
}

/**
 * La etiqueta de un campo, con la marca de lo que exige pegada al nombre.
 *
 * Vive acá y no repetida en cada control porque el modal dibuja tres clases
 * de control —`<input>`, `<select>` y `<textarea>`— y los tres llevan la
 * misma etiqueta. La versión anterior de este archivo la escribía dos veces,
 * y la copia del desplegable tenía la marca «· opcional» escrita a mano: dos
 * dibujos de la misma cosa, de los cuales uno no obedecía al dato.
 *
 * La exigencia se dibuja desde el dato y no con un condicional por caso: son
 * tres estados —«obligatorio», «uno de los dos», «opcional»— y el único que
 * se dibuja apagado es el que no pide nada.
 */
function Rotulo({
  para,
  rotulo,
  exigencia,
}: {
  readonly para: string;
  readonly rotulo: string;
  readonly exigencia: CampoDelClienteNuevo["exigencia"];
}) {
  return (
    <label className="campo__rotulo" htmlFor={para}>
      {rotulo}
      <span
        className={
          exigencia === "opcional"
            ? "campo__marca campo__marca--tenue"
            : "campo__marca"
        }
      >
        {` · ${exigencia}`}
      </span>
    </label>
  );
}
