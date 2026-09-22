'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthState, Organization, UserProfile, PlatformRole, OrganizationMembership } from '@field/types';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser, getUserMemberships, getUserOrganizations } from '@/lib/supabase/auth';

interface AuthContextType extends AuthState {
  setActiveOrganization: (org: Organization) => void;
  logout: () => Promise<void>;
}

const MOCK_USER: UserProfile = {
  id: 'usr_1',
  email: 'operator@fieldops.ng',
  first_name: 'Operational',
  last_name: 'Lead',
  status: 'active',
};

const MOCK_ORGS: Organization[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'West African Offshore Services Ltd',
    slug: 'wa-offshore',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    name: 'Caledonian Heavy Equipment Rentals',
    slug: 'caledonian-rentals',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_MEMBERSHIPS: OrganizationMembership[] = [
  {
    id: 'mem_1',
    organization_id: 'a0000000-0000-0000-0000-000000000001',
    user_id: 'usr_1',
    role_key: 'business_admin' as PlatformRole,
    status: 'active' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mem_2',
    organization_id: 'a0000000-0000-0000-0000-000000000002',
    user_id: 'usr_1',
    role_key: 'manager' as PlatformRole,
    status: 'active' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrganization, setActiveOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAuth() {
      // If Supabase URL is placeholder/not configured, fall back to default demo state
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        setUser(MOCK_USER);
        setMemberships(MOCK_MEMBERSHIPS);
        setOrganizations(MOCK_ORGS);
        setActiveOrg(MOCK_ORGS[0]);
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          const userMemberships = await getUserMemberships(currentUser.id);
          setMemberships(userMemberships);

          if (userMemberships.length > 0) {
            const orgIds = userMemberships.map((m) => m.organization_id);
            const userOrgs = await getUserOrganizations(orgIds);
            setOrganizations(userOrgs);
            setActiveOrg(userOrgs[0] || null);
          }
        } else {
          setUser(null);
          setMemberships([]);
          setOrganizations([]);
          setActiveOrg(null);
        }
      } catch {
        setUser(MOCK_USER);
        setMemberships(MOCK_MEMBERSHIPS);
        setOrganizations(MOCK_ORGS);
        setActiveOrg(MOCK_ORGS[0]);
      } finally {
        setIsLoading(false);
      }
    }

    loadAuth();

    let unsubscribeFn = () => {};

    // Listen to Supabase auth state changes if configured
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      const supabase = createClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        loadAuth();
      });
      unsubscribeFn = () => subscription.unsubscribe();
    }

    return () => {
      unsubscribeFn();
    };
  }, []);

  const currentRole = activeOrganization
    ? (memberships.find((m) => m.organization_id === activeOrganization.id)?.role_key || 'employee')
    : null;

  const logout = async () => {
    setIsLoading(true);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    setUser(null);
    setActiveOrg(null);
    setMemberships([]);
    setOrganizations([]);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrganization,
        memberships,
        currentRole,
        isAuthenticated: !!user,
        isLoading,
        setActiveOrganization: setActiveOrg,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
