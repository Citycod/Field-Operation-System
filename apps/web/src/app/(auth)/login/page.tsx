'use client';

import React from 'react';
import { Button, Input } from '@field/ui';
import { Building2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
            F
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Sign In to FieldOps
          </h1>
          <p className="text-xs text-slate-500">
            Enter your credentials to access your tenant workspace
          </p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <Input label="Work Email" type="email" placeholder="operator@company.com" defaultValue="operator@fieldops.ng" />
          <Input label="Password" type="password" placeholder="••••••••" defaultValue="••••••••" />

          <Link href="/dashboard" className="block">
            <Button variant="primary" className="w-full" size="md">
              Sign In
            </Button>
          </Link>
        </form>

        <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-800">
          Powered by Directus Shared Auth & Multi-Tenancy
        </div>
      </div>
    </div>
  );
}
