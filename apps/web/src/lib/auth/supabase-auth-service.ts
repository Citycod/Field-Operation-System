import { AuthService, AuthResult, SignUpResult, AuthUser, AuthSession } from './auth-service';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser as fetchSupabaseCurrentUser } from '@/lib/supabase/auth';
import { env } from '@/lib/env/env';

export function resolveApplicationOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return env.appUrl || 'http://localhost:3000';
}

export class SupabaseAuthService implements AuthService {
  async signInWithEmail(email: string, password: string): Promise<AuthResult> {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      return {
        user: null,
        error: error ? new Error(error.message) : new Error('Authentication failed'),
      };
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email || '',
        first_name: (data.user.user_metadata?.first_name as string) || '',
        last_name: (data.user.user_metadata?.last_name as string) || '',
        avatar_url: (data.user.user_metadata?.avatar_url as string) || undefined,
        status: 'active',
      },
      error: null,
    };
  }

  async signUpWithEmail(
    email: string,
    password: string,
    options?: { firstName?: string; lastName?: string; emailRedirectTo?: string },
  ): Promise<SignUpResult> {
    const supabase = createClient();
    const origin = resolveApplicationOrigin();
    const emailRedirectTo =
      options?.emailRedirectTo || `${origin}/auth/callback?next=/business/signup`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: options?.firstName || '',
          last_name: options?.lastName || '',
        },
      },
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: new Error(error.message),
        requiresEmailVerification: false,
      };
    }

    if (!data.user) {
      return {
        user: null,
        session: null,
        error: new Error('User registration failed.'),
        requiresEmailVerification: false,
      };
    }

    const user: AuthUser = {
      id: data.user.id,
      email: data.user.email || '',
      first_name: (data.user.user_metadata?.first_name as string) || options?.firstName || '',
      last_name: (data.user.user_metadata?.last_name as string) || options?.lastName || '',
      avatar_url: (data.user.user_metadata?.avatar_url as string) || undefined,
      status: 'active',
    };

    const session: AuthSession | null = data.session
      ? {
          userId: data.session.user.id,
          accessToken: data.session.access_token,
          expiresAt: data.session.expires_at,
        }
      : null;

    const requiresEmailVerification = Boolean(user && !session);

    return {
      user,
      session,
      error: null,
      requiresEmailVerification,
    };
  }

  async signOut(): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
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
