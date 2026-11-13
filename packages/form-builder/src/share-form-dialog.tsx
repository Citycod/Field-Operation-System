import React, { useState, useEffect, useRef } from "react";

export interface ShareFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  formId: string;
  formTitle: string;
  formKey: string;
  customSlug?: string;
  publishedVersionNumber?: number | null;
  isPublic: boolean;
  onTogglePublicAccess?: (enabled: boolean) => Promise<void> | void;
  publicUrlBase?: string;
}

export function ShareFormDialog({
  isOpen,
  onClose,
  formId,
  formTitle,
  formKey,
  customSlug,
  publishedVersionNumber,
  isPublic,
  onTogglePublicAccess,
  publicUrlBase,
}: ShareFormDialogProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setToggleError("");
      return;
    }
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isPublished = typeof publishedVersionNumber === "number" && publishedVersionNumber > 0;
  const effectiveSlug = customSlug || formKey || formId;
  const origin =
    publicUrlBase ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://platform.app");
  const publicUrl = `${origin}/f/${effectiveSlug}`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback for older browsers
      const input = document.getElementById("fb-share-url-input") as HTMLInputElement | null;
      if (input) {
        input.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      setSharing(true);
      try {
        await navigator.share({
          title: formTitle,
          text: `Please fill out this form: ${formTitle}`,
          url: publicUrl,
        });
      } catch (err: unknown) {
        // User cancelled or share failed; do nothing
        if (err instanceof Error && err.name !== "AbortError") {
          await handleCopy();
        }
      } finally {
        setSharing(false);
      }
    } else {
      // Fallback to copy link
      await handleCopy();
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!onTogglePublicAccess) return;
    setToggling(true);
    setToggleError("");
    try {
      await onTogglePublicAccess(checked);
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Failed to update public access.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className="fb-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="fb-dialog fb-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-share-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="fb-dialog-close"
          type="button"
          aria-label="Close share dialog"
          onClick={onClose}
        >
          ×
        </button>

        <div className="fb-share-header">
          <div className="fb-share-badge-row">
            <span
              className={`fb-status-pill ${
                isPublished
                  ? isPublic
                    ? "status-public"
                    : "status-private"
                  : "status-draft"
              }`}
            >
              {isPublished
                ? isPublic
                  ? "● Public Link Active"
                  : "○ Private (Auth Required)"
                : "Draft Only"}
            </span>
            {isPublished && (
              <span className="fb-version-tag">
                Version {publishedVersionNumber}
              </span>
            )}
          </div>
          <h2 id="fb-share-dialog-title">Share Form</h2>
          <p className="fb-share-subtitle">
            Share <strong>{formTitle}</strong> with external respondents, visitors, or team members.
          </p>
        </div>

        {!isPublished ? (
          <div className="fb-share-unready-notice" role="alert">
            <p className="fb-notice-heading">This form is not yet published</p>
            <p className="fb-notice-body">
              Public links are only available for published forms. Publish this form from the builder
              before sharing. Draft forms are never exposed publicly.
            </p>
          </div>
        ) : (
          <div className="fb-share-body">
            {/* Toggle Public Access */}
            <div className="fb-share-toggle-card">
              <label className="fb-share-toggle-label">
                <input
                  type="checkbox"
                  checked={isPublic}
                  disabled={toggling || !onTogglePublicAccess}
                  onChange={(e) => void handleToggle(e.target.checked)}
                />
                <span className="fb-share-toggle-slider" aria-hidden="true" />
                <div className="fb-share-toggle-text">
                  <strong>Allow public access via link</strong>
                  <p>
                    Anyone with the link can view and submit this form without signing into the platform.
                  </p>
                </div>
              </label>
            </div>

            {toggleError && (
              <div className="fb-share-error" role="alert">
                {toggleError}
              </div>
            )}

            {isPublic ? (
              <div className="fb-share-link-section">
                <label htmlFor="fb-share-url-input" className="fb-share-input-label">
                  Public Form URL
                </label>
                <div className="fb-share-input-group">
                  <input
                    id="fb-share-url-input"
                    type="text"
                    readOnly
                    value={publicUrl}
                    className="fb-share-url-field"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className={`fb-btn-copy ${copied ? "copied" : ""}`}
                    aria-live="polite"
                  >
                    {copied ? "✓ Copied" : "Copy Link"}
                  </button>
                </div>

                <div className="fb-share-actions-row">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fb-btn-open-link"
                  >
                    <span>Open in new tab</span>
                    <span aria-hidden="true"> ↗</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => void handleNativeShare()}
                    disabled={sharing}
                    className="fb-btn-native-share"
                    title="Share via WhatsApp, Email, or device applications"
                  >
                    <span>Share via WhatsApp / Email</span>
                  </button>
                </div>

                <div className="fb-share-meta-box">
                  <div className="fb-share-meta-item">
                    <span className="meta-label">Resolves to:</span>
                    <span className="meta-value">Current published version (v{publishedVersionNumber})</span>
                  </div>
                  <div className="fb-share-meta-item">
                    <span className="meta-label">Access restriction:</span>
                    <span className="meta-value">Public (No authentication required)</span>
                  </div>
                  <div className="fb-share-meta-item">
                    <span className="meta-label">Security guarantee:</span>
                    <span className="meta-value">Draft changes are never exposed to public respondents</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="fb-share-private-notice">
                <p>
                  Public link access is currently <strong>disabled</strong>.
                </p>
                <p className="fb-text-muted">
                  Enable the switch above to generate a shareable URL for external visitors and users.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="fb-dialog-actions">
          <button
            type="button"
            className="fb-btn-close-dialog"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

