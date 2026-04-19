import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TextSuggestionDiffPanel from "./TextSuggestionDiffPanel";

describe("TextSuggestionDiffPanel partial acceptance", () => {
  it("accepts every change by default", async () => {
    const onAccept = jest.fn();
    const user = userEvent.setup();

    render(
      <TextSuggestionDiffPanel
        originalText="the cat sat on the mat"
        suggestedText="the dog sat on the rug"
        onAccept={onAccept}
        onReject={jest.fn()}
      />
    );

    // Two change chunks: cat→dog and mat→rug. Both accepted by default.
    await user.click(screen.getByRole("button", { name: /accept all/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0][0]).toBe("the dog sat on the rug");
  });

  it("reconstructs text when the user rejects one change chunk", async () => {
    const onAccept = jest.fn();
    const user = userEvent.setup();

    render(
      <TextSuggestionDiffPanel
        originalText="the cat sat on the mat"
        suggestedText="the dog sat on the rug"
        onAccept={onAccept}
        onReject={jest.fn()}
      />
    );

    // Uncheck the first change chunk (cat → dog). The preview should keep cat
    // but still swap mat → rug.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
    await user.click(checkboxes[0]);

    const preview = screen.getByLabelText(/partial acceptance preview/i);
    expect(preview.textContent).toBe("the cat sat on the rug");

    await user.click(screen.getByRole("button", { name: /accept selected/i }));
    expect(onAccept).toHaveBeenCalledWith("the cat sat on the rug");
  });

  it("falls back to the original when every change is cleared", async () => {
    const onAccept = jest.fn();
    const user = userEvent.setup();

    render(
      <TextSuggestionDiffPanel
        originalText="one two three"
        suggestedText="one four three"
        onAccept={onAccept}
        onReject={jest.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /clear all/i }));
    const preview = screen.getByLabelText(/partial acceptance preview/i);
    expect(preview.textContent).toBe("one two three");
  });
});
