import { expect, test } from "@playwright/test";

test("dashboard presents the three documented workflow outcomes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "A clear queue. Evidence at every turn." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Island Harvest Foods Ltd/ })).toContainText("Ready for human review");
  await expect(page.getByRole("link", { name: /Blue Shore Repairs/ })).toContainText("Needs information");
  await expect(page.getByRole("link", { name: /Caribbean Green Logistics Ltd/ })).toContainText("Manual investigation");
});

test("ready case requires a rationale before approval", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: /Island Harvest Foods Ltd/ }).click();
  await page.getByRole("button", { name: "Approve next stage" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("It does not make a lending or eligibility decision.");
  await dialog.getByRole("button", { name: "Record approval" }).click();
  await expect(dialog).toContainText("Add a short evidence-based rationale");
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("information case exposes editable follow-up and no send control", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: /Blue Shore Repairs/ }).click();

  await expect(
    page.getByText("Ownership Declaration is required by the synthetic demo policy.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Revenue evidence is 286 days old; the demo policy allows 180 days.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toContainText("Ownership Declaration");
  await expect(page.getByRole("textbox")).toContainText("revenue evidence");
  await expect(page.getByRole("button", { name: "Save reviewer edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: /send/i })).toHaveCount(0);
});

test("manual investigation case shows both identity conflicts", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: /Caribbean Green Logistics Ltd/ }).click();

  await expect(page.getByText("LEGAL_NAME_MISMATCH", { exact: true })).toBeVisible();
  await expect(page.getByText("DUPLICATE_REGISTRATION", { exact: true })).toBeVisible();
  await expect(page.getByText("The case is held.", { exact: false })).toBeVisible();
  await expect(page.getByText("Prepared follow-up")).toHaveCount(0);
});

test("intake validates required fields before creating a case", async ({ page }) => {
  await page.goto("/cases/new");
  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page.getByText("Enter the legal business name.")).toBeVisible();
  await expect(page.getByText("Describe the use of funds in one sentence.")).toBeVisible();
  await expect(page.getByText("Use synthetic documents only.", { exact: false })).toBeVisible();
});

test("@mobile layout has no horizontal document overflow", async ({ page }) => {
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});
