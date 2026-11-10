import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { loadHostedEnvironment, repositoryRoot } from "./hosted-environment";

const env = loadHostedEnvironment();
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const managementUrl = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
const screenshots = path.join(repositoryRoot, "docs/form-builder/phase3_5-qa");
const runId = randomUUID().replaceAll("-", "");
const organizationId = randomUUID();
const email = `phase3-5-${runId}@example.com`;
const password = randomBytes(32).toString("base64url");
let userId = "";

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(
      `Hosted fixture request failed with HTTP ${response.status}.`,
    );
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function executeSql(query: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await request(managementUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, read_only: false }),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

async function deleteUser() {
  if (!userId) return;
  const response = await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SECRET_KEY },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Hosted test-user cleanup failed with HTTP ${response.status}.`,
    );
  }
}

test.beforeAll(async () => {
  const user = await request(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  userId = user.id;
  await executeSql(`
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('${organizationId}', 'Phase 3.5 browser verification', 'phase3-5-${runId}')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.organization_memberships (organization_id, user_id, role_key, status)
    VALUES ('${organizationId}', '${userId}', 'business_admin', 'active')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  `);
  mkdirSync(screenshots, { recursive: true });
});

test.afterAll(async () => {
  try {
    await executeSql(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      DELETE FROM public.form_versions WHERE organization_id = '${organizationId}';
      DELETE FROM public.forms WHERE organization_id = '${organizationId}';
      DELETE FROM public.organization_memberships WHERE organization_id = '${organizationId}';
      DELETE FROM public.organizations WHERE id = '${organizationId}';
      COMMIT;
    `);
  } finally {
    await deleteUser();
  }
});

test("creates, edits, previews, saves, lists, and reopens a real hosted draft", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1536, height: 1080 });

  await page.goto("/login");
  await page.getByLabel("Work Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const libraryRequest = page.waitForResponse(
    (response) =>
      response.url().includes("/api/forms?organizationId=") &&
      response.request().method() === "GET",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.getByLabel("Password").fill("");
  await expect(page).toHaveURL(/\/forms$/, { timeout: 30_000 });
  const libraryResponse = await libraryRequest;
  expect(libraryResponse.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Form Library" })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("heading", { name: "No forms yet" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-empty-library.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Create Form" }).first().click();
  await page.getByLabel("Form title").fill("Hosted Operations Form");
  await page
    .getByLabel("Description")
    .fill("Phase 3.5 hosted persistence verification");
  await page.screenshot({
    path: path.join(screenshots, "desktop-create-form.png"),
    fullPage: true,
  });
  const createRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/forms") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "Create and Open Builder" }).click();
  const createResponse = await createRequest;
  expect(createResponse.status()).toBe(201);
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+\/builder$/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: /Hosted Operations Form/ }),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "＋ Header section" }).click();
  await page.getByLabel("Section title").fill("Main information");
  await page.getByRole("button", { name: "Add Text field" }).click();
  await page.getByLabel("Field label").fill("Work order title");

  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  let addTab = page.getByRole("dialog", { name: "Add Tab" });
  await addTab.getByLabel("Tab name").fill("Work items");
  await addTab.getByRole("button", { name: /Details \/ Grid/ }).click();
  await addTab.getByRole("button", { name: "Add Tab", exact: true }).click();
  await page.getByRole("button", { name: "Add Text field" }).click();
  await page.getByLabel("Field label").fill("Item description");

  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  addTab = page.getByRole("dialog", { name: "Add Tab" });
  await addTab.getByLabel("Tab name").fill("Team notes");
  await addTab.getByRole("button", { name: /^Notes/ }).click();
  await addTab.getByRole("button", { name: "Add Tab", exact: true }).click();

  const saveRequest = page.waitForResponse(
    (response) =>
      response.url().includes("/api/forms/") &&
      response.url().endsWith("/draft") &&
      response.request().method() === "PUT",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Save Draft" }).click();
  const saveResponse = await saveRequest;
  expect(saveResponse.status()).toBe(200);
  await expect(
    page.getByText("Draft save completed through the host callback."),
  ).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: path.join(screenshots, "desktop-production-builder.png"),
    fullPage: true,
  });

  await page.reload();
  await expect(page.getByText("Main information", { exact: true })).toBeVisible(
    { timeout: 45_000 },
  );
  await expect(
    page.getByText("Work order title", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Work items/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Team notes/ })).toBeVisible();
  await page.getByRole("link", { name: "Form Library" }).click();
  await expect(
    page.getByText("Hosted Operations Form", { exact: true }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-populated-library.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Open builder" }).click();
  await expect(
    page.getByText("Work order title", { exact: true }).first(),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("tab", { name: /Work items/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Team notes/ })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-reopened-builder.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "▷ Preview" }).click();
  const preview = page.getByRole("dialog", { name: "Form preview" });
  await expect(preview.getByLabel("Work order title")).toBeVisible();
  await expect(preview.getByRole("tab", { name: "Work items" })).toBeVisible();
  await expect(preview.getByRole("tab", { name: "Team notes" })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshots, "desktop-production-preview.png"),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});
