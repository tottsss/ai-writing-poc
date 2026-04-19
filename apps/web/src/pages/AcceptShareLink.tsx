import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../lib/apiClient";

type Status = "working" | "error";

function parseDetail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const detail = (data as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail : null;
}

function AcceptShareLink() {
  const { token } = useParams<{ token: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const ranRef = useRef(false);

  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState<string>("Accepting invitation...");

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) {
      setStatus("error");
      setMessage("Invalid link.");
      return;
    }

    const run = async () => {
      try {
        const response = await authFetch(
          `/share-links/${token}/accept`,
          { method: "POST" },
          auth
        );
        const body: unknown = await response.json().catch(() => undefined);

        if (response.status === 401) {
          auth.logout();
          return;
        }
        if (!response.ok) {
          throw new Error(
            parseDetail(body) ?? "Unable to accept this invitation."
          );
        }

        const documentId = (body as { document_id?: string | number } | null)
          ?.document_id;
        if (documentId === undefined || documentId === null) {
          throw new Error("Server did not return a document.");
        }
        navigate(`/editor/${documentId}`, { replace: true });
      } catch (caught) {
        setStatus("error");
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Unable to accept this invitation."
        );
      }
    };

    void run();
  }, [auth, navigate, token]);

  return (
    <div style={{ padding: "1.5rem" }}>
      <section className="card" style={{ maxWidth: 480 }}>
        <h3>Share link</h3>
        <p className={status === "error" ? "error-text" : "muted"}>
          {message}
        </p>
        {status === "error" ? (
          <button
            type="button"
            className="button-secondary"
            onClick={() => navigate("/dashboard", { replace: true })}
          >
            Back to dashboard
          </button>
        ) : null}
      </section>
    </div>
  );
}

export default AcceptShareLink;
