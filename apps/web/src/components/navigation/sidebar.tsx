"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TenantSwitcher } from "./tenant-switcher";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Inbox,
  Database,
  CheckSquare,
  Briefcase,
  Boxes,
  Users,
  ShieldCheck,
  Settings,
  LucideIcon,
  Menu,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  highlight?: boolean;
}

interface NavSection {
  category: string;
  items: NavItem[];
}

const NAV_ITEMS: NavSection[] = [
  {
    category: "Core",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    category: "Operations (Placeholders)",
    items: [
      {
        label: "Jobs & Work Orders",
        href: "#",
        icon: Briefcase,
        disabled: true,
      },
      { label: "Assets & Equipment", href: "#", icon: Boxes, disabled: true },
    ],
  },
  {
    category: "Management Modules",
    items: [
      {
        label: "Form Builder",
        href: "/forms",
        icon: FileSpreadsheet,
        highlight: true,
      },
      {
        label: "Submissions",
        href: "/submissions",
        icon: Inbox,
      },
      {
        label: "Data Sources",
        href: "/data-sources",
        icon: Database,
      },
      { label: "Approvals Workflow", href: "/approvals", icon: CheckSquare },
    ],
  },
  {
    category: "Administration",
    items: [
      { label: "Users & Roles", href: "/administration", icon: Users },
      {
        label: "Security & Audit",
        href: "#",
        icon: ShieldCheck,
        disabled: true,
      },
      { label: "Settings", href: "#", icon: Settings, disabled: true },
    ],
  },
];

export function Sidebar({
  className = "",
  onNavigate,
  onToggleCollapse,
}: {
  className?: string;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950 text-slate-300 ${className}`}
    >
      {/* Brand Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
            F
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">
              FieldOps
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              Platform v0.1.0
            </p>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tenant Context Selector */}
      <div className="p-2.5 border-b border-slate-800 shrink-0">
        <TenantSwitcher />
      </div>

      {/* Fixed Navigation Links */}
      <div className="flex-1 overflow-hidden px-3 py-3 space-y-3.5">
        {NAV_ITEMS.map((section) => (
          <div key={section.category} className="space-y-0.5">
            <h2 className="px-3 pb-0.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {section.category}
            </h2>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              if (item.disabled) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center px-3 py-1 text-xs font-medium text-slate-500 rounded-md cursor-not-allowed opacity-60"
                  >
                    <Icon className="w-4 h-4 mr-2.5 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-emerald-600/15 text-emerald-400 font-semibold border-l-2 border-emerald-500"
                      : item.highlight
                        ? "text-emerald-300 hover:bg-slate-900 font-medium"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mr-2.5 shrink-0 ${isActive ? "text-emerald-400" : "text-slate-400"}`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Meta */}
      <div className="px-3 py-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Multi-Tenant Active</span>
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>
    </aside>
  );
}
