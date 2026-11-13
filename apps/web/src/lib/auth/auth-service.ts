import { UserProfile } from '@field/types';

export type AuthUser = UserProfile;

export interface AuthSession {
  userId: string;
  accessToken: string;
  expiresAt?: number;
}

export interface AuthResult {
  user: AuthUser | null;
  error: Error | null;
}

export interface SignUpResult {
  user: AuthUser | null;
  session: AuthSession | null;
  error: Error | null;
  requiresEmailVerification?: boolean;
}

export interface AuthService {
  /**
   * Signs in a user with work email and password.
   */
  signInWithEmail(email: string, password: string): Promise<AuthResult>;

  /**
   * Registers a new user account with email and password.
   */
  signUpWithEmail(
    email: string,
    password: string,
    options?: { firstName?: string; lastName?: string; emailRedirectTo?: string },
  ): Promise<SignUpResult>;

  /**
   * Signs out the currently authenticated user session.
   */
  signOut(): Promise<void>;

  /**
   * Retrieves the current authenticated user identity from secure server/session context.
   * Client-provided user IDs are NEVER trusted for identity resolution.
   */
  getCurrentUser(): Promise<AuthUser | null>;

  /**
   * Retrieves active session details if available.
   */
  getSession(): Promise<AuthSession | null>;
}
