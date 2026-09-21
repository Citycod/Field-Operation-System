'use client';

import React from 'react';
import { Sidebar } from '../navigation/sidebar';
import { useAuth } from '@/lib/auth/auth-context';
import { Bell, User } from 'lucide-react';
import { Badge } from '@field/ui';

export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, currentRole, activeOrganization } = useAuth();

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Active Context:
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {activeOrganization?.name || 'No Active Organization'}
            </span>
            {currentRole && (
              <Badge variant="success" className="capitalize text-[10px] py-0.5 px-2">
                {currentRole.replace('_', ' ')}
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <Bell className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />

            <div className="flex items-center space-x-2">
              <div className="h-7 w-7 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-bold">
                <User className="w-4 h-4" />
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold leading-none">{user?.first_name} {user?.last_name}</div>
                <div className="text-[10px] text-slate-400 leading-tight">{user?.email}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Page Container */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
