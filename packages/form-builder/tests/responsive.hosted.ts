import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { loadHostedEnvironment, repositoryRoot } from "./hosted-environment";

test.describe.configure({ mode: "serial" });

const env = loadHostedEnvironment();
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const managementUrl = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
const screenshots = path.join(repositoryRoot, "docs/qa/responsive");
const runId = randomUUID().replaceAll("-", "");
const organizationId = randomUUID();
const email = `responsive-${runId}@example.com`;
const password = randomBytes(32).toString("base64url");
let userId = "";

async function request(url: string, init: RequestInit) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok)
        throw new Error(
          `Hosted fixture request failed with HTTP ${response.status}.`,
        );
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    } catch (error) {
      lastError = error;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

async function executeSql(query: string) {
  return request(managementUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, read_only: false }),
  });
}

async function cleanStaleFixtures() {
  await executeSql(`
    BEGIN;
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.form_versions
    WHERE organization_id IN (
      SELECT id FROM public.organizations WHERE slug LIKE 'responsive-%'
    );
    DELETE FROM public.forms
    WHERE organization_id IN (
      SELECT id FROM public.organizations WHERE slug LIKE 'responsive-%'
    );
    DELETE FROM public.organization_memberships
    WHERE organization_id IN (
      SELECT id FROM public.organizations WHERE slug LIKE 'responsive-%'
    );
    DELETE FROM public.organizations WHERE slug LIKE 'responsive-%';
    COMMIT;
  `);
  const users = await request(
    `${projectUrl}/auth/v1/admin/users?per_page=1000`,
    {
      method: "GET",
      headers: { apikey: env.SUPABASE_SECRET_KEY },
    },
  );
  for (const user of users.users ?? []) {
    if (!user.email?.startsWith("responsive-")) continue;
    await request(`${projectUrl}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: env.SUPABASE_SECRET_KEY },
    });
  }
}

async function signIn(page: Page) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.getByLabel("Work Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForURL(/\/dashboard$/, { timeout: 90_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await page.goto("/login");
      await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

async function screenshot(page: Page, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    `${name} must not create page-level horizontal overflow`,
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshots, `${name}.png`),
    fullPage: true,
  });
}

test.beforeAll(async () => {
  mkdirSync(screenshots, { recursive: true });
  await cleanStaleFixtures();
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
    VALUES ('${organizationId}', 'Responsive UX verification', 'responsive-${runId}');
    INSERT INTO public.organization_memberships (organization_id, user_id, role_key, status)
    VALUES ('${organizationId}', '${userId}', 'business_admin', 'active');
  `);
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
    if (userId) {
      await request(`${projectUrl}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: { apikey: env.SUPABASE_SECRET_KEY },
      });
    }
  }
});

test("verifies the responsive production flow at desktop, tablet, and mobile", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign In to FieldOps" }),
  ).toBeVisible();
  await screenshot(page, "login-mobile");
  await page.setViewportSize({ width: 1536, height: 1080 });
  await screenshot(page, "login-desktop");

  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Platform Operations Workspace" }),
  ).toBeVisible({ timeout: 60_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await screenshot(page, "dashboard-mobile");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const mobileNavigation = page.getByRole("dialog", {
    name: "Platform navigation",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    mobileNavigation.getByRole("button", {
      name: "Responsive UX verification",
    }),
  ).toBeVisible();
  await screenshot(page, "platform-shell-mobile");
  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Platform navigation" }),
  ).toBeVisible();
  await screenshot(page, "platform-shell-tablet");
  await page.getByRole("button", { name: "Close navigation" }).last().click();
  await screenshot(page, "dashboard-tablet");

  await page.setViewportSize({ width: 1536, height: 1080 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeHidden();
  await screenshot(page, "platform-shell-desktop");
  await screenshot(page, "dashboard-desktop");

  await page.goto("/forms");
  await expect(page.getByRole("heading", { name: "No forms yet" })).toBeVisible(
    { timeout: 60_000 },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "form-library-mobile");
  await page.setViewportSize({ width: 1536, height: 1080 });
  await screenshot(page, "form-library-desktop");

  await page.getByRole("link", { name: "Create Form" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Create New Form" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "create-form-mobile");
  await page.setViewportSize({ width: 1536, height: 1080 });
  await screenshot(page, "create-form-desktop");

  await page.getByLabel("Form title").fill("Responsive Operations Form");
  await page
    .getByLabel("Description")
    .fill("Phase 3.6 responsive verification");
  const createRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/forms") &&
      response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Create and Open Builder" }).click();
  expect((await createRequest).status()).toBe(201);
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+\/builder$/, {
    timeout: 120_000,
  });
  await expect(
    page.getByRole("heading", { name: /Responsive Operations Form/ }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "＋ Header section" }).click();
  await page.getByLabel("Section title").fill("Visitor information");
  await page.getByRole("button", { name: "Add Text field" }).click();
  await page.getByLabel("Field label").fill("Visitor name");

  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  let addTab = page.getByRole("dialog", { name: "Add Tab" });
  await addTab.getByLabel("Tab name").fill("Visit items");
  await addTab.getByRole("button", { name: /Details \/ Grid/ }).click();
  await addTab.getByRole("button", { name: "Add Tab", exact: true }).click();
  await page.getByRole("button", { name: "Add Text field" }).click();
  await page.getByLabel("Field label").fill("Item");

  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  addTab = page.getByRole("dialog", { name: "Add Tab" });
  await addTab.getByLabel("Tab name").fill("Visit notes");
  await addTab.getByRole("button", { name: /^Notes/ }).click();
  await addTab.getByRole("button", { name: "Add Tab", exact: true }).click();

  const saveRequest = page.waitForResponse(
    (response) =>
      response.url().includes("/api/forms/") &&
      response.url().endsWith("/draft") &&
      response.request().method() === "PUT",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Save Draft" }).click();
  expect((await saveRequest).status()).toBe(200);
  await expect(
    page.getByText("Draft save completed through the host callback."),
  ).toBeVisible();
  await screenshot(page, "builder-desktop");

  await page.getByRole("button", { name: "▷ Preview" }).click();
  let preview = page.getByRole("dialog", { name: "Form preview" });
  await expect(preview.getByLabel("Visitor name")).toBeVisible();
  await screenshot(page, "preview-desktop");
  await preview.getByRole("button", { name: "Close" }).click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByLabel("Component palette")).toBeVisible();
  await expect(page.getByLabel("Properties panel")).toBeVisible();
  await screenshot(page, "builder-tablet");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBuilder = page.getByLabel("Mobile builder guidance");
  await expect(mobileBuilder).toContainText(
    "optimized for desktop or tablet authoring",
  );
  await expect(page.getByLabel("Component palette")).toBeHidden();
  await screenshot(page, "builder-mobile");

  await mobileBuilder
    .getByRole("button", { name: "▷ Preview current draft" })
    .click();
  preview = page.getByRole("dialog", { name: "Form preview" });
  await expect(preview.getByLabel("Visitor name")).toBeVisible();
  await screenshot(page, "preview-mobile");
  await preview.getByRole("tab", { name: "Visit items" }).click();
  await expect(
    preview.getByRole("button", { name: "+ Add row" }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "+ Add row" }).click();
  await expect(
    preview.getByRole("button", { name: "Delete row 1" }),
  ).toBeVisible();
  await screenshot(page, "details-grid-mobile");
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(
    mobileBuilder.getByRole("button", { name: "▷ Preview current draft" }),
  ).toBeFocused();

  await page.goto("/forms");
  await expect(
    page.getByRole("heading", { name: "Responsive Operations Form" }),
  ).toBeVisible({ timeout: 60_000 });
  await screenshot(page, "form-library-populated-mobile");

  await page.goto("/approvals");
  await expect(
    page.getByRole("heading", { name: "Approvals Workflow" }),
  ).toBeVisible();
  await screenshot(page, "approvals-mobile");
  await page.goto("/administration");
  await expect(
    page.getByRole("heading", { name: "Tenant Administration" }),
  ).toBeVisible();
  await screenshot(page, "administration-mobile");

  expect(pageErrors).toEqual([]);
});
