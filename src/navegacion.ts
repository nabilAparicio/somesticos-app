/**
 * El lado del ruteo que sí toca el navegador.
 *
 * Está separado de `src/ruteo.ts` a propósito: ahí vive la resolución pura,
 * que se prueba sin montar un DOM; acá vive lo que empuja la historia.
 *
 * La navegación se anuncia con un `popstate` sintético en vez de un canal
 * propio porque `App` ya escucha ese evento para que el botón de atrás
 * funcione. Un segundo mecanismo en paralelo serían dos formas de cambiar de
 * pantalla que hay que acordarse de mantener iguales.
 */

export function navegarA(href: string): void {
  if (window.location.pathname === href) return;

  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * `true` cuando el clic sobre un enlace lo tiene que manejar el navegador y
 * no nosotros: pestaña nueva, ventana nueva, descarga, botón del medio. Un
 * `preventDefault()` incondicional rompe el ctrl-clic, que es exactamente lo
 * que alguien hace para abrir tres clientes a la vez.
 */
export function esClicDelNavegador(evento: {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}): boolean {
  return (
    evento.defaultPrevented ||
    evento.button !== 0 ||
    evento.metaKey ||
    evento.ctrlKey ||
    evento.shiftKey ||
    evento.altKey
  );
}
