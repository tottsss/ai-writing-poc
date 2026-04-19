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

A top-level [`.env.example`](.env.example) documents every variable in one place
for reviewers. The backend reads `apps/api/.env`; the frontend has no runtime
env today.

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

Frontend UX:

- Two features (Paraphrase + Summarize) on the selected text.
- Streaming preview while generating, with a **Cancel** button that aborts the
  request and discards partial output (§3.2).
- Once streaming completes, the suggestion is shown in a side-by-side
  **original vs suggestion diff** panel (word-level LCS). Accept/Reject buttons.
- After Accept, an **Undo AI change** button appears for 15 s and reverts the
  document to its pre-acceptance snapshot (§3.3).
- AI History panel in the editor sidebar lists every past interaction with
  Accepted / Rejected / Pending status. Reviewers can mark an outcome via
  `PATCH /documents/{id}/ai/history/{interactionId}?accepted=true|false` (§3.5).
- For paraphrase, only a ±2 000-char window around the selection is sent if the
  document exceeds 4 000 chars, to cap prompt size (§3.4).

### AI suggestions during concurrent collaboration (§3.3)

When a user invokes an AI feature:

1. The selection snapshot is captured client-side; the diff panel is rendered
   against the *local* editor state only — the suggestion is never broadcast
   over the WebSocket to other editors.
2. On **Accept**, the replacement is applied locally and persisted with
   `PUT /documents/{id}` carrying the version the client last saw (OCC).
3. If another editor committed a change in the meantime, the server returns
   **409 Conflict**. The conflict modal then asks the user to reload the
   latest version, discarding the AI result. This prevents the AI accept
   from silently clobbering a collaborator's edit.
4. On successful accept, the `document_updated` broadcast from the normal
   save path pushes the new version to every other editor, so everyone
   converges without needing a separate AI-specific channel.
5. Undo within the 15-second window performs the same OCC-protected round
   trip with the original content.

### Session & token handling

- Access + refresh tokens are persisted in `localStorage`, so the session
  survives page refresh (§1.1).
- A shared `authFetch` helper attaches the `Authorization` header and, on `401`,
  transparently calls `/refresh` once and retries the original request. If the
  refresh fails, the user is logged out.
- The WebSocket reconnect loop also calls `/refresh` on `1008 POLICY_VIOLATION`
  closes before retrying.

### Presence, typing, offline

- Presence list renders avatar badges for each active user.
- Typing indicator: each editor broadcasts `{type: "typing"}` once every 2 s
  while the user is actively editing; other clients show a "typing…" suffix
  that auto-clears after 3 s of silence (§2.2).
- Offline banner: when `navigator.onLine` flips to `false`, the editor shows a
  warning chip. When the user comes back online, the pending local state is
  flushed via the normal REST save path (§2.3).

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

End-to-end (Playwright, bonus): boot the app via `./run.sh` (or start the
API and Vite dev server separately), then in another terminal run:

```bash
cd apps/web
npm run test:e2e
```

The single golden-path spec covers register → login → create document →
paraphrase via streaming AI → accept the suggestion. It drives the real
servers, so any prior server instance must be killed before the run.

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


---
## Testing & Quality Assurance

### Overview

A comprehensive testing and quality assurance process was conducted to validate the correctness, reliability, and integration of all system components. Testing combined automated backend and frontend tests with manual validation of real-world user workflows. The objective was to ensure that all functional requirements (authentication, document management, AI features, and real-time collaboration) operate correctly and consistently.

This section fully addresses the Assignment 2 requirements for backend testing, frontend testing, and system setup and documentation.

---

## 4.1 Backend Testing

Backend testing was implemented using **pytest** and FastAPI’s **TestClient**, covering both unit-level logic and API-level integration.

### Implemented Test Files

The following backend test files were created:

- `tests/test_auth.py`
- `tests/test_documents.py`
- `tests/test_ai.py`
- `tests/test_permissions.py`
- `tests/test_websocket.py`

### Test Coverage

The backend tests cover the following areas:

#### Authentication
- User registration (`POST /auth/register`)
- User login (`POST /auth/login`)
- Token generation and validation

#### Document CRUD & Versioning
- Document creation (`POST /documents`)
- Document retrieval (`GET /documents/{id}`)
- Document updates with version control (`PUT /documents/{id}`)

