import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatedApprovalService, authenticatedSubmissionService } =
  vi.hoisted(() => ({
    authenticatedApprovalService: vi.fn(),
    authenticatedSubmissionService: vi.fn(),
  }));

vi.mock("@/lib/services/server-form-service", () => ({
  authenticatedApprovalService,
  authenticatedSubmissionService,
}));

import { GET as GET_APPROVAL_TASKS } from "../tasks/route";
import { POST as POST_STAGE_APPROVE } from "../../approval-stages/[stageInstanceId]/approve/route";
import { POST as POST_STAGE_REJECT } from "../../approval-stages/[stageInstanceId]/reject/route";
import { POST as POST_STAGE_RETURN } from "../../approval-stages/[stageInstanceId]/return/route";
import { POST as POST_FORM_SUBMISSION } from "../../forms/[formId]/submissions/route";
import { POST as POST_RESUBMIT } from "../../submissions/[submissionId]/resubmit/route";

describe("Approvals & Workflow Submission API Routes", () => {
  const mockApprovalService = {
    listMyPendingApprovals: vi.fn(),
    decideStage: vi.fn(),
  };
  const mockSubmissionService = {
    submitAuthenticatedForm: vi.fn(),
    resubmitSubmission: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedApprovalService.mockResolvedValue({
      userId: "user-mgr-1",
      service: mockApprovalService,
    });
    authenticatedSubmissionService.mockResolvedValue({
      userId: "user-emp-1",
      service: mockSubmissionService,
    });
  });

  describe("GET /api/approvals/tasks", () => {
    it("returns 400 when organizationId is missing", async () => {
      const res = await GET_APPROVAL_TASKS(
        new NextRequest("http://localhost/api/approvals/tasks"),
      );
      expect(res.status).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      authenticatedApprovalService.mockRejectedValue(
        new Error("AUTHENTICATION_REQUIRED"),
      );
      const res = await GET_APPROVAL_TASKS(
        new NextRequest("http://localhost/api/approvals/tasks?organizationId=org-1"),
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 with pending approval tasks", async () => {
      const tasks = [{ stage: { id: "stg-1", stage_name: "Manager Review" } }];
      mockApprovalService.listMyPendingApprovals.mockResolvedValue(tasks);

      const res = await GET_APPROVAL_TASKS(
        new NextRequest("http://localhost/api/approvals/tasks?organizationId=org-1"),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ tasks });
      expect(mockApprovalService.listMyPendingApprovals).toHaveBeenCalledWith({
        userId: "user-mgr-1",
        organizationId: "org-1",
      });
    });
  });

  describe("POST /api/approval-stages/[stageInstanceId]/{approve,reject,return}", () => {
    it("executes approve, reject, and return routes cleanly", async () => {
      mockApprovalService.decideStage.mockResolvedValue({
        decisionId: "dec-1",
        submissionStatus: "approved",
      });

      const approveRes = await POST_STAGE_APPROVE(
        new NextRequest("http://localhost/api/approval-stages/stg-1/approve", {
          method: "POST",
          body: JSON.stringify({ organizationId: "org-1", comment: "Approved" }),
        }),
        { params: Promise.resolve({ stageInstanceId: "stg-1" }) },
      );
      expect(approveRes.status).toBe(200);
      expect(mockApprovalService.decideStage).toHaveBeenCalledWith({
        userId: "user-mgr-1",
        organizationId: "org-1",
        stageInstanceId: "stg-1",
        decision: "approved",
        comment: "Approved",
      });

      await POST_STAGE_REJECT(
        new NextRequest("http://localhost/api/approval-stages/stg-1/reject", {
          method: "POST",
          body: JSON.stringify({ organizationId: "org-1", comment: "Denied" }),
        }),
        { params: Promise.resolve({ stageInstanceId: "stg-1" }) },
      );
      expect(mockApprovalService.decideStage).toHaveBeenLastCalledWith({
        userId: "user-mgr-1",
        organizationId: "org-1",
        stageInstanceId: "stg-1",
        decision: "rejected",
        comment: "Denied",
      });

      await POST_STAGE_RETURN(
        new NextRequest("http://localhost/api/approval-stages/stg-1/return", {
          method: "POST",
          body: JSON.stringify({ organizationId: "org-1", comment: "Fix total" }),
        }),
        { params: Promise.resolve({ stageInstanceId: "stg-1" }) },
      );
      expect(mockApprovalService.decideStage).toHaveBeenLastCalledWith({
        userId: "user-mgr-1",
        organizationId: "org-1",
        stageInstanceId: "stg-1",
        decision: "returned",
        comment: "Fix total",
      });
    });

    it("maps authorization, conflict, and comment-required errors to 403/409/422", async () => {
      mockApprovalService.decideStage.mockRejectedValueOnce(
        new Error("Unauthorized: User is not assigned."),
      );
      const forbiddenRes = await POST_STAGE_APPROVE(
        new NextRequest("http://localhost/api/approval-stages/stg-1/approve", {
          method: "POST",
          body: JSON.stringify({ organizationId: "org-1" }),
        }),
        { params: Promise.resolve({ stageInstanceId: "stg-1" }) },
      );
      expect(forbiddenRes.status).toBe(403);

      mockApprovalService.decideStage.mockRejectedValueOnce(
        new Error("APPROVAL_STAGE_ALREADY_DECIDED: Already decided."),
      );
      const conflictRes = await POST_STAGE_APPROVE(
        new NextRequest("http://localhost/api/approval-stages/stg-1/approve", {
          method: "POST",
          body: JSON.stringify({ organizationId: "org-1" }),
        }),
        { params: Promise.resolve({ stageInstanceId: "stg-1" }) },
      );
      expect(conflictRes.status).toBe(409);

      mockApprovalService.decideStage.mockRejectedValueOnce(
        new Error("COMMENT_REQUIRED: Comment is required."),
      );
      const commentRes = await POST_STAGE_REJECT(
        new NextRequest("http://localhost/api/approval-stages/stg-1/reject", {
          method: "POST",
          body: JSON.stringify({ organizationId: "org-1" }),
        }),
        { params: Promise.resolve({ stageInstanceId: "stg-1" }) },
      );
      expect(commentRes.status).toBe(422);
    });
  });

  describe("Authenticated submit & resubmit routes", () => {
    it("POST /api/forms/[formId]/submissions creates submission and returns 201", async () => {
      mockSubmissionService.submitAuthenticatedForm.mockResolvedValue({
        submission: { id: "sub-1", status: "pending_approval" },
        approvalStarted: true,
      });

      const res = await POST_FORM_SUBMISSION(
        new NextRequest("http://localhost/api/forms/form-1/submissions", {
          method: "POST",
          body: JSON.stringify({
            organizationId: "org-1",
            fields: { title: "Requisition" },
          }),
        }),
        { params: Promise.resolve({ formId: "form-1" }) },
      );
      expect(res.status).toBe(201);
      expect(mockSubmissionService.submitAuthenticatedForm).toHaveBeenCalledWith({
        userId: "user-emp-1",
        organizationId: "org-1",
        formId: "form-1",
        payload: {
          fields: { title: "Requisition" },
          details: undefined,
          notes: undefined,
          documents: undefined,
        },
      });
    });

    it("POST /api/submissions/[submissionId]/resubmit handles resubmit and 409 conflict", async () => {
      mockSubmissionService.resubmitSubmission.mockResolvedValueOnce({
        submission: { id: "sub-1", status: "pending_approval" },
        approvalStarted: true,
      });

      const okRes = await POST_RESUBMIT(
        new NextRequest("http://localhost/api/submissions/sub-1/resubmit", {
          method: "POST",
          body: JSON.stringify({
            organizationId: "org-1",
            fields: { title: "Updated Requisition" },
          }),
        }),
        { params: Promise.resolve({ submissionId: "sub-1" }) },
      );
      expect(okRes.status).toBe(200);

      mockSubmissionService.resubmitSubmission.mockRejectedValueOnce(
        new Error("SUBMISSION_NOT_RETURNED: Not returned"),
      );
      const conflictRes = await POST_RESUBMIT(
        new NextRequest("http://localhost/api/submissions/sub-1/resubmit", {
          method: "POST",
          body: JSON.stringify({
            organizationId: "org-1",
            fields: { title: "Updated Requisition" },
          }),
        }),
        { params: Promise.resolve({ submissionId: "sub-1" }) },
      );
      expect(conflictRes.status).toBe(409);
    });
  });
});
