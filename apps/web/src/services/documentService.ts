import type {
  CreateDocumentPayload,
  DocumentSummary,
  DocumentsResponse,
} from "../types/document";

type DocumentApiRecord = {
  id: unknown;
  title: unknown;
  owner: unknown;
  last_updated?: unknown;
  lastUpdated?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function asObject(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function getErrorMessage(data: unknown): string | null {
  const payload = asObject(data);
  if (!payload) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return null;
}

function parseDocument(data: unknown): DocumentSummary | null {
  const raw = asObject(data) as DocumentApiRecord | null;
  if (!raw) {
    return null;
  }

  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.owner !== "string"
  ) {
    return null;
  }

  const lastUpdatedValue = raw.lastUpdated ?? raw.last_updated;
  if (typeof lastUpdatedValue !== "string") {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    owner: raw.owner,
    lastUpdated: lastUpdatedValue,
  };
}

function buildHeaders(accessToken: string | null): HeadersInit {
  const headers: Record<string, string> = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined as unknown);
}

function toApiError(
  responseData: unknown,
  fallbackMessage: string,
  status: number
): ApiError {
  return new ApiError(getErrorMessage(responseData) ?? fallbackMessage, status);
}

export async function fetchDocuments(
  accessToken: string | null
): Promise<DocumentsResponse> {
  const response = await fetch("/documents", {
    method: "GET",
    headers: buildHeaders(accessToken),
  });

  const responseData = await parseResponseBody(response);

  if (!response.ok) {
    throw toApiError(
      responseData,
      "Unable to load documents. Please try again.",
      response.status
    );
  }

  const documentList = Array.isArray(responseData)
    ? responseData
    : asObject(responseData)?.documents;

  if (!Array.isArray(documentList)) {
    throw new Error("Invalid documents response from server.");
  }

  const documents = documentList
    .map((record) => parseDocument(record))
    .filter((record): record is DocumentSummary => record !== null);

  return { documents };
}

export async function createDocument(
  payload: CreateDocumentPayload,
  accessToken: string | null
): Promise<DocumentSummary> {
  const response = await fetch("/documents", {
    method: "POST",
    headers: {
      ...buildHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseData = await parseResponseBody(response);

  if (!response.ok) {
    throw toApiError(
      responseData,
      "Unable to create document. Please try again.",
      response.status
    );
  }

  const responseObject = asObject(responseData);
  const rawDocument = responseObject?.document ?? responseData;

  const document = parseDocument(rawDocument);
  if (!document) {
    throw new Error("Invalid create document response from server.");
  }

  return document;
}
