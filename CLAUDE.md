# CLAUDE.md — ChiphiMKT v3

## 1. Tổng quan dự án

App quản lý chi phí / nghiệm thu MKT (UI tiếng Việt). React SPA + Vercel serverless API + Firestore.

**Stack**
- Frontend: React 19, Vite 6, TypeScript ~5.8, Tailwind CSS 4, shadcn/Base UI, react-router-dom 7, recharts, motion, sonner, next-themes (dark mode).
- Backend: Vercel Functions in `api/**/*.ts` (maxDuration 60s), using `firebase-admin` and `googleapis` (Drive, backups).
- Data: Firestore, **named database `chiphi-mkt` (LIVE)**. Rules are in `firestore.rules` and indexes in `firestore.indexes.json`, both configured in `firebase.json`. Staging uses the `chiphi-mkt-staging` database (`firebase.staging.json`, `firestore.indexes.staging.json`). Default Firebase project: `.firebaserc`.
- Tests: Vitest. Unit tests use `vitest.unit.config.ts`; Firestore rules tests use `vitest.rules.config.ts` and run against the Firestore emulator on port 8080.

**Cấu trúc**
- `src/`: client app (`main.tsx`, `App.tsx`, `AuthenticatedApp.tsx`, `LoginPage.tsx`, `firebase.ts`, `firestore-proxy.ts`, `components/`, `hooks/`, `lib/`, `vnext/`).
- `components/` (`layout`, `ui`), `lib/` (`routes.ts`, `utils.ts`, `vnext`), `hooks/`: shared code at the repo root.
- `api/`: serverless endpoints, each a `[action].ts` dispatcher: `backup/github`, `backup-drive`, `drive`, `nt-images`, `users`. Shared helpers are in `api/_lib/`.
- `server.ts`: local dev server (Express + Vite middleware, port 3000). It mounts `/api/backup/github/:action`. In production mode it serves `dist/`.
- `vercel.json`: SPA rewrite to `/index.html`, cache and security headers, and a daily cron that calls `/api/backup-drive/cron`.
- `scripts/`: data maintenance, migration and dry-run scripts. Many of them touch Firestore, so read a script before running it (see the rules below).
- `tests/`: `*.test.ts` (unit) and `*.rules.test.ts` (Firestore rules).
- `docs/`, `PROGRESS.md`: notes and progress log.

## 2. Quy tắc bắt buộc

- **Git:** never push to `main` or `clean-main`, and never force push. Work on a feature branch. Open a PR only when asked. **Pushing to `main` triggers a production deploy.**
- **Deploy:** never run `vercel deploy`, `firebase deploy`, or publish Firestore rules without explicit approval from Phong. Deploy to staging first.
- **Live data:** the app uses the **LIVE** Firestore database `chiphi-mkt`. Never write, migrate, or delete live data without explicit approval. Before any such change, take a backup, run a dry-run, and have a rollback plan ready.
- **Old site:** never touch the old site `chiphimkt.vercel.app`.
- **Secrets:** never commit secrets, `.env*` files, or PII. Never print tokens. `.env.example` is the template.
- **Firestore rules:** keep the rules under 1000 expressions and at most 10 `get()`/`exists()` reads per evaluation. Avoid adding new `get()` calls on hot paths. Add or update `*.rules.test.ts` tests when you change rules.
- **Matching projects:** match by `projectId`, never by project name.
- **Before declaring done:** run typecheck (`npm run lint`), the relevant tests (`npm run test:unit`, plus `npm run test:firestore-rules` if you changed rules), and `npm run build` if needed. Report what changed and the test results.
- **UI:** must work on mobile, where tables switch to a card layout (see `scripts/check-mobile-tables.cjs` and `tests/mobileTables.test.ts`). Must work in dark mode. All UI text is in Vietnamese.

## 3. Lệnh thường dùng

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Dev server (`tsx server.ts`) at http://localhost:3000 |
| `npm run build` | Production build (`vite build` → `dist/`) |
| `npm run preview` | Preview the build |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run test:unit` | Unit tests (Vitest, `vitest.unit.config.ts`) |
| `npm run test:firestore-rules` | Rules tests on the Firestore emulator (needs Java 21 and a bash shell; uses project `demo-chiphi-rules`, not live data) |
| `npm run gen:vn-rules` | Generate VN rules (`scripts/gen-vn-rules.mts`) |

There is no plain `npm test` script. Use `test:unit` and `test:firestore-rules`.
