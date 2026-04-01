const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const db = {
  documents: {}
};

let documentCounter = 0;

function createDocumentId() {
  documentCounter += 1;
  return `${Date.now()}-${documentCounter}`;
}

function getStringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

app.post("/documents", (req, res) => {
  const requestBody = req.body ?? {};
  const title = getStringValue(requestBody.title, "Untitled Document").trim();
  const content = getStringValue(requestBody.content, "");
  const id = createDocumentId();
  const newDocument = {
    document_id: id,
    title: title || "Untitled Document",
    current_content: content,
    created_at: new Date().toISOString()
  };

  db.documents[id] = newDocument;
  res.status(201).json(newDocument);
});

app.get("/documents/:id", (req, res) => {
  const document = db.documents[req.params.id];

  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  return res.json(document);
});

app.put("/documents/:id", (req, res) => {
  const existingDocument = db.documents[req.params.id];

  if (!existingDocument) {
    return res.status(404).json({ error: "Document not found" });
  }

  const updatedDocument = {
    ...existingDocument,
    current_content: getStringValue(req.body?.content, ""),
    updated_at: new Date().toISOString()
  };

  db.documents[req.params.id] = updatedDocument;
  return res.json(updatedDocument);
});

app.post("/documents/:id/ai/summarize", (req, res) => {
  const existingDocument = db.documents[req.params.id];

  if (!existingDocument) {
    return res.status(404).json({ error: "Document not found" });
  }

  const selectedText = getStringValue(req.body?.selected_text, "").trim();

  if (!selectedText) {
    return res.status(400).json({ error: "No text provided" });
  }

  return setTimeout(() => {
    res.json({
      original_text: selectedText,
      ai_response: `[AI Summary]: ${selectedText.substring(0, 30)}... is a complex topic that requires further academic synthesis.`
    });
  }, 1500);
});

if (require.main === module) {
  const port = 3000;

  app.listen(port, () => {
    console.log(`Backend API running on http://localhost:${port}`);
  });
}

module.exports = app;
