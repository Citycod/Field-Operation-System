import React, { useState } from "react";
import type {
  FormSchemaV1,
  FormSettings,
  FormPermissionDefinition,
} from "@field/form-engine";
import {
  validateFormSettings,
  validateFormPermissions,
  VALID_PLATFORM_ROLES,
  type ValidPlatformRole,
} from "@field/form-engine";

export interface FormSettingsEditorProps {
  schema: FormSchemaV1;
  onChange: (nextSchema: FormSchemaV1) => void;
  disabled?: boolean;
}

type SettingsSectionTab = "settings" | "permissions";

const ROLE_DEFINITIONS: Record<
  ValidPlatformRole,
  { label: string; description: string }
> = {
  super_admin: {
    label: "Super Admin",
    description: "Platform administrator with global management capabilities.",
  },
  business_admin: {
    label: "Business Admin",
    description: "Organization administrator who configures and publishes forms.",
  },
  manager: {
    label: "Manager",
    description: "Operational approver who reviews submissions.",
  },
  employee: {
    label: "Employee",
    description: "Standard organization member who submits forms.",
  },
};

const CAPABILITIES: Array<{
  key: keyof FormPermissionDefinition;
  label: string;
  description: string;
  defaultRoles: ValidPlatformRole[];
}> = [
  {
    key: "createRoles",
    label: "Create Submissions",
    description: "Fill and enter records for this form.",
    defaultRoles: ["super_admin", "business_admin", "manager", "employee"],
  },
  {
    key: "readOwnRoles",
    label: "View Own Submissions",
    description: "Inspect records created by the current user.",
    defaultRoles: ["super_admin", "business_admin", "manager", "employee"],
  },
  {
    key: "readAllRoles",
    label: "View All Submissions",
    description: "View all records for this form across the tenant.",
    defaultRoles: ["super_admin", "business_admin", "manager"],
  },
  {
    key: "manageFormRoles",
    label: "Manage Form & Settings",
    description: "Edit form fields, layout, and configuration.",
    defaultRoles: ["super_admin", "business_admin"],
  },
];

