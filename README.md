# webhook

TypeScript backend scaffold using Express, TypeScript, ESLint, Prettier, and Vitest.

## Requirements

- Node.js 20+
- npm 10+

## Scripts

- `npm run dev` - start the server in watch mode
- `npm run build` - compile TypeScript into `dist`
- `npm start` - run the compiled server
- `npm run lint` - lint the codebase
- `npm run format` - format the codebase
- `npm test` - run tests once
- `npm run test:watch` - run tests in watch mode

## Environment

Create a `.env` file if you want to override the default port.

```bash
PORT=3000
```

## Endpoints

- `GET /health` returns a simple status payload
