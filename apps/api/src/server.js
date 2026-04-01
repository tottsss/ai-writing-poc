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

if (require.main === module) {
  const port = 3000;

  app.listen(port, () => {
    console.log(`Backend API running on http://localhost:${port}`);
  });
}

module.exports = app;
