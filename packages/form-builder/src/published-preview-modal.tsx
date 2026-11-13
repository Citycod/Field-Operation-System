import React, { useState, useEffect, useRef } from "react";
import { FormRenderer, type LookupProvider } from "@field/form-renderer";
import type { FormVersionSummary } from "./types";

export interface PublishedPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: FormVersionSummary | null;
  lookupProvider?: LookupProvider;
}

type DeviceViewport = "desktop" | "tablet" | "mobile";

export function PublishedPreviewModal({
  isOpen,
  onClose,
  version,
  lookupProvider,
}: PublishedPreviewModalProps) {
  const [viewport, setViewport] = useState<DeviceViewport>("desktop");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !version) return null;

  return (
    <div
      className="fb-preview-modal-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="fb-preview-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-preview-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="fb-preview-modal-header">
          <div className="fb-preview-title-group">
            <h2 id="fb-preview-modal-title" className="fb-preview-title">
              {version.schema_jsonb?.form?.title || "Form Preview"}
            </h2>
            <div className="fb-preview-badges">
              <span className="fb-badge-published">
                Published Snapshot v{version.version_number}
              </span>
              <span className="fb-badge-preview-mode">
                Preview Mode (Zero Persistence)
              </span>
            </div>
          </div>

          <div className="fb-preview-device-switcher" role="group" aria-label="Device viewport">
            <button
              type="button"
              className={`device-btn ${viewport === "desktop" ? "active" : ""}`}
              onClick={() => setViewport("desktop")}
              aria-pressed={viewport === "desktop"}
              title="Desktop View (100% / Max 1024px)"
            >
              Desktop
            </button>
            <button
              type="button"
              className={`device-btn ${viewport === "tablet" ? "active" : ""}`}
              onClick={() => setViewport("tablet")}
              aria-pressed={viewport === "tablet"}
              title="Tablet View (768px)"
            >
              Tablet (768px)
            </button>
            <button
              type="button"
              className={`device-btn ${viewport === "mobile" ? "active" : ""}`}
              onClick={() => setViewport("mobile")}
              aria-pressed={viewport === "mobile"}
              title="Mobile View (375px)"
            >
              Mobile (375px)
            </button>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="fb-preview-modal-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            ×
          </button>
        </header>

        <div className="fb-preview-simulation-banner" role="status">
          <strong>Preview Mode:</strong> You are testing the exact published snapshot of Version {version.version_number}. Validation rules, conditional calculations, and layout behavior are live. Field entries are evaluated locally and will not create submissions.
        </div>

        <div className="fb-preview-canvas-scroller">
          <div className={`fb-preview-viewport-frame fb-frame-${viewport}`}>
            <div className="fb-preview-renderer-container">
              <FormRenderer
                schema={version.schema_jsonb}
                mode="preview"
                lookupProvider={lookupProvider}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

