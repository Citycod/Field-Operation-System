import React, { useMemo, useState } from "react";
import type {
  FieldDefinition,
  FormSchemaV1,
  ListViewColumnDefinition,
  ListViewDefinition,
} from "@field/form-engine";

export interface ListViewPreviewProps {
  schema: FormSchemaV1;
  listView: ListViewDefinition;
  availableFields: FieldDefinition[];
}

export function ListViewPreview({
  schema,
  listView,
  availableFields,
}: ListViewPreviewProps) {
  const [emptyStatePreview, setEmptyStatePreview] = useState(false);

  // Filter visible columns and sort by order
  const visibleColumns: ListViewColumnDefinition[] = useMemo(() => {
    const cols = (listView.columns || []).filter((c) => c.visible !== false);
    return [...cols].sort((a, b) => a.order - b.order);
  }, [listView.columns]);

  // Field definitions map for format fallbacks
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    for (const f of availableFields) {
      map.set(f.key, f);
      map.set(f.id, f);
    }
    return map;
  }, [availableFields]);

  // Active sorting map
  const sortMap = useMemo(() => {
    const map = new Map<string, { direction: "asc" | "desc"; priority?: number }>();
    if (listView.defaultSort) {
      if (Array.isArray(listView.defaultSort)) {
        listView.defaultSort.forEach((s) => map.set(s.fieldRef, s));
      } else {
        map.set(listView.defaultSort.fieldRef, listView.defaultSort);
      }
    }
    return map;
  }, [listView.defaultSort]);

  // Generate 4 mock records based on fields and system attributes
  const mockRecords = useMemo(() => {
    const records = [
      {
        id: "rec_001",
        "system.id": "rec_001",
        "system.reference_number": "REF-2026-001",
        "system.status": "submitted",
        "system.created_at": "2026-11-10T09:30:00Z",
        "system.updated_at": "2026-11-10T10:00:00Z",
        "system.submitted_at": "2026-11-10T10:00:00Z",
        "system.created_by": "Alex Morgan",
      },
      {
        id: "rec_002",
        "system.id": "rec_002",
        "system.reference_number": "REF-2026-002",
        "system.status": "approved",
        "system.created_at": "2026-11-11T14:15:00Z",
        "system.updated_at": "2026-11-11T16:20:00Z",
        "system.submitted_at": "2026-11-11T15:00:00Z",
        "system.created_by": "Sarah Connor",
      },
      {
        id: "rec_003",
        "system.id": "rec_003",
        "system.reference_number": "REF-2026-003",
        "system.status": "pending_approval",
        "system.created_at": "2026-11-12T11:00:00Z",
        "system.updated_at": "2026-11-12T11:30:00Z",
        "system.submitted_at": "2026-11-12T11:30:00Z",
        "system.created_by": "David Miller",
      },
      {
        id: "rec_004",
        "system.id": "rec_004",
        "system.reference_number": "REF-2026-004",
        "system.status": "draft",
        "system.created_at": "2026-11-12T15:45:00Z",
        "system.updated_at": "2026-11-12T16:00:00Z",
        "system.submitted_at": null,
        "system.created_by": "Chris Evans",
      },
    ];

    // Populate dynamic form field values for each record
    return records.map((rec, idx) => {
      const data: Record<string, unknown> = { ...rec };
      for (const f of availableFields) {
        if (f.type === "currency") {
          data[f.key] = [1250, 450, 8900, 120][idx];
        } else if (f.type === "number") {
          data[f.key] = [12, 45, 3, 88][idx];
        } else if (f.type === "date") {
          data[f.key] = ["2026-11-14", "2026-11-18", "2026-11-20", "2026-11-25"][idx];
        } else if (f.type === "checkbox") {
          data[f.key] = [true, false, true, false][idx];
        } else if (f.type === "dropdown") {
          const opts = f.options || [];
          data[f.key] = opts[idx % (opts.length || 1)]?.label || `Option ${idx + 1}`;
        } else if (f.type === "lookup") {
          data[f.key] = [`Asset PUMP-01`, `HVAC Unit 04`, `Generator B-2`, `Valve 109`][idx];
        } else {
          // text, textarea, etc.
          data[f.key] = [`Sample ${f.label} A`, `Sample ${f.label} B`, `Sample ${f.label} C`, `Sample ${f.label} D`][idx];
        }
      }
      return data;
    });
  }, [availableFields]);

  // Format cell value
  function renderCellValue(col: ListViewColumnDefinition, record: Record<string, unknown>) {
    const rawValue = record[col.sourceRef];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return <span className="fb-muted-dash">—</span>;
    }

    const fieldDef = fieldMap.get(col.sourceRef);
    const format = col.format || (fieldDef?.type === "currency" ? "currency" : fieldDef?.type === "date" ? "date" : fieldDef?.type === "checkbox" ? "boolean" : "text");

    if (format === "currency") {
      const num = Number(rawValue);
      return !isNaN(num) ? `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(rawValue);
    }

    if (format === "date") {
      try {
        const d = new Date(String(rawValue));
        return isNaN(d.getTime()) ? String(rawValue) : d.toLocaleDateString();
      } catch {
        return String(rawValue);
      }
    }

    if (format === "boolean") {
      return rawValue ? (
        <span className="fb-badge-chip fb-chip-yes">Yes</span>
      ) : (
        <span className="fb-badge-chip fb-chip-no">No</span>
      );
    }

    if (format === "status" || col.sourceRef === "system.status") {
      const val = String(rawValue).toLowerCase();
      const badgeClass =
        val === "approved"
          ? "fb-status-approved"
          : val === "submitted"
            ? "fb-status-submitted"
            : val === "pending_approval"
              ? "fb-status-pending"
              : "fb-status-draft";
      return (
        <span className={`fb-status-badge ${badgeClass}`}>
          {String(rawValue).replace(/_/g, " ")}
        </span>
      );
    }

    return String(rawValue);
  }

  return (
    <div className="fb-list-preview-container" data-testid="list-view-preview">
      <div className="fb-list-preview-header">
        <div className="fb-list-preview-meta">
          <span className="fb-preview-pill">Synthetic Preview</span>
          <span className="fb-preview-info">
            {visibleColumns.length} visible column{visibleColumns.length === 1 ? "" : "s"} • Page size: {listView.pageSize || 25}
          </span>
        </div>
        <div className="fb-list-preview-controls">
          <button
            type="button"
            className={`fb-btn-toggle-preview ${emptyStatePreview ? "fb-active" : ""}`}
            onClick={() => setEmptyStatePreview(!emptyStatePreview)}
            aria-pressed={emptyStatePreview}
          >
            {emptyStatePreview ? "Show Records" : "Preview Empty State"}
          </button>
        </div>
      </div>

      {emptyStatePreview || visibleColumns.length === 0 ? (
        <div className="fb-list-empty-state">
          <div className="fb-list-empty-icon" aria-hidden="true">📋</div>
          <h3>No records to display</h3>
          <p>
            {visibleColumns.length === 0
              ? "All columns are currently hidden or no columns are configured for this list view."
              : "This preview simulates how operators see the list when no submissions exist yet."}
          </p>
        </div>
      ) : (
        <div className="fb-table-responsive-wrapper" tabIndex={0} role="region" aria-label="List View Preview Table">
          <table className="fb-list-preview-table">
            <thead>
              <tr>
                {visibleColumns.map((col) => {
                  const sort = sortMap.get(col.sourceRef);
                  const align = col.alignment || (col.format === "currency" ? "right" : col.format === "status" || col.format === "boolean" ? "center" : "left");
                  return (
                    <th
                      key={col.id}
                      style={{
                        width: col.width ? `${col.width}px` : undefined,
                        textAlign: align,
                      }}
                      className={sort ? "fb-th-sorted" : ""}
                    >
                      <div className={`fb-th-content fb-align-${align}`}>
                        <span>{col.label}</span>
                        {sort && (
                          <span className="fb-sort-indicator" aria-label={`Sorted ${sort.direction}`}>
                            {sort.direction === "asc" ? " ▲" : " ▼"}
                            {sort.priority !== undefined && sort.priority > 0 && (
                              <sub className="fb-sort-prio">{sort.priority + 1}</sub>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {mockRecords.map((rec) => (
                <tr key={String(rec.id)}>
                  {visibleColumns.map((col) => {
                    const align = col.alignment || (col.format === "currency" ? "right" : col.format === "status" || col.format === "boolean" ? "center" : "left");
                    return (
                      <td
                        key={col.id}
                        style={{ textAlign: align }}
                      >
                        {renderCellValue(col, rec)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fb-list-preview-footer">
        <span className="fb-footer-text">
          Showing 1 to {emptyStatePreview || visibleColumns.length === 0 ? 0 : mockRecords.length} of {emptyStatePreview || visibleColumns.length === 0 ? 0 : mockRecords.length} records
        </span>
        <div className="fb-pagination-dummy">
          <button type="button" disabled className="fb-btn-page">‹ Previous</button>
          <span className="fb-page-num">1</span>
          <button type="button" disabled className="fb-btn-page">Next ›</button>
        </div>
      </div>
    </div>
  );
}

