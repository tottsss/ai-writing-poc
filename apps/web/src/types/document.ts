export interface DocumentSummary {
  id: string;
  title: string;
  owner: string;
  lastUpdated: string;
}

export interface CreateDocumentPayload {
  title: string;
}

export interface DocumentsResponse {
  documents: DocumentSummary[];
}
