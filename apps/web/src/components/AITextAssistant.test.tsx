import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AITextAssistant from "./AITextAssistant";

jest.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    accessToken: "fake-token",
    refreshToken: "fake-refresh",
    logout: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Tiptap editor stub — enough API surface for AITextAssistant to read the
// selection, build the replacement chain, and fetch HTML.
function buildEditorStub() {
  const chain = {
    focus: () => chain,
    setTextSelection: () => chain,
    insertContent: () => chain,
    run: () => true,
  };

  return {
    state: {
      selection: { from: 0, to: 9 },
      doc: {
        textBetween: () => "originally",
      },
    },
    getHTML: () => "<p>originally</p>",
    chain: () => chain,
    commands: {
      setContent: jest.fn(),
    },
  };
}

// Build a fetch-Response-like object whose body reader yields the chunks
// one by one. We don't use the real ReadableStream because jsdom's Response
// constructor is flaky when handed a live stream.
function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const queue = chunks.map((chunk) => encoder.encode(chunk));
  const reader = {
    async read(): Promise<{ value?: Uint8Array; done: boolean }> {
      const next = queue.shift();
      if (next === undefined) {
        return { done: true };
      }
      return { value: next, done: false };
    },
  };

  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
    text: async () => chunks.join(""),
    json: async () => ({}),
  } as unknown as Response;
}

describe("AITextAssistant (AI suggestion UI)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("streams a paraphrase, shows Accept/Reject/Edit, and persists on Accept", async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/ai/paraphrase")) {
        return Promise.resolve(streamingResponse(["refined ", "version ", "here"]));
      }
      if (url === "/documents/doc-1") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ version: 2 }),
          text: async () => JSON.stringify({ version: 2 }),
        } as unknown as Response);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const onVersionSaved = jest.fn();
    const editor = buildEditorStub();

    const user = userEvent.setup();

    render(
      <AITextAssistant
        documentId="doc-1"
        editor={editor as never}
        version={1}
        onVersionSaved={onVersionSaved}
      />
    );

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /paraphrase selection/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^accept$/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit suggestion/i })
    ).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /^accept$/i }));
    });

    await waitFor(() => {
      expect(onVersionSaved).toHaveBeenCalledWith(
        "<p>originally</p>",
        2
      );
    });

    // After acceptance the Undo AI change button becomes available (§3.3).
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /undo ai change/i })
      ).toBeInTheDocument();
    });
  });

  it("lets the user edit the suggestion before applying it (§3.3)", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(streamingResponse(["draft text"]))
    ) as unknown as typeof fetch;

    const user = userEvent.setup();

    render(
      <AITextAssistant
        documentId="doc-1"
        editor={buildEditorStub() as never}
        version={1}
        onVersionSaved={jest.fn()}
      />
    );

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /paraphrase selection/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit suggestion/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /edit suggestion/i }));

    const textarea = screen.getByLabelText(/edit suggestion before applying/i);
    expect(textarea).toHaveValue("draft text");
  });
});
