import { AuthService, AuthResult, AuthUser, AuthSession } from './auth-service';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser as fetchSupabaseCurrentUser } from '@/lib/supabase/auth';

export class SupabaseAuthService implements AuthService {
  async signInWithEmail(email: string, password: string): Promise<AuthResult> {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return {
        user: null,
        error: error ? new Error(error.message) : new Error('Authentication failed'),
      };
    }

    const user = await this.getCurrentUser();
    return {
      user,
      error: null,
    };
  }

  async signOut(): Promise<void> {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return fetchSupabaseCurrentUser();
  }

  async getSession(): Promise<AuthSession | null> {
    const supabase = createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    return {
      userId: session.user.id,
      accessToken: session.access_token,
      expiresAt: session.expires_at,
    };
  }
}
