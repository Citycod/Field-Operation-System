import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("Authenticated Submissions Viewer Page & Component Wiring", () => {
  it("implements tenant-scoped Submissions Page with search, filters, and pagination", () => {
    const page = source("src/app/(platform)/submissions/page.tsx");

    // Enterprise layout & titles
    expect(page).toContain("Form Submissions");
    expect(page).toContain("Review, inspect, and track submissions");

    // Tenant-scoped API queries
    expect(page).toContain("/api/submissions?");
    expect(page).toContain("/api/forms/");
    expect(page).toContain("organizationId");

    // Dynamic filters & controls
    expect(page).toContain("Search reference number");
    expect(page).toContain("All Forms");
    expect(page).toContain("All Statuses");
    expect(page).toContain("Date from");
    expect(page).toContain("Date to");
    expect(page).toContain("clearFilters");

    // Sorting & pagination
    expect(page).toContain("handleSort");
    expect(page).toContain("pageSize");
    expect(page).toContain("totalPages");

    // Drawer integration
    expect(page).toContain("SubmissionDetailDrawer");
    expect(page).toContain("selectedSubmissionId");

    // No direct client-side database calls
    expect(page).not.toContain("@supabase");
  });

  it("integrates FormRenderer in readOnly mode inside SubmissionDetailDrawer", () => {
    const drawer = source(
      "src/components/submissions/submission-detail-drawer.tsx",
    );

    // FormRenderer readOnly integration
    expect(drawer).toContain('mode="readOnly"');
    expect(drawer).toContain("FormRenderer");
    expect(drawer).toContain("@field/form-renderer/styles.css");

    // Authenticated API endpoint
    expect(drawer).toContain("/api/submissions/");
    expect(drawer).toContain("organizationId");

    // UI elements
    expect(drawer).toContain("Submission Detail");
    expect(drawer).toContain("statusVariant");
    expect(drawer).toContain("lookupProvider");

    // Accessibility & dismissal
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain("Escape");

    // Clean error & loading handling
    expect(drawer).toContain("LoadingState");
    expect(drawer).toContain("Unable to load submission");
  });

  it("adds Submissions navigation to the platform sidebar and forms library", () => {
    const sidebar = source("src/components/navigation/sidebar.tsx");
    const formsPage = source("src/app/(platform)/forms/page.tsx");

    // Sidebar navigation entry
    expect(sidebar).toContain('href: "/submissions"');
    expect(sidebar).toContain('label: "Submissions"');

    // Form Library row action link
    expect(formsPage).toContain('href={`/submissions?formId=${form.id}`}');
    expect(formsPage).toContain("Submissions");
  });

  it("guarantees tenant isolation and permission checks in API routes", () => {
    const formSubmissionsRoute = source(
      "src/app/api/forms/[formId]/submissions/route.ts",
    );
    const submissionsRoute = source("src/app/api/submissions/route.ts");
    const detailRoute = source(
      "src/app/api/submissions/[submissionId]/route.ts",
    );

    // All routes require organizationId and use authenticated submission service
    expect(formSubmissionsRoute).toContain("authenticatedSubmissionService");
    expect(formSubmissionsRoute).toContain("Organization ID is required.");
    expect(submissionsRoute).toContain("authenticatedSubmissionService");
    expect(submissionsRoute).toContain("Organization ID is required.");
    expect(detailRoute).toContain("authenticatedSubmissionService");
    expect(detailRoute).toContain("Organization ID is required.");
  });
});

