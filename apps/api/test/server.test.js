const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/server");

test("POST /documents creates a document with the expected shape", async () => {
  const response = await request(app)
    .post("/documents")
    .send({
      title: "My Research Paper",
      content: "Initial draft..."
    });

  assert.equal(response.status, 201);
  assert.ok(response.body.document_id);
  assert.equal(response.body.title, "My Research Paper");
  assert.equal(response.body.current_content, "Initial draft...");
  assert.ok(response.body.created_at);
});

test("GET /documents/:id returns an existing document", async () => {
  const createdResponse = await request(app)
    .post("/documents")
    .send({
      title: "Existing Document",
      content: "Saved content"
    });

  const response = await request(app).get(
    `/documents/${createdResponse.body.document_id}`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.document_id, createdResponse.body.document_id);
  assert.equal(response.body.current_content, "Saved content");
});

test("GET /documents/:id returns 404 for a missing document", async () => {
  const response = await request(app).get("/documents/missing-document");

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Document not found");
});

test("PUT /documents/:id updates an existing document", async () => {
  const createdResponse = await request(app)
    .post("/documents")
    .send({
      title: "Draft",
      content: "Old version"
    });

  const response = await request(app)
    .put(`/documents/${createdResponse.body.document_id}`)
    .send({
      content: "Updated version"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.current_content, "Updated version");
  assert.ok(response.body.updated_at);
});

test("PUT /documents/:id returns 404 for a missing document", async () => {
  const response = await request(app)
    .put("/documents/missing-document")
    .send({
      content: "Updated version"
    });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Document not found");
});

test("POST /documents/:id/ai/summarize returns a mocked summary", async () => {
  const createdResponse = await request(app)
    .post("/documents")
    .send({
      title: "AI Draft",
      content: "A longer paragraph that can be summarized."
    });

  const response = await request(app)
    .post(`/documents/${createdResponse.body.document_id}/ai/summarize`)
    .send({
      selected_text: "A longer paragraph that can be summarized."
    });

  assert.equal(response.status, 200);
  assert.equal(
    response.body.original_text,
    "A longer paragraph that can be summarized."
  );
  assert.match(response.body.ai_response, /^\[AI Summary\]: /);
});

test("POST /documents/:id/ai/summarize returns 404 for a missing document", async () => {
  const response = await request(app)
    .post("/documents/missing-document/ai/summarize")
    .send({
      selected_text: "Text to summarize"
    });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Document not found");
});

test("POST /documents/:id/ai/summarize rejects missing selected text", async () => {
  const createdResponse = await request(app)
    .post("/documents")
    .send({
      title: "AI Draft",
      content: "Text"
    });

  const response = await request(app)
    .post(`/documents/${createdResponse.body.document_id}/ai/summarize`)
    .send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "No text provided");
});
