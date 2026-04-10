# TypeScript Backend Instructions

- This workspace is a Node.js backend written in TypeScript.
- Application code lives in `src/`.
- Tests live in `tests/` and use Vitest.
- Use `npm run build` for production compilation, `npm run dev` for local development, `npm test` for verification, and `npm run lint` before finalizing changes.
- Keep generated output out of source control; `dist/` is build-only.
- Prefer small, focused changes that preserve the Express app structure and the `/health` endpoint.
