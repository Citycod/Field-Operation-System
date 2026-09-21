'use client';

import React from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { Badge, Button } from '@field/ui';
import { FileSpreadsheet, Plus, CheckCircle, Clock, Database, Layers } from 'lucide-react';

export default function FormBuilderPlaceholderPage() {
  const { activeOrganization } = useAuth();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Form Builder Module
            </h1>
            <Badge variant="warning">Codex Phase 1 Shell</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Integrated Form Management Engine for tenant: <span className="font-semibold text-slate-700 dark:text-slate-300">{activeOrganization?.name}</span>
          </p>
        </div>

        <Button variant="primary" size="sm" disabled>
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Create Form (Phase 1)</span>
        </Button>
      </div>

      {/* Module Overview Box */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>Module Capabilities & Architecture Roadmap</span>
        </h2>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          This module is an integrated platform service that powers forms across <strong>Procurement</strong> (Purchase Requisitions), <strong>HSE</strong> (Inspection/Incident reports), <strong>Assets</strong> (Equipment inspections), and <strong>Jobs</strong> (Service reports).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold">
              <CheckCircle className="w-4 h-4" />
              <span>1. Form Library & Definitions</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Multi-step dynamic form schemas, section containers, and version control.
            </p>
          </div>

          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold">
              <CheckCircle className="w-4 h-4" />
              <span>2. Visual Drag/Drop Builder</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Interactive layout engine with standard field registry and preview modes.
            </p>
          </div>

          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold">
              <CheckCircle className="w-4 h-4" />
              <span>3. Dynamic Rules & Math</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Conditional logic engine and real-time mathematical expression calculations.
            </p>
          </div>

          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold">
              <CheckCircle className="w-4 h-4" />
              <span>4. Submission Engine</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Tenant-isolated submission storage with strict multi-tenancy rules.
            </p>
          </div>

          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold">
              <CheckCircle className="w-4 h-4" />
              <span>5. Multi-Stage Approvals</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Role-based approval workflows and audit trails.
            </p>
          </div>

          <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold">
              <Database className="w-4 h-4" />
              <span>6. S3-Compatible Media</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Directus file upload integration for photos, signatures, and attachments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
