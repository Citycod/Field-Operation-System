"use client";

import React, { useState } from "react";
import type { FormSchemaV1 } from "@field/form-engine";
import type {
  ActionableDiagnostic,
  FormReadinessReport,
} from "./validation-diagnostics";
import type { BuilderModuleTab } from "./types";

export interface PublishReadinessPanelProps {
  schema: FormSchemaV1;
  report: FormReadinessReport;
  formId?: string;
  publishedVersionNumber?: number | null;
  publicUrlBase?: string;
  isPublicAccessEnabled?: boolean;
  saving?: boolean;
  publishing?: boolean;
  canPublish?: boolean;
  onSave: () => void;
  onOpenPreview: () => void;
  onOpenPublishDialog: () => void;
  onOpenShareDialog?: () => void;
  onFixIssue: (diagnostic: ActionableDiagnostic) => void;
  onNavigateModule: (module: BuilderModuleTab) => void;
}

export function PublishReadinessPanel({
  schema,
  report,
  formId,
  publishedVersionNumber,
  publicUrlBase,
  isPublicAccessEnabled,
  saving,
  publishing,
  canPublish = true,
  onSave,
  onOpenPreview,
  onOpenPublishDialog,
  onOpenShareDialog,
  onFixIssue,
  onNavigateModule,
}: PublishReadinessPanelProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const isPublished =
    typeof publishedVersionNumber === "number" && publishedVersionNumber > 0;
  const effectiveSlug =
    schema.settings?.publicAccess?.customSlug || schema.form.key || formId || "";
  const origin =
    publicUrlBase ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "");
  const shareUrl = effectiveSlug ? `${origin}/f/${effectiveSlug}` : "";

  const totalFields =
    schema.header.sections.reduce((sum, s) => sum + s.fields.length, 0) +
    schema.tabs.reduce((sum, tab) => {
      if (tab.type === "form") {
        return sum + tab.sections.reduce((tSum, s) => tSum + s.fields.length, 0);
      }
      if (tab.type === "details") {
        return sum + tab.configuration.columns.length;
      }
      return sum;
    }, 0);

  const workflowStepCount =
    schema.workflow && "steps" in schema.workflow && Array.isArray(schema.workflow.steps)
      ? schema.workflow.steps.length
      : schema.workflow && "stages" in schema.workflow && Array.isArray(schema.workflow.stages)
        ? schema.workflow.stages.length
        : 0;

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <section className="fb-publish-stage" aria-label="Publish and Share workspace">
      <div className="fb-publish-header">
        <div>
          <span className="fb-stage-eyebrow">Stage 3 of 3</span>
          <h2>Review, Publish &amp; Share</h2>
          <p>
            Verify your form layout, calculations, and approval flow before making it live for your team.
          </p>
        </div>
        <div className="fb-publish-cta-group">
          <button type="button" onClick={onOpenPreview}>
            ▷ Preview as End User
          </button>
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
          {canPublish && (
            <button
              type="button"
              className="fb-btn-publish"
              onClick={onOpenPublishDialog}
              disabled={publishing}
            >
              {publishing ? "Publishing…" : "Publish Form"}
            </button>
          )}
        </div>
      </div>

      {/* Overview cards */}
      <div className="fb-publish-metrics">
        <div className="fb-metric-card">
          <span className="fb-metric-label">Fields Configured</span>
          <strong>{totalFields}</strong>
          <small>
            {schema.header.sections.length} header section{schema.header.sections.length === 1 ? "" : "s"},{" "}
            {schema.tabs.length} tab{schema.tabs.length === 1 ? "" : "s"}
          </small>
        </div>
        <div className="fb-metric-card">
          <span className="fb-metric-label">Approval Workflow</span>
          <strong>{schema.workflow ? `${workflowStepCount} steps` : "Direct Submit"}</strong>
          <small>
            {schema.workflow
              ? "Submissions route through configured approvals"
              : "No multi-step approval required"}
          </small>
        </div>
        <div className="fb-metric-card">
          <span className="fb-metric-label">Rules &amp; Automation</span>
          <strong>{schema.rules.length}</strong>
          <small>
            {schema.rules.length === 0
              ? "All fields always visible"
              : `${schema.rules.length} visibility/requirement rule${schema.rules.length === 1 ? "" : "s"}`}
          </small>
        </div>
        <div className="fb-metric-card">
          <span className="fb-metric-label">Publish Status</span>
          <strong className={report.validForPublish ? "is-ready" : "is-blocked"}>
            {report.validForPublish ? "Ready to Publish" : `${report.errors.length} Blocker${report.errors.length === 1 ? "" : "s"}`}
          </strong>
          <small>
            {isPublished
              ? `Live on v${publishedVersionNumber}`
              : "Not yet published"}
          </small>
        </div>
      </div>

      <div className="fb-publish-grid">
        {/* Readiness Checklist & Diagnostics */}
        <div className="fb-publish-card">
          <div className="fb-publish-card-head">
            <h3>Form Readiness Check</h3>
            <span className={`fb-status-pill ${report.validForPublish ? "ok" : "error"}`}>
              {report.validForPublish
                ? "All checks passed"
                : `${report.errors.length} issue${report.errors.length === 1 ? "" : "s"} must be fixed`}
            </span>
          </div>

          <div className="fb-checklist">
            {report.sectionChecks.map((check) => (
              <div
                key={check.id}
                className={`fb-checklist-row ${check.passed ? "is-pass" : "is-warn"}`}
              >
                <span className="fb-check-badge" aria-hidden="true">
                  {check.passed ? "✓" : "!"}
                </span>
                <div className="fb-checklist-copy">
                  <strong>{check.label}</strong>
                  <span>{check.description}</span>
                </div>
                <button
                  type="button"
                  className="fb-btn-subtle"
                  onClick={() => onNavigateModule(check.module)}
                >
                  {check.passed ? "Review" : "Open"}
                </button>
              </div>
            ))}
          </div>

          {report.all.length > 0 && (
            <div className="fb-diagnostics-list" aria-label="Publish validation diagnostics">
              <h4>What Needs Attention</h4>
              {report.all.map((diag) => (
                <div
                  key={diag.id}
                  className={`fb-diagnostic-card ${diag.severity === "error" ? "is-error" : "is-warning"}`}
                >
                  <div className="fb-diagnostic-copy">
                    <strong>
                      {diag.severity === "error" ? "Action Required: " : "Suggestion: "}
                      {diag.title}
                    </strong>
                    <p>{diag.friendlyMessage}</p>
                  </div>
                  <button
                    type="button"
                    className="fb-btn-fix"
                    onClick={() => onFixIssue(diag)}
                  >
                    {diag.fixLabel}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Share & Distribution Card */}
        <div className="fb-publish-card">
          <div className="fb-publish-card-head">
            <h3>Share &amp; Access Link</h3>
            <span className={`fb-status-pill ${isPublished ? "ok" : "neutral"}`}>
              {isPublished ? `v${publishedVersionNumber} Published` : "Draft Only"}
            </span>
          </div>

          {isPublished ? (
            <div className="fb-share-box">
              <p className="fb-help">
                Your form is published on version <strong>v{publishedVersionNumber}</strong>.{" "}
                {isPublicAccessEnabled
                  ? "Public link sharing is currently active."
                  : "Signed-in organization members can open and submit this form."}
              </p>
              {shareUrl && (
                <div className="fb-share-link-row">
                  <input
                    aria-label="Published form link"
                    readOnly
                    value={shareUrl}
                  />
                  <button type="button" onClick={handleCopyShareUrl}>
                    {copiedLink ? "Copied ✓" : "Copy Link"}
                  </button>
                </div>
              )}
              {onOpenShareDialog && (
                <div className="fb-share-actions">
                  <button type="button" onClick={onOpenShareDialog}>
                    Configure Public Link &amp; Sharing
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="fb-empty-share">
              <p>
                Once you publish this form, a stable shareable link is generated so authorized staff
                (or external respondents if enabled) can start submitting entries.
              </p>
              {canPublish && (
                <button
                  type="button"
                  className="fb-btn-publish"
                  disabled={!report.validForPublish || publishing}
                  onClick={onOpenPublishDialog}
                >
                  {report.validForPublish
                    ? "Publish First Version"
                    : "Fix Issues Above Before Publishing"}
                </button>
              )}
            </div>
          )}

          <div className="fb-publish-tips">
            <h4>Before You Publish</h4>
            <ul>
              <li>Published versions stay locked so past submissions keep their exact layout.</li>
              <li>You can always edit the draft later and publish a newer version.</li>
              <li>Calculations and approval steps run automatically when users submit.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
