'use client';

import React from 'react';
import { EmptyState } from '@field/ui';
import { FileText } from 'lucide-react';

export default function SubmissionsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Form Submissions</h1>
      <EmptyState
        icon={<FileText className="w-8 h-8 text-slate-400" />}
        title="No submissions recorded yet"
        description="Form submissions will appear here once dynamic forms are published and completed by field operators."
      />
    </div>
  );
}
