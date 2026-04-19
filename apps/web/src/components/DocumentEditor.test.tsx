import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeEvent } from "react";
import DocumentEditor from "./DocumentEditor";

jest.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    accessToken: null,
  }),
}));

jest.mock("./AITextAssistant", () => () => null);

jest.mock("@tiptap/starter-kit", () => ({}));

jest.mock("@tiptap/react", () => {
  const React = require("react") as typeof import("react");

  let latestHtml = "";
  let latestOnUpdate:
    | ((params: { editor: { getHTML: () => string } }) => void)
    | null = null;

  const createChain = () => {
    const chain = {
      focus: () => chain,
      toggleBold: () => chain,
      toggleItalic: () => chain,
      toggleHeading: () => chain,
      toggleBulletList: () => chain,
      run: () => true,
    };

    return chain;
  };

  const editor = {
    getHTML: () => latestHtml,
    commands: {
      setContent: (content: string) => {
        latestHtml = content;
      },
    },
    isActive: () => false,
    chain: () => createChain(),
    can: () => ({
      chain: () => createChain(),
    }),
  };

  return {
    useEditor: (config: { content?: string; onUpdate?: typeof latestOnUpdate }) => {
      latestHtml = config.content ?? "";
      latestOnUpdate = config.onUpdate ?? null;
      return editor;
    },
    EditorContent: () => (
      <textarea
        aria-label="editor-content"
        defaultValue={latestHtml}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          latestHtml = event.target.value;
          if (latestOnUpdate) {
            latestOnUpdate({ editor });
          }
        }}
      />
    ),
  };
});

describe("DocumentEditor", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("types content, waits for debounce, and calls PUT /documents/:id", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: 2 }),
    } as Response);

    global.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <DocumentEditor
        documentId="doc-123"
        initialContent="<p>Initial content</p>"
        version={1}
      />
    );

    const editorInput = screen.getByLabelText("editor-content");

    await user.clear(editorInput);
    await user.type(editorInput, "<p>Updated content</p>");

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/documents/doc-123",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            content: "<p>Updated content</p>",
            version: 1,
          }),
        })
      );
    });
  });
});
