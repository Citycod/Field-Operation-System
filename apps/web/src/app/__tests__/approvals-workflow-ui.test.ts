import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("Phase 6B / 7B Approvals UI & Drawer Wiring", () => {
  it("implements tenant-scoped Approvals Queue page without direct Supabase calls", () => {
    const page = source("src/app/(platform)/approvals/page.tsx");

    expect(page).toContain("Approvals Workflow");
    expect(page).toContain("/api/approvals/tasks?organizationId=");
    expect(page).toContain("Review & Decide");
    expect(page).toContain("SubmissionDetailDrawer");
    expect(page).toContain("onDecisionComplete");
    expect(page).toContain("No pending approvals");
    expect(page).not.toContain("@supabase");
  });

  it("integrates Approval Action Card, Immutable Approval History Timeline, and Returned Resubmit in SubmissionDetailDrawer", () => {
    const drawer = source("src/components/submissions/submission-detail-drawer.tsx");

    expect(drawer).toContain("Approval decision panel");
    expect(drawer).toContain("/api/approval-stages/");
    expect(drawer).toContain('"approve"');
    expect(drawer).toContain('"reject"');
    expect(drawer).toContain('"return"');
    expect(drawer).toContain("Approval History");
    expect(drawer).toContain("Workflow Cycle #");
    expect(drawer).toContain("/resubmit");
    expect(drawer).toContain("Edit & Resubmit");
    expect(drawer).not.toContain("@supabase");
  });
});
