'use client';

import React from 'react';
import { EmptyState } from '@field/ui';
import { CheckSquare } from 'lucide-react';

export default function ApprovalsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Approvals Workflow</h1>
      <EmptyState
        icon={<CheckSquare className="w-8 h-8 text-slate-400" />}
        title="No pending approvals"
        description="Assigned form submissions requiring managerial review or multi-stage sign-off will appear in this queue."
      />
    </div>
  );
}
