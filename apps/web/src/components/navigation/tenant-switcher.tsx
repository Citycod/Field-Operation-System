"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Building2, ChevronDown } from "lucide-react";

export function TenantSwitcher() {
  const router = useRouter();
  const { activeOrganization, organizations, setActiveOrganization } =
    useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelectOrg = (org: typeof organizations[number]) => {
    if (org.id !== activeOrganization?.id) {
      setActiveOrganization(org);
      setIsOpen(false);
      router.push('/dashboard');
      router.refresh();
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="tenant-options"
        className="flex items-center justify-between w-full px-3 py-2 text-left bg-slate-900 text-slate-100 rounded-md border border-slate-800 hover:bg-slate-800 transition-colors text-xs font-medium"
      >
        <div className="flex items-center space-x-2 truncate">
          <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">
            {activeOrganization?.name || "Select Organization"}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div
          id="tenant-options"
          role="listbox"
          className="absolute left-0 right-0 mt-1 z-50 max-h-64 overflow-y-auto bg-slate-900 border border-slate-800 rounded-md shadow-lg py-1"
        >
          <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Organizations (Tenants)
          </div>
          {organizations.map((org) => (
            <button
              type="button"
              role="option"
              aria-selected={org.id === activeOrganization?.id}
              key={org.id}
              onClick={() => handleSelectOrg(org)}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                org.id === activeOrganization?.id
                  ? "bg-emerald-950/60 text-emerald-300 font-semibold"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{org.name}</span>
              {org.id === activeOrganization?.id && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 ml-2" />
              )}
            </button>
          ))}
          {organizations.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              No active organization memberships.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
