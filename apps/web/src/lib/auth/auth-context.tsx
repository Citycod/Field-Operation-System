'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AuthState, Organization, OrganizationMembership, UserProfile } from '@field/types';
import type { AuthService } from './auth-service';
import { SupabaseAuthService } from './supabase-auth-service';
import type { OrganizationRepository } from '@/lib/repositories/organization-repository';
import { SupabaseOrganizationRepository } from '@/lib/repositories/supabase/supabase-organization-repository';
import type { MembershipRepository } from '@/lib/repositories/membership-repository';
import { SupabaseMembershipRepository } from '@/lib/repositories/supabase/supabase-membership-repository';
import { createClient } from '@/lib/supabase/client';

export type TenantResolutionStatus = 'loading' | 'ready' | 'no-membership' | 'error';

interface AuthContextType extends AuthState {
  organizations: Organization[];
  tenantStatus: TenantResolutionStatus;
  tenantError: string | null;
  setActiveOrganization: (org: Organization) => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const defaultAuthService: AuthService = new SupabaseAuthService();
const defaultOrgRepository: OrganizationRepository = new SupabaseOrganizationRepository();
const defaultMembershipRepository: MembershipRepository = new SupabaseMembershipRepository();

const ACTIVE_ORG_STORAGE_KEY = 'fieldops.activeOrganizationId';

function readStoredOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrganizationId(organizationId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (organizationId) {
      window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, organizationId);
    } else {
      window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrganization, setActiveOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantStatus, setTenantStatus] = useState<TenantResolutionStatus>('loading');
  const [tenantError, setTenantError] = useState<string | null>(null);
  const requestId = useRef(0);
  const userRef = useRef<UserProfile | null>(null);
  const tenantStatusRef = useRef<TenantResolutionStatus>('loading');

  const updateTenantStatus = useCallback((nextStatus: TenantResolutionStatus) => {
    tenantStatusRef.current = nextStatus;
    setTenantStatus(nextStatus);
  }, []);

  const clearState = useCallback(() => {
    userRef.current = null;
    setUser(null);
    setMemberships([]);
    setOrganizations([]);
    setActiveOrg(null);
    setTenantError(null);
  }, []);

  const loadAuth = useCallback(
    async (options?: { background?: boolean }) => {
      const isBackground =
        options?.background === true &&
        userRef.current !== null &&
        tenantStatusRef.current === 'ready';
      const currentRequest = ++requestId.current;

      if (!isBackground) {
        setIsLoading(true);
        updateTenantStatus('loading');
        setTenantError(null);
      }

      try {
        const currentUser = await defaultAuthService.getCurrentUser();
        if (currentRequest !== requestId.current) return;

        if (!currentUser) {
          clearState();
          writeStoredOrganizationId(null);
          updateTenantStatus('no-membership');
          return;
        }

        userRef.current = currentUser;
        setUser((existing) =>
          existing &&
          existing.id === currentUser.id &&
          existing.email === currentUser.email &&
          existing.first_name === currentUser.first_name &&
          existing.last_name === currentUser.last_name
            ? existing
            : currentUser,
        );

        try {
          const userMemberships = await defaultMembershipRepository.findByUserId(currentUser.id);
          if (currentRequest !== requestId.current) return;
          setMemberships(userMemberships);

          if (userMemberships.length === 0) {
            setOrganizations([]);
            setActiveOrg(null);
            writeStoredOrganizationId(null);
            updateTenantStatus('no-membership');
            return;
          }

          const userOrgs = await defaultOrgRepository.findManyByIds(
            userMemberships.map((membership) => membership.organization_id),
          );
          if (currentRequest !== requestId.current) return;

          setOrganizations(userOrgs);
          const storedOrgId = readStoredOrganizationId();
          setActiveOrg((existing) => {
            const preferredId = existing?.id ?? storedOrgId;
            const nextOrg =
              userOrgs.find((organization) => organization.id === preferredId) ??
              userOrgs[0] ??
              null;
            if (!nextOrg) {
              writeStoredOrganizationId(null);
              return null;
            }
            writeStoredOrganizationId(nextOrg.id);
            if (
              existing &&
              existing.id === nextOrg.id &&
              existing.name === nextOrg.name &&
              existing.slug === nextOrg.slug &&
              existing.status === nextOrg.status
            ) {
              return existing;
            }
            return nextOrg;
          });
          updateTenantStatus(userOrgs.length > 0 ? 'ready' : 'no-membership');
        } catch (error) {
          if (currentRequest !== requestId.current) return;
          // Preserve active workspace on transient background refresh errors.
          if (isBackground) return;
          setMemberships([]);
          setOrganizations([]);
          setActiveOrg(null);
          updateTenantStatus('error');
          setTenantError(error instanceof Error ? error.message : 'Unable to load tenant access.');
        }
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        if (isBackground) return;
        clearState();
        updateTenantStatus('error');
        setTenantError(
          error instanceof Error ? error.message : 'Unable to verify the current session.',
        );
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false);
      }
    },
    [clearState, updateTenantStatus],
  );

  useEffect(() => {
    void loadAuth();

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = createClient();
      subscription = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') {
          // Initial session is already loaded by the mount call above.
          return;
        }

        if (event === 'SIGNED_OUT') {
          requestId.current += 1;
          clearState();
          writeStoredOrganizationId(null);
          updateTenantStatus('no-membership');
          setIsLoading(false);
          return;
        }

        const isSameAuthenticatedUser =
          Boolean(userRef.current) &&
          Boolean(session?.user?.id) &&
          session?.user?.id === userRef.current?.id;

        if (event === 'TOKEN_REFRESHED' && isSameAuthenticatedUser && tenantStatusRef.current === 'ready') {
          // Token refreshed in the background for the current user; no UI disruption needed.
          return;
        }

        // Supabase invokes this callback while its auth lock is held. Defer
        // follow-up auth/database calls so sign-in and token refresh can finish.
        window.setTimeout(
          () => void loadAuth({ background: isSameAuthenticatedUser }),
          0,
        );
      }).data.subscription;
    } catch (error) {
      setIsLoading(false);
      updateTenantStatus('error');
      setTenantError(error instanceof Error ? error.message : 'Authentication is not configured.');
    }

    return () => subscription?.unsubscribe();
  }, [clearState, loadAuth, updateTenantStatus]);

  const currentRole = activeOrganization
    ? (memberships.find((membership) => membership.organization_id === activeOrganization.id)?.role_key ?? null)
    : null;

  const setActiveOrganization = (organization: Organization) => {
    if (organizations.some((candidate) => candidate.id === organization.id)) {
      writeStoredOrganizationId(organization.id);
      setActiveOrg(organization);
    }
  };

  const reload = useCallback(() => loadAuth({ background: false }), [loadAuth]);

  const logout = async () => {
    setIsLoading(true);
    try {
      await defaultAuthService.signOut();
      requestId.current += 1;
      clearState();
      writeStoredOrganizationId(null);
      updateTenantStatus('no-membership');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrganization,
        memberships,
        organizations,
        currentRole,
        isAuthenticated: Boolean(user),
        isLoading,
        tenantStatus,
        tenantError,
        setActiveOrganization,
        reload,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
