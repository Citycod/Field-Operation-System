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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrganization, setActiveOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantStatus, setTenantStatus] = useState<TenantResolutionStatus>('loading');
  const [tenantError, setTenantError] = useState<string | null>(null);
  const requestId = useRef(0);

  const clearState = useCallback(() => {
    setUser(null);
    setMemberships([]);
    setOrganizations([]);
    setActiveOrg(null);
    setTenantError(null);
  }, []);

  const loadAuth = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setTenantStatus('loading');
    setTenantError(null);

    try {
      const currentUser = await defaultAuthService.getCurrentUser();
      if (currentRequest !== requestId.current) return;

      if (!currentUser) {
        clearState();
        setTenantStatus('no-membership');
        return;
      }

      setUser(currentUser);

      try {
        const userMemberships = await defaultMembershipRepository.findByUserId(currentUser.id);
        if (currentRequest !== requestId.current) return;
        setMemberships(userMemberships);

        if (userMemberships.length === 0) {
          setOrganizations([]);
          setActiveOrg(null);
          setTenantStatus('no-membership');
          return;
        }

        const userOrgs = await defaultOrgRepository.findManyByIds(
          userMemberships.map((membership) => membership.organization_id),
        );
        if (currentRequest !== requestId.current) return;

        setOrganizations(userOrgs);
        setActiveOrg((existing) =>
          userOrgs.find((organization) => organization.id === existing?.id) ?? userOrgs[0] ?? null,
        );
        setTenantStatus(userOrgs.length > 0 ? 'ready' : 'no-membership');
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        setMemberships([]);
        setOrganizations([]);
        setActiveOrg(null);
        setTenantStatus('error');
        setTenantError(error instanceof Error ? error.message : 'Unable to load tenant access.');
      }
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      clearState();
      setTenantStatus('error');
      setTenantError(error instanceof Error ? error.message : 'Unable to verify the current session.');
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [clearState]);

  useEffect(() => {
    void loadAuth();

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = createClient();
      subscription = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          requestId.current += 1;
          clearState();
          setTenantStatus('no-membership');
          setIsLoading(false);
          return;
        }

        // Supabase invokes this callback while its auth lock is held. Defer
        // follow-up auth/database calls so sign-in and token refresh can finish.
        window.setTimeout(() => void loadAuth(), 0);
      }).data.subscription;
    } catch (error) {
      setIsLoading(false);
      setTenantStatus('error');
      setTenantError(error instanceof Error ? error.message : 'Authentication is not configured.');
    }

    return () => subscription?.unsubscribe();
  }, [clearState, loadAuth]);

  const currentRole = activeOrganization
    ? (memberships.find((membership) => membership.organization_id === activeOrganization.id)?.role_key ?? null)
    : null;

  const setActiveOrganization = (organization: Organization) => {
    if (organizations.some((candidate) => candidate.id === organization.id)) {
      setActiveOrg(organization);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await defaultAuthService.signOut();
      requestId.current += 1;
      clearState();
      setTenantStatus('no-membership');
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
        reload: loadAuth,
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
