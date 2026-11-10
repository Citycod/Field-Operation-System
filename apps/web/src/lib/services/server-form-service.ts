import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SupabaseFormRepository } from "@/lib/repositories/supabase/supabase-form-repository";
import { SupabaseMembershipRepository } from "@/lib/repositories/supabase/supabase-membership-repository";
import { FormService } from "./form-service";
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
    ),
  };
}
