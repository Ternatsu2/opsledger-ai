import { expect, test } from "@playwright/test";

test("home shows a short, understandable application queue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "3 applications open" })).toBeVisible();
  await expect(page.getByText("Open an application to see what it needs.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Island Harvest Foods Ltd/ })).toContainText("Ready for review");
  await expect(page.getByRole("link", { name: /Blue Shore Repairs/ })).toContainText("More information needed");
  await expect(page.getByRole("link", { name: /Caribbean Green Logistics Ltd/ })).toContainText("Needs a closer look");

  await expect(page.getByText(/deterministic/i)).toHaveCount(0);
  await expect(page.getByText(/bounded agent/i)).toHaveCount(0);
  await expect(page.getByText(/schema validated/i)).toHaveCount(0);
  await expect(page.getByText(/correlation id/i)).toHaveCount(0);
});

test("ready application requires a reason before approval", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: /Island Harvest Foods Ltd/ }).click();
  await page.getByRole("button", { name: "Approve for next step" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Check the documents and summary, then add a reason.");
  await dialog.getByRole("button", { name: "Approve for next step" }).click();
  await expect(dialog).toContainText("Add a short note before you continue.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("information request is plain, editable, and cannot be sent by the app", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: /Blue Shore Repairs/ }).click();

  const titleFits = await page.getByRole("heading", { name: "Blue Shore Repairs" }).evaluate(
    (heading) => heading.scrollWidth <= heading.clientWidth,
  );
  expect(titleFits, "the business name should not be clipped on desktop").toBe(true);

  const itemsToCheck = page.locator(".finding-list");
  await expect(itemsToCheck.getByText("Missing document", { exact: true })).toBeVisible();
  await expect(itemsToCheck.getByText("Add the missing ownership form.", { exact: true })).toBeVisible();
  await expect(itemsToCheck.getByText("Financial record is out of date", { exact: true })).toBeVisible();
  await expect(itemsToCheck.getByText(/The revenue record is \d+ days old\. Add a newer one\./)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message draft" })).toContainText(/ownership/i);
  await expect(page.getByRole("textbox")).toContainText(/revenue record/i);
  await expect(page.getByRole("textbox")).toContainText(/dated within the last 180 days/i);
  await expect(page.getByRole("textbox")).not.toContainText(/demo policy|document checklist/i);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send email", exact: true })).toHaveCount(0);
  await expect(page.getByText("REQUIRED_DOCUMENT_MISSING", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/recorded workflow stage/i)).toHaveCount(0);

  await page.getByRole("button", { name: /Documents 3/ }).click();
  await expect(page.getByText("Revenue records · Spreadsheet", { exact: true })).toBeVisible();
  await expect(page.getByText("Bank statement · CSV file", { exact: true })).toBeVisible();
  await expect(page.getByText(/application\/vnd/i)).toHaveCount(0);
});

test("closer-look application explains both conflicts without rule codes", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: /Caribbean Green Logistics Ltd/ }).click();

  const itemsToCheck = page.locator(".finding-list");
  await expect(itemsToCheck.getByText("Business name does not match", { exact: true })).toBeVisible();
  await expect(itemsToCheck.getByText("Registration number already in use", { exact: true })).toBeVisible();
  await expect(page.getByText("Some details do not match. Check the original documents before taking action.")).toBeVisible();
  await expect(page.getByText("LEGAL_NAME_MISMATCH", { exact: true })).toHaveCount(0);
  await expect(page.getByText("DUPLICATE_REGISTRATION", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Message draft" })).toHaveCount(0);
});

test("intake validates required fields before creating a case", async ({ page }) => {
  await page.goto("/cases/new");
  await expect(page.locator("[aria-current='page']")).toHaveCount(1);
  await page.getByRole("button", { name: "Create application" }).click();

  await expect(page.getByText("Enter the legal business name.")).toBeVisible();
  await expect(page.getByText("Describe the use of funds in one sentence.")).toBeVisible();
  await expect(page.getByText("Use sample files in this demo.", { exact: true })).toBeVisible();
});

test("activity page keeps system details out of the main workflow", async ({ page }) => {
  await page.goto("/trust");

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByText("See what changed, who changed it, and when.")).toBeVisible();
  await expect(page.getByText(/model provider/i)).not.toBeVisible();
  await expect(page.getByText(/public writes/i)).not.toBeVisible();
});

test("@mobile key screens fit the viewport and keep navigation usable", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();

  for (const path of ["/", "/cases", "/cases/new", "/trust"]) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${path} should not scroll sideways`).toBeLessThanOrEqual(dimensions.viewport);
  }

  await page.goto("/cases");
  await page.getByRole("link", { name: /Blue Shore Repairs/ }).click();
  await expect(page.getByRole("button", { name: "Summary" })).toBeVisible();
  const detailDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(detailDimensions.content).toBeLessThanOrEqual(detailDimensions.viewport);
});
