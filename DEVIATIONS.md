# Architecture Deviation Report

This document records every difference between the system designed in Assignment 1
and the final implementation delivered in Assignment 2.  For each deviation we
explain what changed, why, and whether it was an improvement or a compromise.

---

## 1. Conflict Resolution: last-write-wins → Optimistic Concurrency Control (OCC)

**Assignment 1 design:** Save-based last-write-wins.  Whoever pressed Save last
won, silently overwriting the other user's changes.

**What changed:** Replaced with Optimistic Concurrency Control at both layers:

- **REST layer** (`PUT /documents/{id}`): every update payload carries the
  `version` the client believes the document is on.  If it matches the server's
  current version the update is accepted and the version is incremented.  If it
  doesn't, the server returns HTTP 409 with the latest content so the client can
  resync.  Implemented in `document_service.StaleVersionError`.

- **WebSocket layer** (`/ws/documents/{id}`): each `document_update` message
  carries the client's version.  A mismatch causes the server to push the current
  state back to the sender so it resyncs silently — no data loss, no error dialog.

**Why:** The professor's feedback was that last-write-wins is inconsistent with a
real-time WebSocket design — whoever saves last wins, causing silent data loss.
OCC makes the conflict visible and resolvable rather than invisible and
destructive.

**Classification:** Improvement.

---

## 2. Real-time Transport: save-based polling → WebSocket broadcast

**Assignment 1 design:** Changes were only propagated to other users when a user
explicitly saved (or the autosave timer fired, every 2 s).

**What changed:** A WebSocket hub (`collaboration_service.ConnectionManager`)
maintains a per-document room of connected clients.  When any client sends a
`document_update` frame, the server validates it with OCC and immediately
broadcasts the accepted state to every other client in the room.  The frontend
also throttles keystrokes to 150 ms before sending, so remote users see changes
in near real-time without flooding the server.

**Why:** Required by the assignment (Part 2) and consistent with the WebSocket
architecture we designed in Assignment 1.

**Classification:** Required feature, also an improvement over the PoC.

---

## 3. Conflict Resolution Strategy: OT considered but not adopted

**Assignment 1 design:** Last-write-wins (see §1).

**Team discussion:** Operational Transformation (OT) was considered after the
professor's feedback.  The team decided against it for the following reasons:

1. OT requires transforming every operation against every concurrent operation —
   correct implementation is non-trivial and error-prone under time constraints.
2. No team member had prior OT implementation experience.
3. OCC achieves the assignment baseline ("a basic last-write-wins or simple merge
   approach is acceptable") while being demonstrably more robust than raw LWW.

OT / CRDTs (e.g., Yjs) remain a bonus-tier goal and could be added as a future
enhancement by replacing `ConnectionManager.broadcast` with a Yjs document sync.

**Classification:** Deliberate scoping decision, not a compromise.

---

## 4. Backend: Node.js/Express (PoC) → FastAPI

**Assignment 1 design:** The PoC backend was Express + Node.js.

**What changed:** Assignment 2 requires FastAPI (Python).  The API surface is
functionally equivalent (same REST routes and response shapes) but the
implementation language and framework changed entirely.

**Why:** Mandatory technology constraint in the Assignment 2 brief.

**Classification:** Required change.

---

## 5. Frontend: vanilla JS → React + TypeScript

**Assignment 1 design:** The PoC frontend was a single `index.html` file with
inline JavaScript.

**What changed:** Full React + Vite + TypeScript SPA with React Router,
Tailwind CSS, and Tiptap rich-text editor.

**Why:** Mandatory technology constraint.  TypeScript was strongly recommended by
the brief and chosen unanimously by the team.

**Classification:** Required change, also an improvement.

---

## 6. AI Integration: mocked single-feature → streaming multi-feature with provider abstraction

**Assignment 1 design:** A single `/documents/:id/ai/summarize` endpoint that
returned a hardcoded string after a 1.5 s `setTimeout`.  No real streaming.

**What changed:**

- Two AI features: **Paraphrase** and **Summarize**, both implemented as
  `StreamingResponse(text/plain)` endpoints that yield tokens progressively.
- A `LLMProvider` abstract class with a `MockProvider` (streams word-by-word
  with realistic delays, no API key required) and a `PROVIDER` env-var hook for
  swapping to a real LLM (e.g., OpenAI) in one place.
- All prompt templates live in a single `PROMPTS` dict in `ai_service.py`,
  never hardcoded in route handlers.
- Every AI call is logged to an `ai_interactions` table (input, response,
  accept/reject status).

**Why:** Assignment 2 Part 3 requires streaming (hard requirement), at least two
features, configurable prompts, and provider abstraction.

**Classification:** Required change and significant improvement.

---

## 7. Authentication: none (PoC) → JWT access + refresh tokens

**Assignment 1 design:** No authentication in the PoC.

**What changed:** Full JWT lifecycle — registration, login, short-lived access
tokens (20 min), refresh tokens (7 days).  All API endpoints require a valid
access token.  WebSocket connections authenticate via `?token=` query param
(browsers cannot set `Authorization` headers on WebSocket upgrades).

**Why:** Mandatory requirement (Assignment 2 Part 1.1).

**Classification:** Required change.

---

## 8. Permissions: none (PoC) → server-side RBAC (owner / editor / viewer)

**Assignment 1 design:** No access control.

**What changed:** Three roles enforced at the server via a `Permission` table
and a `require_role(minimum)` FastAPI dependency.  Hiding a button in the UI is
not access control — direct API calls from a viewer are rejected with HTTP 403.

**Why:** Mandatory requirement (Assignment 2 Part 1.3).

**Classification:** Required change.

---

## 9. Storage: in-memory dict → SQLite (SQLAlchemy)

**Assignment 1 design:** Documents stored in a JavaScript object (`db.documents`),
lost on server restart.

**What changed:** SQLite database via SQLAlchemy ORM.  Schema auto-created on
startup via `Base.metadata.create_all`.  In-memory storage is still used for the
WebSocket connection manager (ephemeral by nature).

**Why:** The assignment allows file-based persistence; SQLite satisfies this and
requires no external database service.

**Classification:** Improvement.  Justification: SQLite is zero-config, fully
portable, and survives server restarts — important for version history correctness.
