import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const screenshots = path.resolve(
  __dirname,
  "../../../docs/form-builder/phase3-qa",
);

test("authors a blank form with header, grid, notes, documents, save and renderer preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1536, height: 1080 });
  await page.goto("/dev/form-builder");
  await expect(
    page.getByRole("heading", { name: /Operations form/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Builder modules" }),
  ).toContainText("DesignForm SettingsWorkflowRulesList ViewVersions");
  mkdirSync(screenshots, { recursive: true });

  await page.getByRole("button", { name: "＋ Header section" }).click();
  await page.getByLabel("Section title").fill("Main information");
  await page.getByRole("button", { name: "Add Text field" }).click();
  await page.getByLabel("Field label").fill("Request title");
  await page.getByText("Main information", { exact: true }).click();
  await page.getByRole("button", { name: "Add Date field" }).click();
  await page.getByLabel("Field label").fill("Request date");
  await page.screenshot({
    path: path.join(screenshots, "desktop-header-fields.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  const detailsDialog = page.getByRole("dialog", { name: "Add Tab" });
  await detailsDialog.getByLabel("Tab name").fill("Work items");
  await detailsDialog.getByRole("button", { name: /Details \/ Grid/ }).click();
  await detailsDialog
    .getByRole("button", { name: "Add Tab", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Text field" }).click();
  await page.getByLabel("Field label").fill("Item");
  await page.getByRole("tab", { name: /Work items/ }).click();
  await page.getByRole("button", { name: "Add Number field" }).click();
  await page.getByLabel("Field label").fill("Quantity");
  await page.getByRole("tab", { name: /Work items/ }).click();
  await page.getByText("Allow deleting rows", { exact: true }).click();
  await page.screenshot({
    path: path.join(screenshots, "desktop-details-grid.png"),
    fullPage: true,
  });

  for (const [title, type] of [
    ["Team notes", "Notes"],
    ["Evidence", "Documents"],
  ] as const) {
    await page.getByRole("button", { name: "Add tab", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Tab" });
    await dialog.getByLabel("Tab name").fill(title);
    await dialog.getByRole("button", { name: new RegExp(type) }).click();
    await dialog.getByRole("button", { name: "Add Tab", exact: true }).click();
  }
  await expect(page.getByRole("tab", { name: /Team notes/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Evidence/ })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-documents-config.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(
    page.getByText(/Local draft callback received 4 tabs/),
  ).toBeVisible();
  await page.getByRole("button", { name: "▷ Preview" }).click();
  const preview = page.getByRole("dialog", { name: "Form preview" });
  await expect(
    preview.getByText("Current local draft · Phase 2 renderer"),
  ).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Operations form" }),
  ).toBeVisible();
  await expect(preview.getByLabel("Request title")).toBeVisible();
  await expect(preview.getByRole("tab", { name: "Work items" })).toBeVisible();
  await expect(preview.getByRole("tab", { name: "Team notes" })).toBeVisible();
  await expect(preview.getByRole("tab", { name: "Evidence" })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-renderer-preview.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
