'use client';

import React, { createContext, useContext, useState } from 'react';
import { AuthState, Organization, UserProfile, PlatformRole, OrganizationMembership } from '@field/types';

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
    id: 'org_nig_og',
    name: 'West African Offshore Services Ltd',
    slug: 'wa-offshore',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'org_uk_rental',
    name: 'Caledonian Heavy Equipment Rentals',
    slug: 'caledonian-rentals',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user] = useState<UserProfile | null>(MOCK_USER);
  const [activeOrganization, setActiveOrg] = useState<Organization | null>(MOCK_ORGS[0]);
  const [memberships] = useState<OrganizationMembership[]>([
    {
      id: 'mem_1',
      organization_id: 'org_nig_og',
      user_id: 'usr_1',
      role_key: 'business_admin' as PlatformRole,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mem_2',
      organization_id: 'org_uk_rental',
      user_id: 'usr_1',
      role_key: 'manager' as PlatformRole,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const currentRole = activeOrganization
    ? (memberships.find((m) => m.organization_id === activeOrganization.id)?.role_key || 'employee')
    : null;

  const logout = async () => {
    setIsLoading(true);
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
