# Academic Collaborative AI Writing Platform - PoC

This Proof of Concept demonstrates the foundational API contracts and frontend-to-backend communication outlined in our system architecture.

## What It Demonstrates

- Proper repository structure with `apps/api` and `apps/web`.
- Core document CRUD operations over REST.
- The AI feature workflow: sending only highlighted text from the editor to the API, receiving a mocked LLM response, previewing it, and allowing the user to accept or reject the result.

## What Is Intentionally Not Implemented

- Real-time WebSocket synchronization, as this PoC focuses strictly on data contracts and basic communication.
- Persistent database storage, using an in-memory database to minimize setup friction for reviewers.
- Full authentication middleware.

## How to Run

1. Open a terminal in the project root.
2. Run `npm install` to install dependencies (`express`, `cors`).
3. Start the backend with `node apps/api/src/server.js`.
4. Open `apps/web/src/index.html` directly in a web browser.
