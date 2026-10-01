import { expect, test } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadHostedEnvironment } from './hosted-environment';

test.describe.configure({ mode: 'serial' });

const env = loadHostedEnvironment();
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const managementUrl = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
const runId = randomUUID().replaceAll('-', '');
const organizationId = randomUUID();
const memberEmail = `auth-member-${runId}@example.com`;
const noMembershipEmail = `auth-no-membership-${runId}@example.com`;
const memberPassword = randomBytes(32).toString('base64url');
const noMembershipPassword = randomBytes(32).toString('base64url');
const userIds: string[] = [];

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Hosted fixture request failed with HTTP ${response.status}.`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function executeSql(query: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await request(managementUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, read_only: false }),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

async function createUser(email: string, password: string) {
  const user = await request(`${projectUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  userIds.push(user.id);
  return user.id as string;
}

async function deleteUsers() {
  for (const userId of userIds) {
    let deleted = false;
    for (let attempt = 1; attempt <= 3 && !deleted; attempt += 1) {
      try {
        const response = await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { apikey: env.SUPABASE_SECRET_KEY },
        });
        if (!response.ok && response.status !== 404) {
          throw new Error(`Hosted test-user cleanup failed with HTTP ${response.status}.`);
        }
        deleted = true;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
}

async function cleanStaleAuthFixtures() {
  await executeSql(`
    BEGIN;
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.form_versions
    WHERE organization_id IN (
      SELECT id FROM public.organizations
      WHERE name = 'Auth stabilization verification' AND slug LIKE 'auth-stabilization-%'
    );
    DELETE FROM public.forms
    WHERE organization_id IN (
      SELECT id FROM public.organizations
      WHERE name = 'Auth stabilization verification' AND slug LIKE 'auth-stabilization-%'
    );
    DELETE FROM public.organization_memberships
    WHERE organization_id IN (
      SELECT id FROM public.organizations
      WHERE name = 'Auth stabilization verification' AND slug LIKE 'auth-stabilization-%'
    );
    DELETE FROM public.organizations
    WHERE name = 'Auth stabilization verification' AND slug LIKE 'auth-stabilization-%';
    COMMIT;
  `);

  const result = await request(`${projectUrl}/auth/v1/admin/users?per_page=1000`, {
    method: 'GET',
    headers: { apikey: env.SUPABASE_SECRET_KEY },
  });
  const staleUsers = (result.users ?? []).filter((user: { email?: string }) =>
    user.email?.startsWith('auth-member-') || user.email?.startsWith('auth-no-membership-'),
  );
  for (const user of staleUsers) {
    const response = await fetch(`${projectUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SECRET_KEY },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Stale hosted test-user cleanup failed with HTTP ${response.status}.`);
    }
  }
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.getByLabel('Work Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByLabel('Password').fill('');
}

test.beforeAll(async () => {
  await cleanStaleAuthFixtures();
  const memberUserId = await createUser(memberEmail, memberPassword);
  await createUser(noMembershipEmail, noMembershipPassword);
  await executeSql(`
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('${organizationId}', 'Auth stabilization verification', 'auth-stabilization-${runId}');
    INSERT INTO public.organization_memberships (organization_id, user_id, role_key, status)
    VALUES ('${organizationId}', '${memberUserId}', 'business_admin', 'active');
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
    await deleteUsers();
  }
});

test('protects routes and preserves one real session through navigation, refresh, logout, and re-login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

  await page.goto('/forms');
  await expect(page).toHaveURL(/\/login\?next=%2Fforms$/);

  const unauthenticatedApi = await page.request.get(`/api/forms?organizationId=${organizationId}`);
  expect(unauthenticatedApi.status()).toBe(401);

  await page.goto('/login');
  await signIn(page, memberEmail, memberPassword);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Platform Operations Workspace' })).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: 'Form Builder', exact: true }).click();
  await expect(page).toHaveURL(/\/forms$/);
  await expect(page.getByRole('heading', { name: 'Form Library' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Platform Operations Workspace' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/forms');
  await expect(page.getByRole('heading', { name: 'Form Library' })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Form Library' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Create Form' }).first().click();
  await page.getByLabel('Form title').fill('Auth lifecycle hosted form');
  await page.getByLabel('Description').fill('Created during authentication route verification');
  await page.getByRole('button', { name: 'Create and Open Builder' }).click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+\/builder$/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: /Auth lifecycle hosted form/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Platform Operations Workspace' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

  await page.goto('/login');
  await signIn(page, memberEmail, memberPassword);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Platform Operations Workspace' })).toBeVisible({ timeout: 60_000 });
});

test('keeps an authenticated user without membership signed in and shows setup access state', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, noMembershipEmail, noMembershipPassword);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Organization access is required' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`Signed in as ${noMembershipEmail}`)).toBeVisible();

  const forbiddenApi = await page.request.get(`/api/forms?organizationId=${organizationId}`);
  expect(forbiddenApi.status()).toBe(403);

  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Organization access is required' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
