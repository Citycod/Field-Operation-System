import React, { useMemo, useState } from "react";
import type {
  ColumnAlignment,
  ColumnFormat,
  FieldDefinition,
  FormSchemaV1,
  ListFilterCondition,
  ListFilterGroup,
  ListFilterOperator,
  ListViewColumnDefinition,
  ListViewDefinition,
  ListViewSortDefinition,
} from "@field/form-engine";
import { ALLOWLISTED_FILTER_OPERATORS } from "@field/form-engine";
import { defaultId, moveItem } from "./state";
import { ListViewPreview } from "./list-view-preview";

export interface ListViewEditorProps {
  schema: FormSchemaV1;
  onChange: (nextSchema: FormSchemaV1) => void;
  disabled?: boolean;
}

type SubTab = "columns" | "sorting" | "filters" | "search";

export const SYSTEM_FIELDS: Array<{
  key: string;
  label: string;
  type: string;
  defaultFormat: ColumnFormat;
}> = [
  { key: "system.reference_number", label: "Reference Number", type: "text", defaultFormat: "text" },
  { key: "system.status", label: "Status", type: "status", defaultFormat: "status" },
  { key: "system.created_at", label: "Created Date", type: "date", defaultFormat: "date" },
  { key: "system.submitted_at", label: "Submitted Date", type: "date", defaultFormat: "date" },
  { key: "system.created_by", label: "Created By", type: "text", defaultFormat: "text" },
  { key: "system.id", label: "Record ID", type: "text", defaultFormat: "text" },
];

const OPERATOR_LABELS: Record<ListFilterOperator, string> = {
  equals: "Equals",
  not_equals: "Does not equal",
  contains: "Contains",
  not_contains: "Does not contain",
  starts_with: "Starts with",
  ends_with: "Ends with",
  greater_than: "Greater than",
  greater_than_or_equal: "Greater than or equal",
  less_than: "Less than",
  less_than_or_equal: "Less than or equal",
  between: "Between",
  before: "Before date",
  after: "After date",
  is_today: "Is today",
  in_past_days: "In the past N days",
  in: "Is any of (comma separated)",
  not_in: "Is none of (comma separated)",
  is_true: "Is True / Checked",
  is_false: "Is False / Unchecked",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};

