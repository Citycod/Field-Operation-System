import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseFormRepository } from "@/lib/repositories/supabase/supabase-form-repository";
import { SupabaseMembershipRepository } from "@/lib/repositories/supabase/supabase-membership-repository";
import { SupabaseSubmissionRepository } from "@/lib/repositories/supabase/supabase-submission-repository";
import { SupabaseApprovalRepository } from "@/lib/repositories/supabase/supabase-approval-repository";
import { FormService } from "./form-service";
import { SubmissionService } from "./submission-service";
import { ApprovalService } from "./approval-service";
import type { Database } from "@field/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function authenticatedFormService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("AUTHENTICATION_REQUIRED");
  // @supabase/ssr 0.5 models the third SupabaseClient generic using the older
  // client signature. Runtime clients are identical; normalize that type here
  // rather than weakening repository types.
  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new FormService(
      new SupabaseFormRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
      new SupabaseSubmissionRepository(repositoryClient),
    ),
  };
}

export async function authenticatedSubmissionService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("AUTHENTICATION_REQUIRED");
  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new SubmissionService(
      new SupabaseFormRepository(repositoryClient),
      new SupabaseSubmissionRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
      new SupabaseApprovalRepository(repositoryClient),
    ),
  };
}

export async function authenticatedApprovalService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("AUTHENTICATION_REQUIRED");
  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new ApprovalService(
      new SupabaseFormRepository(repositoryClient),
      new SupabaseApprovalRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
    ),
  };
}

export function publicFormService() {
  const repositoryClient = createAdminClient();
  const formRepo = new SupabaseFormRepository(repositoryClient);
  const membershipRepo = new SupabaseMembershipRepository(repositoryClient);
  const submissionRepo = new SupabaseSubmissionRepository(repositoryClient);
  return new FormService(formRepo, membershipRepo, submissionRepo);
}

export function publicSubmissionService() {
  const repositoryClient = createAdminClient();
  const formRepo = new SupabaseFormRepository(repositoryClient);
  const submissionRepo = new SupabaseSubmissionRepository(repositoryClient);
  const approvalRepo = new SupabaseApprovalRepository(repositoryClient);
  return new SubmissionService(formRepo, submissionRepo, undefined, approvalRepo);
}
