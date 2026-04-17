# Academic Collaborative AI Writing Platform — Assignment 2

Working implementation of the system designed in Assignment 1. The repo is a
monorepo with two apps:

- `apps/api/` — FastAPI + SQLite backend (auth, documents, versioning, role-based
  permissions).
- `apps/web/` — React + TypeScript frontend.

LLM streaming and WebSocket / OT collaboration are owned by other team members
and live in their own modules once added.

## Run everything

Requires `uv` (Python) and `npm` (Node) on PATH.

```bash
./run.sh
```

Backend boots on <http://localhost:8000> (`/docs` for the OpenAPI UI). Frontend
boots on <http://localhost:5173>.

## Run pieces individually

Backend only — see [apps/api/README.md](apps/api/README.md).

Frontend only:

```bash
cd apps/web
npm install
npm run dev
```

## Deviations from Assignment 1

See [DEVIATIONS.md](DEVIATIONS.md). Notably: switching from last-write-wins to
Operational Transformation for live concurrent editing.