#### AI Integration
- AI summarization endpoint (`POST /documents/{id}/ai/summarize`)
- Validation of input (missing text handling)
- Verification that AI responses are returned correctly

#### Permissions
- Role-based access control enforcement
- Validation that unauthorized users cannot access documents before sharing

#### WebSocket Collaboration
- Authenticated WebSocket connection (`/ws/documents/{id}`)
- Validation of initial document state on connection
- Basic message exchange verification

### Implementation Details

- A temporary SQLite database was created per test using `tmp_path`
- FastAPI dependency overrides (`get_db`) were used for test isolation
- JWT encoding/decoding and password hashing were mocked to ensure deterministic tests
- Each test independently sets up and cleans its environment

### Execution Result

All backend tests passed successfully:

```bash
uv run pytest -q
```
- Total backend test files: 5
- All tests passed with no failures
- Core logic, permissions, AI integration, and WebSocket behavior validated
---

## 4.2 Frontend Testing

Frontend testing was implemented using **Jest** and **React Testing Library**.

### Implemented Test Files

The following frontend test files were used:

- `src/test/App.test.tsx`
- `src/pages/Login.test.tsx`
- `src/components/ProtectedRoute.test.tsx`
- `src/components/DocumentEditor.test.tsx`

### Test Coverage

Frontend tests cover the following UI functionality:

#### Authentication Flow
- Login page rendering
- Conditional routing based on authentication state

#### Application Routing
- Protected routes correctly restrict access
- Application loads appropriate views based on user state

#### Document Editor
- Editing content
- Debounced auto-save behavior triggering backend updates

#### AI UI Components
- Integration with AI suggestion workflow
- Preview and interaction behavior (mocked)

### Implementation Details

- External libraries (e.g., Tiptap editor) were mocked
- Network requests were mocked using `fetch`
- React hooks (e.g., `useAuth`) were mocked to simulate authentication
- Initial test issues (e.g., missing editor methods) were identified and fixed

### Execution Result

All frontend tests passed successfully:

```bash
npm test
```

## Integration & Manual Testing

In addition to automated testing, extensive manual testing was performed to validate end-to-end system behavior.

### Tested Scenarios

#### Authentication Flow
- User registration → login → dashboard navigation
- Verified correct redirection and session handling

#### Document Lifecycle
- Document creation from dashboard
- Automatic redirection to editor
- Autosave functionality without manual interaction
- Version history tracking and restoration

#### AI Functionality
- Selection of text and AI invocation
- Streaming output observed (token-by-token generation)
- Accept/Reject functionality verified
- Correct replacement of document content

#### Sharing & Permissions
- Document sharing via email
- Role assignment (owner, editor, viewer)
- Access control validated across different users

#### Real-Time Collaboration
- Two users editing the same document simultaneously
- Instant synchronization via WebSocket
- Presence indicators correctly displayed
- Conflict-free updates via optimistic concurrency control

### Observations
- System response time was consistently fast
- No data loss observed during concurrent editing
- AI streaming behavior worked correctly and enhanced user experience
- Role-based permissions were enforced correctly after resolving test-level issues
- WebSocket communication remained stable and reliable

---

## 4.3 Setup & Documentation

The system was verified for ease of setup and reproducibility.

### Setup Validation
- `run.sh` successfully launches both backend and frontend with a single command
- `.env.example` provides clear configuration guidance
- The application runs locally without complex setup

### API Documentation

FastAPI auto-generated documentation is available:

- Swagger UI: `/docs`
- ReDoc: `/redoc`

These provide clear API schemas and endpoints for testing and verification.

### README Quality

The README includes:
- setup instructions
- execution commands
- architecture overview
- testing instructions
- deviations from Assignment 1

### Deviations
o
All architectural changes from Assignment 1 are documented in `DEVIATIONS.md`, including:

- transition to JWT authentication
- introduction of WebSocket communication
- AI streaming integration
- migration from in-memory storage to SQLite

---

## Conclusion

The system meets all Testing & Quality requirements specified in Assignment 2:

- Meaningful backend and frontend test coverage implemented
- Core features (authentication, permissions, AI, real-time collaboration) validated
- Integration between components verified through automated and manual testing
- Setup process is simple and reproducible
- Documentation is clear and complete

The testing process demonstrates that the system is stable, reliable, and ready for demonstration and evaluation.