export function ListViewEditor({ schema, onChange, disabled = false }: ListViewEditorProps) {
  const [activeTab, setActiveTab] = useState<SubTab>("columns");
  const [selectedColId, setSelectedColId] = useState<string | null>(null);
  const [showAddColumnMenu, setShowAddColumnMenu] = useState(false);

  // Discover all available form fields
  const availableFields: FieldDefinition[] = useMemo(() => {
    const list: FieldDefinition[] = [];
    if (schema.header?.sections) {
      for (const s of schema.header.sections) {
        if (s.fields) list.push(...s.fields);
      }
    }
    if (schema.tabs) {
      for (const t of schema.tabs) {
        if (t.type === "form" && t.sections) {
          for (const s of t.sections) {
            if (s.fields) list.push(...s.fields);
          }
        }
      }
    }
    return list;
  }, [schema]);

  // Combined source dictionary: form fields + system fields
  const allFieldOptions = useMemo(() => {
    const options: Array<{ key: string; label: string; group: string; type: string }> = [];
    for (const sys of SYSTEM_FIELDS) {
      options.push({ key: sys.key, label: sys.label, group: "System Fields", type: sys.type });
    }
    for (const f of availableFields) {
      options.push({ key: f.key, label: `${f.label} (${f.key})`, group: "Form Fields", type: f.type });
    }
    return options;
  }, [availableFields]);

  const fieldTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const sys of SYSTEM_FIELDS) map.set(sys.key, sys.type);
    for (const f of availableFields) map.set(f.key, f.type);
    return map;
  }, [availableFields]);

  // Normalise current list view configuration
  const listView: ListViewDefinition = useMemo(() => {
    const raw = schema.listView || { columns: [] };
    return {
      ...raw,
      columns: raw.columns || [],
      pageSize: raw.pageSize || 25,
    };
  }, [schema.listView]);

  function updateListView(next: ListViewDefinition) {
    onChange({
      ...schema,
      listView: next,
    });
  }

  // --- COLUMN MANAGEMENT ACTIONS ---
  function handleAddColumn(sourceRef: string) {
    const matchSys = SYSTEM_FIELDS.find((s) => s.key === sourceRef);
    const matchField = availableFields.find((f) => f.key === sourceRef);
    const label = matchField?.label || matchSys?.label || sourceRef;
    const format: ColumnFormat =
      matchSys?.defaultFormat ||
      (matchField?.type === "currency"
        ? "currency"
        : matchField?.type === "date"
          ? "date"
          : matchField?.type === "checkbox"
            ? "boolean"
            : matchField?.type === "number"
              ? "number"
              : "text");

    const newCol: ListViewColumnDefinition = {
      id: defaultId("col"),
      sourceRef,
      label,
      order: listView.columns.length,
      width: 150,
      visible: true,
      sortable: true,
      filterable: true,
      searchable: true,
      format,
      alignment: format === "currency" ? "right" : format === "boolean" || format === "status" ? "center" : "left",
    };

    updateListView({
      ...listView,
      columns: [...listView.columns, newCol],
    });
    setSelectedColId(newCol.id);
    setShowAddColumnMenu(false);
  }

  function handleRemoveColumn(id: string) {
    const filtered = listView.columns.filter((c) => c.id !== id);
    const reordered = filtered.map((c, idx) => ({ ...c, order: idx }));
    updateListView({ ...listView, columns: reordered });
    if (selectedColId === id) setSelectedColId(reordered[0]?.id || null);
  }

  function handleToggleColumnVisibility(id: string) {
    const updated = listView.columns.map((c) =>
      c.id === id ? { ...c, visible: c.visible === false ? true : false } : c,
    );
    updateListView({ ...listView, columns: updated });
  }

  function handleMoveColumn(id: string, delta: -1 | 1) {
    const moved = moveItem(listView.columns, id, delta);
    updateListView({ ...listView, columns: moved });
  }

  function handleUpdateColumn(id: string, patch: Partial<ListViewColumnDefinition>) {
    const updated = listView.columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    updateListView({ ...listView, columns: updated });
  }

  function handleAddAllFields() {
    const currentRefs = new Set(listView.columns.map((c) => c.sourceRef));
    const toAdd: ListViewColumnDefinition[] = [];

    // First ensure essential system fields
    for (const sys of SYSTEM_FIELDS.slice(0, 3)) {
      if (!currentRefs.has(sys.key)) {
        toAdd.push({
          id: defaultId("col"),
          sourceRef: sys.key,
          label: sys.label,
          order: listView.columns.length + toAdd.length,
          width: 150,
          visible: true,
          sortable: true,
          filterable: true,
          searchable: true,
          format: sys.defaultFormat,
          alignment: sys.defaultFormat === "status" ? "center" : "left",
        });
      }
    }

    // Add remaining form fields
    for (const f of availableFields) {
      if (!currentRefs.has(f.key)) {
        toAdd.push({
          id: defaultId("col"),
          sourceRef: f.key,
          label: f.label,
          order: listView.columns.length + toAdd.length,
          width: 150,
          visible: true,
          sortable: true,
          filterable: true,
          searchable: true,
          format: f.type === "currency" ? "currency" : f.type === "date" ? "date" : f.type === "checkbox" ? "boolean" : "text",
          alignment: f.type === "currency" ? "right" : f.type === "checkbox" ? "center" : "left",
        });
      }
    }

    updateListView({ ...listView, columns: [...listView.columns, ...toAdd] });
  }

  // Selected column helper
  const selectedColumn = useMemo(
    () => listView.columns.find((c) => c.id === selectedColId) || listView.columns[0] || null,
    [listView.columns, selectedColId],
  );

  // Available fields not yet added as columns
  const unaddedFields = useMemo(() => {
    const addedRefs = new Set(listView.columns.map((c) => c.sourceRef));
    return allFieldOptions.filter((f) => !addedRefs.has(f.key));
  }, [allFieldOptions, listView.columns]);

  // --- SORTING ACTIONS ---
  const sortRules: ListViewSortDefinition[] = useMemo(() => {
    if (!listView.defaultSort) return [];
    return Array.isArray(listView.defaultSort) ? listView.defaultSort : [listView.defaultSort];
  }, [listView.defaultSort]);

  function handleAddSortRule() {
    const firstAvailable = allFieldOptions.find((f) => !sortRules.some((s) => s.fieldRef === f.key));
    if (!firstAvailable) return;
    const nextRules: ListViewSortDefinition[] = [
      ...sortRules,
      { fieldRef: firstAvailable.key, direction: "asc", priority: sortRules.length },
    ];
    updateListView({ ...listView, defaultSort: nextRules });
  }

  function handleUpdateSortRule(idx: number, patch: Partial<ListViewSortDefinition>) {
    const nextRules = sortRules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateListView({ ...listView, defaultSort: nextRules });
  }

  function handleRemoveSortRule(idx: number) {
    const nextRules = sortRules.filter((_, i) => i !== idx).map((r, i) => ({ ...r, priority: i }));
    updateListView({ ...listView, defaultSort: nextRules });
  }

  // --- FILTER ACTIONS ---
  const filterGroups: ListFilterGroup[] = useMemo(() => {
    return listView.defaultFilters || [];
  }, [listView.defaultFilters]);

  function handleAddFilterGroup() {
    const newGroup: ListFilterGroup = {
      id: defaultId("grp"),
      combinator: "and",
      conditions: [
        {
          id: defaultId("cond"),
          sourceRef: allFieldOptions[0]?.key || "system.status",
          operator: "equals",
          value: "",
        },
      ],
    };
    updateListView({ ...listView, defaultFilters: [...filterGroups, newGroup] });
  }

  function handleAddCondition(groupIndex: number) {
    const updated = filterGroups.map((grp, gIdx) => {
      if (gIdx !== groupIndex) return grp;
      return {
        ...grp,
        conditions: [
          ...grp.conditions,
          {
            id: defaultId("cond"),
            sourceRef: allFieldOptions[0]?.key || "system.status",
            operator: "equals" as ListFilterOperator,
            value: "",
          },
        ],
      };
    });
    updateListView({ ...listView, defaultFilters: updated });
  }

  function handleUpdateCondition(
    groupIndex: number,
    condIndex: number,
    patch: Partial<ListFilterCondition>,
  ) {
    const updated = filterGroups.map((grp, gIdx) => {
      if (gIdx !== groupIndex) return grp;
      const conditions = grp.conditions.map((cond, cIdx) => (cIdx === condIndex ? { ...cond, ...patch } : cond));
      return { ...grp, conditions };
    });
    updateListView({ ...listView, defaultFilters: updated });
  }

  function handleRemoveCondition(groupIndex: number, condIndex: number) {
    const updated = filterGroups.map((grp, gIdx) => {
      if (gIdx !== groupIndex) return grp;
      return {
        ...grp,
        conditions: grp.conditions.filter((_, cIdx) => cIdx !== condIndex),
      };
    }).filter((grp) => grp.conditions.length > 0);
    updateListView({ ...listView, defaultFilters: updated });
  }

  // Filter operators by target field type
  function getOperatorsForField(sourceRef: string): ListFilterOperator[] {
    const type = fieldTypeMap.get(sourceRef);
    if (type === "number" || type === "currency") {
      return ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between", "is_empty", "is_not_empty"];
    }
    if (type === "date") {
      return ["equals", "before", "after", "is_today", "in_past_days", "between", "is_empty", "is_not_empty"];
    }
    if (type === "checkbox") {
      return ["is_true", "is_false"];
    }
    if (type === "status" || type === "dropdown") {
      return ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"];
    }
    return ["contains", "not_contains", "equals", "not_equals", "starts_with", "ends_with", "is_empty", "is_not_empty"];
  }

  return (
    <div className="fb-list-view-editor" data-testid="list-view-editor">
      <div className="fb-lv-commandbar">
        <div className="fb-lv-subnav" role="tablist" aria-label="List View Subsections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "columns"}
            className={`fb-subnav-btn ${activeTab === "columns" ? "fb-active" : ""}`}
            onClick={() => setActiveTab("columns")}
          >
            Columns ({listView.columns.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "sorting"}
            className={`fb-subnav-btn ${activeTab === "sorting" ? "fb-active" : ""}`}
            onClick={() => setActiveTab("sorting")}
          >
            Sorting ({sortRules.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "filters"}
            className={`fb-subnav-btn ${activeTab === "filters" ? "fb-active" : ""}`}
            onClick={() => setActiveTab("filters")}
          >
            Default Filters ({filterGroups.reduce((acc, g) => acc + g.conditions.length, 0)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "search"}
            className={`fb-subnav-btn ${activeTab === "search" ? "fb-active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            Search & Paging
          </button>
        </div>

        <div className="fb-lv-actions">
          {activeTab === "columns" && (
            <>
              <div className="fb-dropdown-wrapper">
                <button
                  type="button"
                  className="fb-btn-add-clause"
                  onClick={() => setShowAddColumnMenu(!showAddColumnMenu)}
                  disabled={disabled || unaddedFields.length === 0}
                >
                  + Add Column ▾
                </button>
                {showAddColumnMenu && (
                  <div className="fb-col-picker-menu" role="menu">
                    {unaddedFields.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className="fb-col-picker-item"
                        onClick={() => handleAddColumn(f.key)}
                      >
                        <span className="fb-picker-label">{f.label}</span>
                        <span className="fb-picker-tag">{f.group}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="fb-btn-secondary"
                onClick={handleAddAllFields}
                disabled={disabled || unaddedFields.length === 0}
              >
                Add All Fields
              </button>
            </>
          )}

          {activeTab === "sorting" && (
            <button
              type="button"
              className="fb-btn-add-clause"
              onClick={handleAddSortRule}
              disabled={disabled || sortRules.length >= allFieldOptions.length}
            >
              + Add Sort Rule
            </button>
          )}

          {activeTab === "filters" && (
            <button
              type="button"
              className="fb-btn-add-clause"
              onClick={filterGroups.length === 0 ? handleAddFilterGroup : () => handleAddCondition(0)}
              disabled={disabled}
            >
              + Add Filter Condition
            </button>
          )}
        </div>
      </div>

      <div className="fb-lv-layout">
        <div className="fb-lv-config-pane">
          {/* TAB 1: COLUMNS CONFIGURATION */}
          {activeTab === "columns" && (
            <div className="fb-lv-columns-grid">
              <div className="fb-col-list-panel">
                <h3 className="fb-panel-title">Visible & Ordered Columns</h3>
                <p className="fb-panel-desc">Drag or order columns. Uncheck to hide from view.</p>

                {listView.columns.length === 0 ? (
                  <div className="fb-empty-hint">
                    No columns configured. Click <strong>+ Add Column</strong> above to display fields.
                  </div>
                ) : (
                  <div className="fb-col-items-list" role="list" aria-label="Columns">
                    {listView.columns.map((col, idx) => (
                      <div
                        key={col.id}
                        role="listitem"
                        className={`fb-col-item-row ${selectedColumn?.id === col.id ? "fb-selected" : ""} ${col.visible === false ? "fb-hidden-col" : ""}`}
                        onClick={() => setSelectedColId(col.id)}
                      >
                        <div className="fb-col-item-left">
                          <button
                            type="button"
                            className="fb-col-vis-toggle"
                            aria-label={`Toggle visibility of ${col.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleColumnVisibility(col.id);
                            }}
                          >
                            {col.visible !== false ? "👁" : "👁‍🗨"}
                          </button>
                          <div className="fb-col-item-meta">
                            <span className="fb-col-name">{col.label}</span>
                            <span className="fb-col-key">{col.sourceRef}</span>
                          </div>
                        </div>

                        <div className="fb-col-item-actions">
                          <button
                            type="button"
                            className="fb-col-order-btn"
                            disabled={disabled || idx === 0}
                            aria-label="Move up"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveColumn(col.id, -1);
                            }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="fb-col-order-btn"
                            disabled={disabled || idx === listView.columns.length - 1}
                            aria-label="Move down"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveColumn(col.id, 1);
                            }}
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className="fb-clause-remove"
                            aria-label={`Remove ${col.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveColumn(col.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Column Property Inspector */}
              <div className="fb-col-props-panel">
                <h3 className="fb-panel-title">Column Properties</h3>
                {selectedColumn ? (
                  <div className="fb-props-form">
                    <label className="fb-prop-field">
                      <span>Header Label</span>
                      <input
                        type="text"
                        value={selectedColumn.label}
                        disabled={disabled}
                        onChange={(e) => handleUpdateColumn(selectedColumn.id, { label: e.target.value })}
                      />
                    </label>

                    <label className="fb-prop-field">
                      <span>Source Field (Key)</span>
                      <input type="text" readOnly disabled value={selectedColumn.sourceRef} />
                    </label>

                    <div className="fb-prop-row-2">
                      <label className="fb-prop-field">
                        <span>Width (px)</span>
                        <input
                          type="number"
                          min={40}
                          max={600}
                          value={selectedColumn.width || 150}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateColumn(selectedColumn.id, { width: Math.max(40, Number(e.target.value)) })
                          }
                        />
                      </label>

                      <label className="fb-prop-field">
                        <span>Alignment</span>
                        <select
                          value={selectedColumn.alignment || "left"}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateColumn(selectedColumn.id, {
                              alignment: e.target.value as ColumnAlignment,
                            })
                          }
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                    </div>

                    <label className="fb-prop-field">
                      <span>Format</span>
                      <select
                        value={selectedColumn.format || "text"}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateColumn(selectedColumn.id, {
                            format: e.target.value as ColumnFormat,
                          })
                        }
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="currency">Currency ($)</option>
                        <option value="date">Date</option>
                        <option value="status">Status Badge</option>
                        <option value="boolean">Boolean (Yes/No)</option>
                      </select>
                    </label>

                    <div className="fb-prop-checkboxes">
                      <label className="fb-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedColumn.sortable !== false}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateColumn(selectedColumn.id, { sortable: e.target.checked })
                          }
                        />
                        <span>Allow sorting by this column</span>
                      </label>
                      <label className="fb-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedColumn.filterable !== false}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateColumn(selectedColumn.id, { filterable: e.target.checked })
                          }
                        />
                        <span>Allow filtering on this column</span>
                      </label>
                      <label className="fb-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedColumn.searchable !== false}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateColumn(selectedColumn.id, { searchable: e.target.checked })
                          }
                        />
                        <span>Include in quick search</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="fb-empty-hint">Select a column on the left to edit its properties.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SORTING CONFIGURATION */}
          {activeTab === "sorting" && (
            <div className="fb-lv-sorting-panel">
              <h3 className="fb-panel-title">Default Sort Order</h3>
              <p className="fb-panel-desc">Configure the initial sorting rules when the list view loads.</p>

              {sortRules.length === 0 ? (
                <div className="fb-empty-hint">
                  No default sort applied. Records will appear in chronological creation order.
                </div>
              ) : (
                <div className="fb-sort-rules-list">
                  {sortRules.map((sort, idx) => (
                    <div key={idx} className="fb-sort-row">
                      <span className="fb-sort-prio-tag">
                        {idx === 0 ? "Primary Sort" : `Secondary (${idx + 1})`}
                      </span>
                      <select
                        value={sort.fieldRef}
                        disabled={disabled}
                        onChange={(e) => handleUpdateSortRule(idx, { fieldRef: e.target.value })}
                      >
                        {allFieldOptions.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={sort.direction}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateSortRule(idx, { direction: e.target.value as "asc" | "desc" })
                        }
                      >
                        <option value="asc">Ascending (A-Z, 0-9, Oldest)</option>
                        <option value="desc">Descending (Z-A, 9-0, Newest)</option>
                      </select>
                      <button
                        type="button"
                        className="fb-clause-remove"
                        aria-label={`Remove sort rule ${idx + 1}`}
                        onClick={() => handleRemoveSortRule(idx)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FILTERS CONFIGURATION */}
          {activeTab === "filters" && (
            <div className="fb-lv-filters-panel">
              <h3 className="fb-panel-title">Default Filter Criteria</h3>
              <p className="fb-panel-desc">
                Define default filter conditions applied to submissions in this list view.
              </p>

              {filterGroups.length === 0 ? (
                <div className="fb-empty-hint">
                  No default filters set. All records will be visible when the list loads.
                </div>
              ) : (
                <div className="fb-filter-groups-list">
                  {filterGroups.map((group, gIdx) => (
                    <div key={group.id} className="fb-filter-group-card">
                      <div className="fb-filter-group-header">
                        <label className="fb-group-combinator">
                          <span>Match</span>
                          <select
                            value={group.combinator}
                            disabled={disabled}
                            onChange={(e) => {
                              const updated = filterGroups.map((g, i) =>
                                i === gIdx ? { ...g, combinator: e.target.value as "and" | "or" } : g,
                              );
                              updateListView({ ...listView, defaultFilters: updated });
                            }}
                          >
                            <option value="and">ALL conditions (AND)</option>
                            <option value="or">ANY condition (OR)</option>
                          </select>
                        </label>
                      </div>

                      <div className="fb-conditions-list">
                        {group.conditions.map((cond, cIdx) => {
                          const ops = getOperatorsForField(cond.sourceRef);
                          const isNoVal = cond.operator === "is_empty" || cond.operator === "is_not_empty" || cond.operator === "is_today" || cond.operator === "is_true" || cond.operator === "is_false";

                          return (
                            <div key={cond.id} className="fb-clause-row">
                              <div className="fb-clause-cell">
                                <select
                                  value={cond.sourceRef}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const nextSource = e.target.value;
                                    const nextOps = getOperatorsForField(nextSource);
                                    handleUpdateCondition(gIdx, cIdx, {
                                      sourceRef: nextSource,
                                      operator: nextOps[0] || "equals",
                                      value: "",
                                    });
                                  }}
                                >
                                  {allFieldOptions.map((f) => (
                                    <option key={f.key} value={f.key}>
                                      {f.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="fb-clause-cell">
                                <select
                                  value={cond.operator}
                                  disabled={disabled}
                                  onChange={(e) =>
                                    handleUpdateCondition(gIdx, cIdx, {
                                      operator: e.target.value as ListFilterOperator,
                                    })
                                  }
                                >
                                  {ops.map((op) => (
                                    <option key={op} value={op}>
                                      {OPERATOR_LABELS[op] || op}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="fb-clause-cell">
                                {isNoVal ? (
                                  <span className="fb-clause-na">No value required</span>
                                ) : (
                                  <input
                                    type="text"
                                    value={cond.value !== undefined && cond.value !== null ? String(cond.value) : ""}
                                    placeholder="Filter value..."
                                    disabled={disabled}
                                    onChange={(e) =>
                                      handleUpdateCondition(gIdx, cIdx, { value: e.target.value })
                                    }
                                  />
                                )}
                              </div>

                              <button
                                type="button"
                                className="fb-clause-remove"
                                aria-label="Remove filter condition"
                                onClick={() => handleRemoveCondition(gIdx, cIdx)}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="fb-filter-group-footer">
                        <button
                          type="button"
                          className="fb-btn-add-clause"
                          onClick={() => handleAddCondition(gIdx)}
                          disabled={disabled}
                        >
                          + Add condition
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SEARCH & PAGING CONFIGURATION */}
          {activeTab === "search" && (
            <div className="fb-lv-search-panel">
              <h3 className="fb-panel-title">Quick Search & Paging</h3>
              <p className="fb-panel-desc">Configure search box participation and default page size.</p>

              <div className="fb-search-settings">
                <label className="fb-checkbox-label">
                  <input
                    type="checkbox"
                    checked={listView.search?.enabled !== false}
                    disabled={disabled}
                    onChange={(e) =>
                      updateListView({
                        ...listView,
                        search: {
                          ...listView.search,
                          enabled: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>Enable Quick Search bar in runtime list</span>
                </label>

                <label className="fb-prop-field">
                  <span>Search Box Placeholder</span>
                  <input
                    type="text"
                    value={listView.search?.placeholder || ""}
                    placeholder="e.g. Search records by keyword, ID..."
                    disabled={disabled || listView.search?.enabled === false}
                    onChange={(e) =>
                      updateListView({
                        ...listView,
                        search: {
                          ...listView.search,
                          placeholder: e.target.value,
                        },
                      })
                    }
                  />
                </label>

                <div className="fb-searchable-fields-section">
                  <span className="fb-sub-title">Searchable Fields</span>
                  <p className="fb-panel-desc">Select which columns the quick search compares against:</p>
                  <div className="fb-search-fields-grid">
                    {allFieldOptions.map((f) => {
                      const curSearchable = listView.search?.searchableFields || [];
                      const isChecked = curSearchable.includes(f.key);
                      return (
                        <label key={f.key} className="fb-checkbox-card">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={disabled || listView.search?.enabled === false}
                            onChange={(e) => {
                              const nextFields = e.target.checked
                                ? [...curSearchable, f.key]
                                : curSearchable.filter((k) => k !== f.key);
                              updateListView({
                                ...listView,
                                search: {
                                  ...listView.search,
                                  searchableFields: nextFields,
                                },
                              });
                            }}
                          />
                          <span>{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="fb-paging-section">
                  <label className="fb-prop-field">
                    <span>Default Page Size</span>
                    <select
                      value={listView.pageSize || 25}
                      disabled={disabled}
                      onChange={(e) =>
                        updateListView({ ...listView, pageSize: Number(e.target.value) })
                      }
                    >
                      <option value={10}>10 records / page</option>
                      <option value={25}>25 records / page</option>
                      <option value={50}>50 records / page</option>
                      <option value={100}>100 records / page</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT / PREVIEW SECTION */}
        <div className="fb-lv-preview-pane">
          <ListViewPreview
            schema={schema}
            listView={listView}
            availableFields={availableFields}
          />
        </div>
      </div>
    </div>
  );
}