export function FormSettingsEditor({
  schema,
  onChange,
  disabled = false,
}: FormSettingsEditorProps) {
  const [activeTab, setActiveTab] = useState<SettingsSectionTab>("settings");

  const settings: FormSettings = schema.settings || {};
  const permissions: FormPermissionDefinition = schema.permissions || {};

  const isRefNumberEnabled = Boolean(
    settings.referenceNumber && settings.referenceNumber.enabled !== false,
  );

  const rawNotif = (settings.notifications as Record<string, unknown>) || {};
  const emailOnSubmit =
    typeof rawNotif.emailOnSubmit === "boolean"
      ? rawNotif.emailOnSubmit
      : typeof rawNotif.onSubmit === "boolean"
        ? rawNotif.onSubmit
        : false;
  const emailOnApprove =
    typeof rawNotif.emailOnApprove === "boolean"
      ? rawNotif.emailOnApprove
      : typeof rawNotif.onApproval === "boolean"
        ? rawNotif.onApproval
        : false;
  const emailOnReject =
    typeof rawNotif.emailOnReject === "boolean"
      ? rawNotif.emailOnReject
      : typeof rawNotif.onRejection === "boolean"
        ? rawNotif.onRejection
        : false;

  const createRolesAssigned =
    permissions.createRoles ??
    CAPABILITIES.find((c) => c.key === "createRoles")?.defaultRoles ??
    [];
  const isCreateRolesEmpty =
    Array.isArray(createRolesAssigned) && createRolesAssigned.length === 0;

  const settingsErrors = validateFormSettings(settings);
  const permissionsErrors = validateFormPermissions(permissions);

  const updateSettings = (patch: Partial<FormSettings>) => {
    const nextSettings: FormSettings = {
      ...settings,
      ...patch,
    };
    onChange({
      ...schema,
      settings: nextSettings,
    });
  };

  const updateReferenceNumber = (
    patch: Partial<NonNullable<FormSettings["referenceNumber"]>>,
  ) => {
    const currentRef = settings.referenceNumber || {};
    updateSettings({
      referenceNumber: {
        ...currentRef,
        ...patch,
      },
    });
  };

  const updatePublicAccess = (
    patch: Partial<NonNullable<FormSettings["publicAccess"]>>,
  ) => {
    const currentPublic = settings.publicAccess || {};
    updateSettings({
      publicAccess: {
        ...currentPublic,
        ...patch,
      },
    });
  };

  const updateNotifications = (
    patch: Partial<NonNullable<FormSettings["notifications"]>>,
  ) => {
    const currentNotif = (settings.notifications as Record<string, unknown>) || {};
    const nextNotif: Record<string, unknown> = {
      ...currentNotif,
      ...patch,
    };
    if ("emailOnSubmit" in patch && currentNotif.onSubmit !== undefined) {
      nextNotif.onSubmit = patch.emailOnSubmit;
    }
    if ("emailOnApprove" in patch && currentNotif.onApproval !== undefined) {
      nextNotif.onApproval = patch.emailOnApprove;
    }
    if ("emailOnReject" in patch && currentNotif.onRejection !== undefined) {
      nextNotif.onRejection = patch.emailOnReject;
    }
    updateSettings({
      notifications: nextNotif as FormSettings["notifications"],
    });
  };

  const togglePermissionRole = (
    capabilityKey: keyof FormPermissionDefinition,
    role: ValidPlatformRole,
  ) => {
    const currentRoles: string[] =
      permissions[capabilityKey] ??
      CAPABILITIES.find((c) => c.key === capabilityKey)?.defaultRoles ??
      [];

    const hasRole = currentRoles.includes(role);
    const nextRoles = hasRole
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];

    const nextPermissions: FormPermissionDefinition = {
      ...permissions,
      [capabilityKey]: nextRoles,
    };

    onChange({
      ...schema,
      permissions: nextPermissions,
    });
  };

  // Reference number preview computation
  const refPrefix = settings.referenceNumber?.prefix ?? "";
  const refSuffix = settings.referenceNumber?.suffix ?? "";
  const refSeqLen = settings.referenceNumber?.sequenceLength ?? 5;
  const sampleNumber = "1".padStart(Math.max(1, Math.min(refSeqLen, 12)), "0");
  const sampleReferenceFormatted = `${refPrefix}${sampleNumber}${refSuffix}`;

  return (
    <div className="fb-settings-view" role="region" aria-label="Form Settings">
      <div className="fb-settings-header">
        <div>
          <h2>Form Settings & Permissions</h2>
          <p>
            Configure form behavior, submission rules, reference numbering, notifications, and role-based access.
          </p>
        </div>
        <div className="fb-settings-subnav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "settings"}
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            Form Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "permissions"}
            className={activeTab === "permissions" ? "active" : ""}
            onClick={() => setActiveTab("permissions")}
          >
            Role Permissions
          </button>
        </div>
      </div>

      {activeTab === "settings" && (
        <div className="fb-settings-body">
          {settingsErrors.length > 0 && (
            <div className="fb-validation" role="alert">
              <strong>Settings validation errors:</strong>
              <ul>
                {settingsErrors.map((err, i) => (
                  <li key={`${err.path}-${i}`}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: General Configuration */}
          <div className="fb-settings-card">
            <div className="fb-settings-card-header">
              <h3>General Configuration</h3>
              <p>Basic form metadata and runtime submission behavior.</p>
            </div>
            <div className="fb-settings-grid">
              <div className="fb-field-group">
                <label htmlFor="fb-form-title" className="fb-label">
                  Form Title
                </label>
                <input
                  id="fb-form-title"
                  type="text"
                  value={schema.form.title}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...schema,
                      form: { ...schema.form, title: e.target.value },
                    })
                  }
                  className="fb-input"
                />
              </div>

              <div className="fb-field-group">
                <label htmlFor="fb-form-key" className="fb-label">
                  Form Semantic Key
                </label>
                <input
                  id="fb-form-key"
                  type="text"
                  value={schema.form.key}
                  disabled
                  readOnly
                  className="fb-input fb-input-readonly"
                  title="Form key is immutable once created."
                />
              </div>

              <div className="fb-field-group full-width">
                <label htmlFor="fb-form-description" className="fb-label">
                  Description
                </label>
                <textarea
                  id="fb-form-description"
                  rows={2}
                  value={schema.form.description || ""}
                  disabled={disabled}
                  placeholder="Optional guidance or description for this form..."
                  onChange={(e) =>
                    onChange({
                      ...schema,
                      form: {
                        ...schema.form,
                        description: e.target.value || undefined,
                      },
                    })
                  }
                  className="fb-textarea"
                />
              </div>
            </div>
          </div>

          {/* Section: Draft Handling */}
          <div className="fb-settings-card">
            <div className="fb-settings-card-header">
              <h3>Draft Handling</h3>
              <p>Control whether users can save progress and resume later.</p>
            </div>
            <div className="fb-settings-checkbox-row">
              <label className="fb-checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.allowDrafts !== false}
                  disabled={disabled}
                  onChange={(e) =>
                    updateSettings({ allowDrafts: e.target.checked })
                  }
                />
                <div>
                  <strong>Allow in-progress drafts</strong>
                  <p>
                    When enabled, users can save partial entries before final submission.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section: Reference Number */}
          <div className="fb-settings-card">
            <div className="fb-settings-card-header">
              <h3>Reference Number Format</h3>
              <p>Configure automated record numbering prefixes and sequence lengths.</p>
            </div>
            <div className="fb-settings-checkbox-row">
              <label className="fb-checkbox-label">
                <input
                  type="checkbox"
                  checked={isRefNumberEnabled}
                  disabled={disabled}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateReferenceNumber({
                        enabled: true,
                        prefix: settings.referenceNumber?.prefix ?? "REF-",
                        sequenceLength: settings.referenceNumber?.sequenceLength ?? 5,
                      });
                    } else {
                      updateReferenceNumber({
                        enabled: false,
                      });
                    }
                  }}
                />
                <div>
                  <strong>Enable custom reference numbering</strong>
                  <p>Generate formatted identifiers for each created submission.</p>
                </div>
              </label>
            </div>

            {isRefNumberEnabled && (
              <div className="fb-settings-subgroup">
                <div className="fb-settings-grid">
                  <label className="fb-field-group">
                    <span className="fb-label">Prefix</span>
                    <input
                      type="text"
                      placeholder="e.g. REQ-"
                      maxLength={20}
                      disabled={disabled}
                      value={settings.referenceNumber?.prefix || ""}
                      onChange={(e) =>
                        updateReferenceNumber({ prefix: e.target.value })
                      }
                      className="fb-input"
                    />
                  </label>

                  <label className="fb-field-group">
                    <span className="fb-label">Suffix</span>
                    <input
                      type="text"
                      placeholder="e.g. /2026"
                      maxLength={20}
                      disabled={disabled}
                      value={settings.referenceNumber?.suffix || ""}
                      onChange={(e) =>
                        updateReferenceNumber({ suffix: e.target.value })
                      }
                      className="fb-input"
                    />
                  </label>

                  <label className="fb-field-group">
                    <span className="fb-label">Sequence Digits (3–12)</span>
                    <input
                      type="number"
                      min={3}
                      max={12}
                      disabled={disabled}
                      value={settings.referenceNumber?.sequenceLength ?? 5}
                      onChange={(e) =>
                        updateReferenceNumber({
                          sequenceLength: parseInt(e.target.value, 10) || 5,
                        })
                      }
                      className="fb-input"
                    />
                  </label>
                </div>

                <div className="fb-reference-preview">
                  <span className="fb-preview-label">Sample Reference Output:</span>
                  <code className="fb-preview-code">{sampleReferenceFormatted}</code>
                </div>
              </div>
            )}
          </div>

          {/* Section: Notifications */}
          <div className="fb-settings-card">
            <div className="fb-settings-card-header">
              <h3>Notification Triggers</h3>
              <p>Configure automated email notifications for lifecycle events.</p>
            </div>
            <div className="fb-notifications-list">
              <label className="fb-checkbox-label">
                <input
                  type="checkbox"
                  checked={emailOnSubmit}
                  disabled={disabled}
                  onChange={(e) =>
                    updateNotifications({ emailOnSubmit: e.target.checked })
                  }
                />
                <div>
                  <strong>Email on Submission</strong>
                  <p>Send an email confirmation when a user submits a completed record.</p>
                </div>
              </label>

              <label className="fb-checkbox-label">
                <input
                  type="checkbox"
                  checked={emailOnApprove}
                  disabled={disabled}
                  onChange={(e) =>
                    updateNotifications({ emailOnApprove: e.target.checked })
                  }
                />
                <div>
                  <strong>Email on Approval</strong>
                  <p>Notify requester and stakeholders when a submission receives approval.</p>
                </div>
              </label>

              <label className="fb-checkbox-label">
                <input
                  type="checkbox"
                  checked={emailOnReject}
                  disabled={disabled}
                  onChange={(e) =>
                    updateNotifications({ emailOnReject: e.target.checked })
                  }
                />
                <div>
                  <strong>Email on Rejection / Return</strong>
                  <p>Notify requester if a submission is returned or rejected with comments.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Section: Public Link & Sharing */}
          <div className="fb-settings-card">
            <div className="fb-settings-card-header">
              <h3>Public Link & Sharing</h3>
              <p>Configure public access and anonymous submission settings for this form.</p>
            </div>
            <div className="fb-settings-checkbox-row">
              <label className="fb-checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(settings.publicAccess?.enabled)}
                  disabled={disabled}
                  onChange={(e) =>
                    updatePublicAccess({ enabled: e.target.checked })
                  }
                />
                <div>
                  <strong>Enable Public Form Sharing</strong>
                  <p>
                    Allow respondents outside the organization to access and submit this form via a public link.
                  </p>
                </div>
              </label>
            </div>

            {Boolean(settings.publicAccess?.enabled) && (
              <div className="fb-settings-subgroup">
                <div className="fb-settings-grid">
                  <label className="fb-field-group">
                    <span className="fb-label">Custom URL Slug (Optional)</span>
                    <input
                      type="text"
                      placeholder="e.g. visitor-registration"
                      maxLength={60}
                      disabled={disabled}
                      value={settings.publicAccess?.customSlug || ""}
                      onChange={(e) =>
                        updatePublicAccess({
                          customSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""),
                        })
                      }
                      className="fb-input"
                    />
                    <span className="fb-text-muted fb-text-xs">
                      Alphanumeric with hyphens/underscores (3–60 chars). Defaults to semantic form key.
                    </span>
                  </label>

                  <div className="fb-field-group">
                    <label className="fb-checkbox-label mt-2">
                      <input
                        type="checkbox"
                        checked={settings.publicAccess?.allowAnonymousSubmissions !== false}
                        disabled={disabled}
                        onChange={(e) =>
                          updatePublicAccess({ allowAnonymousSubmissions: e.target.checked })
                        }
                      />
                      <div>
                        <strong>Allow Anonymous Submissions</strong>
                        <p>Permit submissions without requiring user identification or account login.</p>
                      </div>
                    </label>
                  </div>

                  <label className="fb-field-group full-width">
                    <span className="fb-label">Confirmation Title</span>
                    <input
                      type="text"
                      placeholder="e.g. Submission Received"
                      maxLength={100}
                      disabled={disabled}
                      value={settings.publicAccess?.successTitle || ""}
                      onChange={(e) =>
                        updatePublicAccess({ successTitle: e.target.value })
                      }
                      className="fb-input"
                    />
                  </label>

                  <label className="fb-field-group full-width">
                    <span className="fb-label">Confirmation Message</span>
                    <textarea
                      rows={2}
                      placeholder="e.g. Thank you! Your submission has been securely recorded."
                      maxLength={500}
                      disabled={disabled}
                      value={settings.publicAccess?.successMessage || ""}
                      onChange={(e) =>
                        updatePublicAccess({ successMessage: e.target.value })
                      }
                      className="fb-textarea"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <div className="fb-permissions-body">
          {permissionsErrors.length > 0 && (
            <div className="fb-validation" role="alert">
              <strong>Permission configuration issues:</strong>
              <ul>
                {permissionsErrors.map((err, i) => (
                  <li key={`${err.path}-${i}`}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="fb-permissions-intro">
            <div className="fb-policy-callout">
              <strong>Organization Role Model</strong>
              <p>
                Form access is determined by matching the user&apos;s active organization role against these configured capabilities.
                Business Admin and Super Admin maintain management capabilities to prevent administrative lockout.
              </p>
            </div>
          </div>

          {isCreateRolesEmpty && (
            <div
              className="fb-policy-callout fb-policy-warning"
              role="alert"
              data-testid="empty-create-roles-warning"
            >
              <strong>No Roles Permitted to Submit</strong>
              <p>
                The <em>Create Submissions</em> capability currently has no assigned roles. No users will be able to submit entries for this form until at least one permitted role is selected.
              </p>
            </div>
          )}

          <div className="fb-permissions-matrix-wrapper">
            <table className="fb-permissions-table" aria-label="Role Permissions Matrix">
              <thead>
                <tr>
                  <th scope="col" className="fb-col-capability">Capability</th>
                  {VALID_PLATFORM_ROLES.map((role) => (
                    <th key={role} scope="col" className="fb-col-role">
                      <div className="fb-role-header">
                        <span>{ROLE_DEFINITIONS[role].label}</span>
                        <small>{role}</small>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((cap) => {
                  const assignedRoles: string[] =
                    permissions[cap.key] ?? cap.defaultRoles;

                  return (
                    <tr key={cap.key}>
                      <td className="fb-capability-cell">
                        <strong>{cap.label}</strong>
                        <p>{cap.description}</p>
                      </td>
                      {VALID_PLATFORM_ROLES.map((role) => {
                        const isChecked = assignedRoles.includes(role);
                        const isMandatoryAdmin =
                          cap.key === "manageFormRoles" &&
                          (role === "business_admin" || role === "super_admin") &&
                          assignedRoles.filter(
                            (r) => r === "business_admin" || r === "super_admin",
                          ).length <= 1 &&
                          isChecked;

                        return (
                          <td key={role} className="fb-checkbox-cell">
                            <label className="fb-matrix-checkbox">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={disabled || isMandatoryAdmin}
                                aria-label={`${cap.label} for ${ROLE_DEFINITIONS[role].label}`}
                                onChange={() =>
                                  togglePermissionRole(cap.key, role)
                                }
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="fb-permissions-notes">
            <div className="fb-note-item">
              <span className="fb-badge fb-badge-info">Publishing Policy</span>
              <span>
                Publishing form versions is strictly restricted to <code>business_admin</code> and <code>super_admin</code> via PostgreSQL row-level security and atomic RPC.
              </span>
            </div>
            <div className="fb-note-item">
              <span className="fb-badge fb-badge-lock">Lockout Guard</span>
              <span>
                At least one administrative role must retain <code>manageFormRoles</code> so the form remains configurable.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
