import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type DiffType = "equal" | "remove" | "add";

interface DiffOperation {
  type: DiffType;
  value: string;
}

// A timeline item is either an equal run (always kept) or a change chunk
// (contiguous removes + adds). The user toggles each change chunk.
interface EqualItem {
  kind: "equal";
  value: string;
}
interface ChangeItem {
  kind: "change";
  index: number;
  removed: string;
  added: string;
}
type TimelineItem = EqualItem | ChangeItem;

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

function buildTimeline(operations: DiffOperation[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let changeIndex = 0;
  let i = 0;
  while (i < operations.length) {
    const op = operations[i];
    if (op.type === "equal") {
      let value = "";
      while (i < operations.length && operations[i].type === "equal") {
        value += operations[i].value;
        i += 1;
      }
      items.push({ kind: "equal", value });
      continue;
    }
    let removed = "";
    let added = "";
    while (
      i < operations.length &&
      (operations[i].type === "remove" || operations[i].type === "add")
    ) {
      if (operations[i].type === "remove") {
        removed += operations[i].value;
      } else {
        added += operations[i].value;
      }
      i += 1;
    }
    items.push({ kind: "change", index: changeIndex, removed, added });
    changeIndex += 1;
  }
  return items;
}

function reconstruct(
  timeline: TimelineItem[],
  acceptedChunks: Set<number>
): string {
  let result = "";
  for (const item of timeline) {
    if (item.kind === "equal") {
      result += item.value;
    } else if (acceptedChunks.has(item.index)) {
      result += item.added;
    } else {
      result += item.removed;
    }
  }
  return result;
}

function TextSuggestionDiffPanel({
  originalText,
  suggestedText,
  onAccept,
  onReject,
}: TextSuggestionDiffPanelProps) {
  const timeline = useMemo(() => {
    const ops = buildDiffOperations(tokenize(originalText), tokenize(suggestedText));
    return buildTimeline(ops);
  }, [originalText, suggestedText]);

  const changeCount = useMemo(
    () => timeline.filter((item) => item.kind === "change").length,
    [timeline]
  );

  // Default: accept every change chunk (= full-accept, same as old behaviour).
  const [acceptedChunks, setAcceptedChunks] = useState<Set<number>>(() => {
    const all = new Set<number>();
    timeline.forEach((item) => {
      if (item.kind === "change") all.add(item.index);
    });
    return all;
  });

  // Reset when the suggestion changes (new AI response).
  useEffect(() => {
    const all = new Set<number>();
    timeline.forEach((item) => {
      if (item.kind === "change") all.add(item.index);
    });
    setAcceptedChunks(all);
  }, [timeline]);

  const previewText = useMemo(
    () => reconstruct(timeline, acceptedChunks),
    [timeline, acceptedChunks]
  );

  const toggle = (index: number) => {
    setAcceptedChunks((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const setAll = (value: boolean) => {
    const next = new Set<number>();
    if (value) {
      timeline.forEach((item) => {
        if (item.kind === "change") next.add(item.index);
      });
    }
    setAcceptedChunks(next);
  };

  const acceptDisabled =
    previewText.trim().length === 0 && suggestedText.trim().length === 0;

  return (
    <section style={styles.panel}>
      <header style={styles.header}>
        <h3 style={styles.title}>Review AI Suggestion</h3>
        <div style={styles.actions}>
          <button
            type="button"
            onClick={() => onAccept(previewText)}
            disabled={acceptDisabled}
          >
            {acceptedChunks.size === changeCount
              ? "Accept all"
              : `Accept selected (${acceptedChunks.size}/${changeCount})`}
          </button>
          <button type="button" className="button-secondary" onClick={onReject}>
            Reject
          </button>
        </div>
      </header>

      {changeCount > 0 ? (
        <div style={styles.bulkRow}>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setAll(true)}
          >
            Select all changes
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setAll(false)}
          >
            Clear all
          </button>
        </div>
      ) : null}

      <div style={styles.columns}>
        <article style={styles.column}>
          <h4 style={styles.columnTitle}>Inline diff</h4>
          <p style={styles.textBlock}>
            {timeline.map((item, idx) => {
              if (item.kind === "equal") {
                return <span key={`t-${idx}`}>{item.value}</span>;
              }
              const accepted = acceptedChunks.has(item.index);
              return (
                <label
                  key={`t-${idx}`}
                  aria-label={`Toggle change ${item.index + 1}`}
                  style={styles.changeGroup}
                >
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={() => toggle(item.index)}
                    style={styles.checkbox}
                  />
                  {item.removed.length > 0 ? (
                    <span
                      style={
                        accepted ? styles.removedTextStruck : styles.plainText
                      }
                    >
                      {item.removed}
                    </span>
                  ) : null}
                  {item.added.length > 0 ? (
                    <span
                      style={accepted ? styles.addedText : styles.addedTextDim}
                    >
                      {item.added}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </p>
        </article>

        <article style={styles.column}>
          <h4 style={styles.columnTitle}>Preview (will be applied)</h4>
          <p style={styles.textBlock} aria-label="Partial acceptance preview">
            {previewText}
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
  bulkRow: {
    display: "flex",
    gap: "0.4rem",
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
  changeGroup: {
    display: "inline",
    cursor: "pointer",
    padding: "0 2px",
    borderRadius: "4px",
    outline: "1px dashed #d0d5dd",
  },
  checkbox: {
    width: "0.9rem",
    height: "0.9rem",
    verticalAlign: "middle",
    marginRight: "2px",
  },
  removedTextStruck: {
    background: "rgba(217, 45, 32, 0.16)",
    textDecoration: "line-through",
    borderRadius: "4px",
  },
  addedText: {
    background: "rgba(18, 183, 106, 0.16)",
    borderRadius: "4px",
  },
  addedTextDim: {
    color: "#98a2b3",
    textDecoration: "line-through",
    borderRadius: "4px",
  },
};

export default TextSuggestionDiffPanel;
