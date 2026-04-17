# Academic Collaborative AI Writing Platform — Assignment 2

Full implementation of the system designed in Assignment 1.  Monorepo with two
apps:

| App | Stack |
|---|---|
| `apps/api/` | FastAPI + SQLite (auth, documents, versioning, permissions, WebSocket collaboration, AI streaming) |
| `apps/web/` | React 18 + Vite + TypeScript + Tailwind + Tiptap |

---

## Quick start (single command)

Requires [`uv`](https://docs.astral.sh/uv/) (Python) and `npm` (Node ≥ 18) on
`PATH`.

```bash
cp apps/api/.env.example apps/api/.env   # edit JWT_SECRET at minimum
./run.sh
```

- Backend: <http://localhost:8000> — `/docs` for the interactive OpenAPI UI
- Frontend: <http://localhost:5173>

---

## Architecture overview

```
Browser A ──── REST (auth, document CRUD, AI) ────┐
               WebSocket /ws/documents/{id}        │   FastAPI
Browser B ──── REST ──────────────────────────────┤   (uvicorn)
               WebSocket /ws/documents/{id}        │
                                                   └── SQLite (dev.db)
```

### Real-time collaboration

WebSocket connections are authenticated via `?token=` query param (JWT access
token — browsers cannot set `Authorization` headers on WS upgrades).

Conflict resolution uses **Optimistic Concurrency Control (OCC)**:

- Every update carries the `version` the client believes the document is on.
- If it matches the server's current version → accepted, version incremented,
  broadcast to all other clients in the room.
- If it doesn't match → server pushes the current state back to the stale client
  so it resyncs silently (no data loss).

### AI streaming

`POST /documents/{id}/ai/paraphrase` and `POST /documents/{id}/ai/summarize`
return `StreamingResponse(text/plain)` — tokens are yielded progressively.

The LLM provider is abstracted behind `LLMProvider` (abc).  Set `PROVIDER=mock`
(default, no API key needed) or add a concrete provider class and set
`PROVIDER=openai` etc.

---

## Team

| Member | Role |
|---|---|
| Fatema Alyafei | Frontend Developer & UI Lead |
| Delyan Hristov | Backend & Database Lead |
| Iskhak Tazhibaev | Real-Time & AI Integration Lead |
| Maha Abdulla Alhosani | Testing, Integration & Quality Assurance Lead |

---

## Environment variables

Copy `apps/api/.env.example` to `apps/api/.env` and fill in the values.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./dev.db` | SQLAlchemy DB URL |
| `JWT_SECRET` | *(must change)* | Secret for signing tokens |
| `JWT_ALGORITHM` | `HS256` | Token signing algorithm |
| `ACCESS_TOKEN_MINUTES` | `20` | Access token lifetime |
| `REFRESH_TOKEN_DAYS` | `7` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `PROVIDER` | `mock` | AI provider (`mock` \| `openai`) |

---

## Running tests

Backend (pytest):

```bash
cd apps/api
uv run pytest
```

Frontend (Jest):

```bash
cd apps/web
npm test
```

---

## API documentation

FastAPI auto-generates interactive docs at:

- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

---

## Deviations from Assignment 1

See [DEVIATIONS.md](DEVIATIONS.md) for a full account of every difference
between the Assignment 1 design and this implementation, including rationale.

Key changes:
- **Conflict resolution**: last-write-wins → Optimistic Concurrency Control
- **Transport**: save-based polling → authenticated WebSocket broadcast
- **AI**: single hardcoded mock → streaming multi-feature with provider abstraction
- **Auth**: none → JWT access + refresh tokens
- **Storage**: in-memory → SQLite
