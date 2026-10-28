# Armazón accesible

**Objective:** fix the findings of the better-interface review of the app shell (verdict Block).
**Branch:** `fix/armazon-accesible`
**Scope:** `src/layout/Esqueleto.tsx`, `src/estilos/layout.css`, `src/estilos/base.css`, `src/navegacion.ts`, `e2e/armazon.spec.ts`, `e2e/navegacion.spec.ts`.
**Out of scope:** screen content inside `<main>`, forms, tables, print sheet.
**Delivery strategy:** ask-on-risk. Forecast: ~150 authored changed lines.

## Tasks

- [x] T-1 (HIGH) Contrast of «Identificando…»: `layout.css:321` uses `--color-tinta-apagada` instead of `--color-borde-fuerte` (1.83:1 → 6.26:1). Route: delegated (writer, with T-2..T-6).
- [x] T-2 (HIGH) Unrecoverable identity error: `Esqueleto.tsx:244` names the recovery path («Salir» and sign in again).
- [x] T-3 (MEDIUM) Focus and title on navigation: Escape returns focus to «Secciones»; route change sets `document.title` and moves focus to `<main tabIndex={-1}>`.
- [x] T-4 (MEDIUM) Skip link «Saltar al contenido» to `#contenido`, visible only on focus.
- [x] T-5 (MEDIUM) Short viewports: `@media (max-height: 30rem)` lets the page scroll instead of the inner `100svh` box.
- [x] T-6 (MEDIUM/LOW) Hover rules under `@media (hover: hover)`; «Diagnóstico» nav section only in `import.meta.env.DEV`; delete the dead velo transition.

## Acceptance criteria

- E2E covers: focus returns after Escape, focus lands in `<main>` after choosing a section, title changes per route, skip link reaches `#contenido`.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e -- armazon navegacion` pass.

## Progress

- Route: one delegated writer (2+ non-trivial files: Esqueleto.tsx, layout.css, e2e specs).
- T-1..T-6 done in one work-unit commit on this branch (`fix: el armazón se navega con teclado y lector (T-1..T-6)`).
- T-2 deviation: the copy keeps the lead «Sin identidad reconocida (…)» and appends «Usa «Salir» y vuelve a entrar con tu cuenta del bufete.», because `e2e/identidad.spec.ts` asserts that lead text and is outside the authorized surface.
- T-6: e2e runs against the Vite dev server (`import.meta.env.DEV` true), so the «Diagnóstico» link stays visible to `e2e/navegacion.spec.ts`; only its exemption note changed.

## Verification evidence

- RED (before implementation): the 6 new tests in `e2e/armazon.spec.ts` › «el foco y el título siguen a la navegación (T-3, T-4)» failed — focus not on «Secciones» after Escape, `main#contenido` not found, title `Bufete` instead of `Inicio · Bufete`/`Clientes · Bufete`, skip link not found.
- GREEN: same 6 pass.
- `npm run typecheck`: exit 0. `npm run lint`: clean. `npm test`: 56 files, 2829 tests passed.
- `npx playwright test e2e/armazon.spec.ts e2e/navegacion.spec.ts e2e/identidad.spec.ts`: 38 passed. `e2e/sin-scroll-horizontal.spec.ts e2e/impresion.spec.ts`: 69 passed.

## Next step

Native review assessment of the work-unit commit; then push/PR is the user's decision.
