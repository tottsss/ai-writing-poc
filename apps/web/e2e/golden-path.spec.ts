import { expect, test } from "@playwright/test";
import { API_BASE, randomEmail } from "./helpers";

// Full golden path: register via API (so we don't race the proxy on a direct
// GET /register), log in through the UI, create a doc, request a paraphrase,
// accept the streamed suggestion. Exercises auth, doc CRUD, AI streaming, and
// the partial-acceptance diff panel end-to-end.
test("register, login, create doc, paraphrase, accept", async ({
  page,
  request,
}) => {
  const email = randomEmail("golden");

  await request.post(`${API_BASE}/register`, {
    data: { email, password: "password123", name: "Golden E2E" },
  });

  // Landing at / redirects to /login for unauthenticated users via
  // client-side routing, which sidesteps the /login proxy rule.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill("password123");
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Create a document — the dashboard navigates to the editor directly.
  await page.getByLabel(/new document title/i).fill("Golden E2E Doc");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page).toHaveURL(/\/editor\//, { timeout: 10_000 });

  // Tiptap editor is contenteditable; seed some text and select it all.
  const editable = page.locator(".tiptap").first();
  await editable.click();
  await editable.press("Control+a");
  await editable.press("Delete");
  await editable.pressSequentially(
    "The quick brown fox jumps over the lazy dog."
  );
  await editable.press("Control+a");

  // MockProvider streams word-by-word; Accept button appears once done.
  await page.getByRole("button", { name: /paraphrase selection/i }).click();

  const acceptButton = page.getByRole("button", {
    name: /^accept (all|selected)/i,
  });
  await expect(acceptButton).toBeVisible({ timeout: 20_000 });
  await acceptButton.click();

  await expect(page.getByText(/AI change applied/i)).toBeVisible({
    timeout: 10_000,
  });

  await expect(
    page.getByRole("button", { name: /undo ai change/i })
  ).toBeVisible();
});
