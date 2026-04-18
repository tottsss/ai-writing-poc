import { useMemo } from "react";
import type { CSSProperties } from "react";

type DiffType = "equal" | "remove" | "add";

interface DiffOperation {
  type: DiffType;
  value: string;
}

interface DiffSegment {
  value: string;
  changed: boolean;
}

export interface TextSuggestionDiffPanelProps {
  originalText: string;
  suggestedText: string;
  onAccept: (replacementText: string) => void;
  onReject: () => void;
}

function tokenize(text: string): string[] {
  return text.match(/\w+|\s+|[^\s\w]+/g) ?? [];
}

function buildDiffOperations(
  sourceTokens: string[],
  targetTokens: string[]
): DiffOperation[] {
  const rows = sourceTokens.length;
  const cols = targetTokens.length;
  const matrix: number[][] = Array.from({ length: rows + 1 }, () =>
    Array(cols + 1).fill(0)
  );

  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      if (sourceTokens[row - 1] === targetTokens[col - 1]) {
        matrix[row][col] = matrix[row - 1][col - 1] + 1;
      } else {
        matrix[row][col] = Math.max(matrix[row - 1][col], matrix[row][col - 1]);
      }
    }
  }

  const operations: DiffOperation[] = [];
  let row = rows;
  let col = cols;

  while (row > 0 && col > 0) {
    if (sourceTokens[row - 1] === targetTokens[col - 1]) {
      operations.push({ type: "equal", value: sourceTokens[row - 1] });
      row -= 1;
      col -= 1;
      continue;
    }

    if (matrix[row - 1][col] >= matrix[row][col - 1]) {
      operations.push({ type: "remove", value: sourceTokens[row - 1] });
      row -= 1;
      continue;
    }

    operations.push({ type: "add", value: targetTokens[col - 1] });
    col -= 1;
  }

  while (row > 0) {
    operations.push({ type: "remove", value: sourceTokens[row - 1] });
    row -= 1;
  }

  while (col > 0) {
    operations.push({ type: "add", value: targetTokens[col - 1] });
    col -= 1;
  }

  operations.reverse();
  return operations;
}

function toRenderSegments(
  operations: DiffOperation[],
  panel: "original" | "suggestion"
): DiffSegment[] {
  const relevantOperations =
    panel === "original"
      ? operations.filter((operation) => operation.type !== "add")
      : operations.filter((operation) => operation.type !== "remove");

  const segments: DiffSegment[] = [];

  for (const operation of relevantOperations) {
    const changed =
      panel === "original" ? operation.type === "remove" : operation.type === "add";

    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.changed === changed) {
      lastSegment.value += operation.value;
      continue;
    }

    segments.push({
      value: operation.value,
      changed,
    });
  }

  return segments;
}

function TextSuggestionDiffPanel({
  originalText,
  suggestedText,
  onAccept,
  onReject,
}: TextSuggestionDiffPanelProps) {
  const { originalSegments, suggestionSegments } = useMemo(() => {
    const operations = buildDiffOperations(tokenize(originalText), tokenize(suggestedText));
    return {
      originalSegments: toRenderSegments(operations, "original"),
      suggestionSegments: toRenderSegments(operations, "suggestion"),
    };
  }, [originalText, suggestedText]);

  return (
    <section style={styles.panel}>
      <header style={styles.header}>
        <h3 style={styles.title}>Review AI Suggestion</h3>
        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => onAccept(suggestedText)}
            disabled={suggestedText.trim().length === 0}
          >
            Accept
          </button>
          <button type="button" className="button-secondary" onClick={onReject}>
            Reject
          </button>
        </div>
      </header>

      <div style={styles.columns}>
        <article style={styles.column}>
          <h4 style={styles.columnTitle}>Original</h4>
          <p style={styles.textBlock}>
            {originalSegments.map((segment, index) => (
              <span
                key={`original-${index}`}
                style={segment.changed ? styles.removedText : styles.plainText}
              >
                {segment.value}
              </span>
            ))}
          </p>
        </article>

        <article style={styles.column}>
          <h4 style={styles.columnTitle}>AI Suggestion</h4>
          <p style={styles.textBlock}>
            {suggestionSegments.map((segment, index) => (
              <span
                key={`suggestion-${index}`}
                style={segment.changed ? styles.addedText : styles.plainText}
              >
                {segment.value}
              </span>
            ))}
          </p>
        </article>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: "grid",
    gap: "0.8rem",
    border: "1px solid #eaecf0",
    borderRadius: "12px",
    padding: "0.9rem",
    background: "#ffffff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
  },
  title: {
    margin: 0,
    fontSize: "1rem",
    color: "#101828",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
  },
  column: {
    border: "1px solid #eaecf0",
    borderRadius: "10px",
    padding: "0.7rem",
    background: "#f9fafb",
  },
  columnTitle: {
    margin: "0 0 0.4rem",
    fontSize: "0.9rem",
    color: "#344054",
  },
  textBlock: {
    margin: 0,
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    color: "#101828",
    fontSize: "0.92rem",
  },
  plainText: {},
  removedText: {
    background: "rgba(217, 45, 32, 0.16)",
    borderRadius: "4px",
  },
  addedText: {
    background: "rgba(18, 183, 106, 0.16)",
    borderRadius: "4px",
  },
};

export default TextSuggestionDiffPanel;
