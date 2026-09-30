import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
const screenshots = path.resolve(
  __dirname,
  "../../../docs/form-builder/phase2-qa",
);
test("desktop preview, grid, notes, documents, output, read-only and empty/invalid states", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/dev/form-renderer");
  await expect(
    page.getByRole("heading", { name: "Operations request", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Operations", exact: true }),
  ).toBeAttached();
  await page.getByRole("button", { name: "Validate preview" }).click();
  await expect(page.locator(".fr-root").getByRole("alert")).toContainText(
    "Review 3 fields",
  );
  await page.getByRole("button", { name: "Fill with sample data" }).click();
  await expect(page.getByLabel("Request title")).toHaveValue(
    "Site readiness review",
  );
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, "desktop-preview.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Resource", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Add row", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Resource", exact: true })
    .nth(1)
    .fill("Tools");
  await page
    .getByRole("spinbutton", { name: "Quantity", exact: true })
    .nth(1)
    .fill("2");
  await page.getByRole("button", { name: "Delete row 1" }).click();
  await expect(
    page.getByRole("textbox", { name: "Resource", exact: true }),
  ).toHaveValue("Tools");
  await page.screenshot({
    path: path.join(screenshots, "desktop-grid.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Equipment", exact: true }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Equipment", exact: true })
      .getByText("No rows yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Team notes", exact: true }).click();
  await page.getByLabel("Add a note").fill("Ready for review.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page.getByText("Ready for review.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-notes.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await page.getByLabel("Choose documents").setInputFiles({
    name: "brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Fixture file"),
  });
  await expect(
    page.getByRole("button", { name: "Remove brief.txt" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-documents.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Validate preview" }).click();
  await expect(page.getByRole("status")).toContainText("Nothing was saved.");
  await expect(page.locator(".demo-output")).toContainText("brief.txt");
  await page.getByLabel("Mode", { exact: true }).selectOption("readOnly");
  await expect(
    page.getByRole("button", { name: "Remove brief.txt" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Request details", exact: true }).click();
  await expect(page.getByLabel("Request title")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Validate preview" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(screenshots, "desktop-read-only.png"),
    fullPage: true,
  });
  await page.getByLabel("Mode", { exact: true }).selectOption("edit");
  await page
    .getByRole("button", { name: "Validate form", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Local form data is ready.",
  );
  await page.screenshot({
    path: path.join(screenshots, "desktop-runtime.png"),
    fullPage: true,
  });
  await page.getByLabel("Schema fixture").selectOption("empty");
  await expect(page.getByText("No header fields configured.")).toBeVisible();
  await page.getByLabel("Schema fixture").selectOption("invalid");
  await expect(page.locator('.fr-root[role="alert"]')).toContainText(
    "cannot be displayed",
  );
  expect(errors).toEqual([]);
});
for (const width of [390, 768])
  test(`responsive ${width}px and keyboard navigation without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/dev/form-renderer");
    await page.getByRole("button", { name: "Fill with sample data" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const title = await page.getByLabel("Request title").boundingBox();
    expect(title!.width).toBeGreaterThan(width === 390 ? 200 : 150);
    await page
      .getByRole("tab", { name: "Request details", exact: true })
      .focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Resources", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tabpanel", { name: "Resources", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({
      path: path.join(screenshots, `${width}-grid.png`),
      fullPage: true,
    });
    await page
      .getByRole("tab", { name: "Request details", exact: true })
      .click();
    await page.screenshot({
      path: path.join(screenshots, `${width}-preview.png`),
      fullPage: true,
    });
  });
