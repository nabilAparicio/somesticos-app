# Inicio as a dashboard for the signed-in user

Branch: `feat/inicio-tablero` (worktree `../app-cotizador-worktrees/inicio-tablero`, from `main`).

## Objective

Inicio today shows static prose and a `/api/health` card grid: no business data.
Turn it into the first screen a lawyer opens: what is waiting on *me*, and how
quotations moved this month.

## Scope (authorized by the user, 2026-10-27)

- **My pending items**: open `pendiente`s across every open `proceso` where the
  signed-in user is `responsable`, grouped overdue / today / next 7 days, linked
  to their proceso. Plus my quotations to act on: my `borrador`s, and my
  `emitida`s whose `venceEn` is within 7 days or already passed.
- **Monthly KPIs by state, the four kept separate**: `borrador`, `emitida`,
  `ganada`, `perdida` (counts only). Win rate = ganadas / (ganadas + perdidas).
  Scope toggle: mine / whole firm.
- **Charts**: last 6 months by state (bars), and the current distribution by
  state.

Out of scope: **no money KPIs** (user decision), no roles, no new bitácora
entity or verb, no migration.

## Constraints

- Another session works on `feat/plantillas-de-modulo`. Stay off
  `worker/cotizaciones/*`, `src/pantallas/cotizaciones/*` (except importing
  read-only helpers), `src/ruteo.ts`, `src/App.tsx`, `src/estilos/layout.css`.
- `worker/index.ts` and `worker/contract.ts` are unavoidable: append at the end
  of the relevant section only, no reflow or reorder.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` are safe; `pnpm test:e2e` and
  `wrangler d1 execute --local` share state with the other session: ask first.
- Charts are hand-built SVG on `tokens.css`: two simple charts do not justify
  a runtime dependency (bundle, theming, one more thing to keep current).

## Tasks

- [x] **T-1** `GET /api/inicio`: new `worker/inicio/*` feature, contract types,
  wiring, `test/inicio-api.spec.ts` (RED first).
  Route: delegated (2+ non-trivial files).
- [ ] **T-2** Inicio screen: pending lists, KPI row, scope toggle, two SVG
  charts, `test/inicio-ui.spec.ts`. Route: delegated (2+ non-trivial files).

## Acceptance

- A user sees only pendientes where they are responsable, and only open ones.
- Month counts per state match the bitácora transition moments (emitted, won,
  lost) and `creadaEn` for drafts, scoped by tenant, and by `creadaPor` when
  "mine".
- `pnpm test`, `pnpm typecheck`, `pnpm lint` green.

## Checks

`pnpm test`, `pnpm typecheck`, `pnpm lint`. e2e only after coordinating.

## Progress

- Worktree created from `main` at `965bc46`.
- T-1 done (delegated writer). RED: `pnpm vitest run test/inicio-api.spec.ts`
  14 failed / 1 passed (the 403 gate test passes before the route exists).
  GREEN: 15/15. Mutation check: reading months in UTC (`+0 hours`) turns the
  Panama month-boundary test red. Full `pnpm test`: 50 files, 2531 tests green.
  Decisions: transitions count **distinct** cotizaciones per month and verb;
  "mine" filters transitions by `creada_por` (owner), not by who signed the
  bitácora row; unknown `alcance` is 422 `tipo_invalido`, absent is `mio`;
  the response carries `hoy` (Panama) so the screen groups against the same
  day the server used. Panama offset is derived from `finDelDiaEnPanama`,
  not rewritten.
