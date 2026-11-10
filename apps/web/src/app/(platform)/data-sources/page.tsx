"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type {
  DataSourceDetail,
  DataSourceFieldInput,
  DataSourceFieldType,
  DataSourceItemEntity,
  DataSourceItemStatus,
  DataSourceStatus,
  DataSourceSummary,
} from "@/lib/repositories/data-source-repository";

type LoadState = "loading" | "ready" | "error";

const DEFAULT_FIELDS: DataSourceFieldInput[] = [
  { key: "code", label: "Code", field_type: "text", required: true },
  { key: "name", label: "Name", field_type: "text", required: true },
];

export default function DataSourcesPage() {
  const { activeOrganization, currentRole, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;
  const canManage =
    currentRole === "super_admin" || currentRole === "business_admin";

  const [sources, setSources] = useState<DataSourceSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DataSourceDetail | null>(
    null,
  );
  const [detailState, setDetailState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [detailError, setDetailError] = useState("");

  // Create source modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFields, setNewFields] =
    useState<DataSourceFieldInput[]>(DEFAULT_FIELDS);
  const [newDisplayField, setNewDisplayField] = useState("name");
  const [newValueField, setNewValueField] = useState("code");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit source state
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDisplayField, setEditDisplayField] = useState("");
  const [editValueField, setEditValueField] = useState("");
  const [editStatus, setEditStatus] = useState<DataSourceStatus>("active");
  const [editFields, setEditFields] = useState<DataSourceFieldInput[]>([]);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState("");

  // Item creation / editing state
  const [itemQuery, setItemQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemFormValues, setItemFormValues] = useState<Record<string, string>>(
    {},
  );
  const [itemStatus, setItemStatus] = useState<DataSourceItemStatus>("active");
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);

  const loadSources = useCallback(
    async (selectIdAfter?: string) => {
      if (authLoading) return;
      if (!activeOrganizationId) {
        setSources([]);
        setError("Select an organization to view data sources.");
        setState("error");
        return;
      }
      setState("loading");
      setError("");
      try {
        const response = await fetch(
          `/api/data-sources?organizationId=${encodeURIComponent(activeOrganizationId)}`,
        );
        const body = (await response.json()) as {
          dataSources?: DataSourceSummary[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error || "Unable to load data sources.");
        }
        const list = body.dataSources ?? [];
        setSources(list);
        setState("ready");
        const nextSelection =
          selectIdAfter ??
          (selectedSourceId && list.some((s) => s.id === selectedSourceId)
            ? selectedSourceId
            : list[0]?.id ?? null);
        setSelectedSourceId(nextSelection);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load data sources.",
        );
        setState("error");
      }
    },
    [activeOrganizationId, authLoading, selectedSourceId],
  );

  const loadDetail = useCallback(
    async (sourceId: string) => {
      if (!activeOrganizationId) return;
      setDetailState("loading");
      setDetailError("");
      try {
        const response = await fetch(
          `/api/data-sources/${encodeURIComponent(sourceId)}?organizationId=${encodeURIComponent(activeOrganizationId)}`,
        );
        const body = (await response.json()) as {
          dataSource?: DataSourceDetail;
          error?: string;
        };
        if (!response.ok || !body.dataSource) {
          throw new Error(body.error || "Unable to load data source details.");
        }
        const ds = body.dataSource;
        setSelectedDetail(ds);
        setEditName(ds.name);
        setEditDescription(ds.description ?? "");
        setEditDisplayField(ds.display_field_key);
        setEditValueField(ds.value_field_key);
        setEditStatus(ds.status);
        setEditFields(
          ds.fields.map((f) => ({
            key: f.key,
            label: f.label,
            field_type: f.field_type,
            required: f.required,
            order_index: f.order_index,
          })),
        );
        setDetailState("ready");
      } catch (reason) {
        setDetailError(
          reason instanceof Error
            ? reason.message
            : "Unable to load data source details.",
        );
        setDetailState("error");
      }
    },
    [activeOrganizationId],
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (selectedSourceId && activeOrganizationId) {
      setEditingMeta(false);
      setShowItemForm(false);
      setEditingItemId(null);
      void loadDetail(selectedSourceId);
    } else {
      setSelectedDetail(null);
      setDetailState("idle");
    }
  }, [selectedSourceId, activeOrganizationId, loadDetail]);

  const visibleSources = useMemo(
    () =>
      sources.filter((source) =>
        `${source.name} ${source.key} ${source.description ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [sources, query],
  );

  const visibleItems = useMemo(() => {
    if (!selectedDetail) return [];
    if (!itemQuery.trim()) return selectedDetail.items;
    const q = itemQuery.toLowerCase();
    return selectedDetail.items.filter((item) =>
      JSON.stringify(item.data_jsonb).toLowerCase().includes(q),
    );
  }, [selectedDetail, itemQuery]);

  async function handleCreateDataSource(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganizationId) return;
    setCreating(true);
    setCreateError("");
    try {
      const response = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrganizationId,
          name: newName,
          key: newKey || undefined,
          description: newDescription || undefined,
          displayFieldKey: newDisplayField,
          valueFieldKey: newValueField,
          fields: newFields,
        }),
      });
      const body = (await response.json()) as {
        dataSource?: DataSourceDetail;
        error?: string;
      };
      if (!response.ok || !body.dataSource) {
        throw new Error(body.error || "Failed to create data source.");
      }
      setShowCreateModal(false);
      setNewName("");
      setNewKey("");
      setNewDescription("");
      setNewFields(DEFAULT_FIELDS);
      setNewDisplayField("name");
      setNewValueField("code");
      await loadSources(body.dataSource.id);
    } catch (reason) {
      setCreateError(
        reason instanceof Error
          ? reason.message
          : "Failed to create data source.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveMetadata(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganizationId || !selectedDetail) return;
    setMetaSaving(true);
    setMetaError("");
    try {
      const response = await fetch(
        `/api/data-sources/${encodeURIComponent(selectedDetail.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: activeOrganizationId,
            name: editName,
            description: editDescription || null,
            displayFieldKey: editDisplayField,
            valueFieldKey: editValueField,
            status: editStatus,
            fields: editFields,
          }),
        },
      );
      const body = (await response.json()) as {
        dataSource?: DataSourceDetail;
        error?: string;
      };
      if (!response.ok || !body.dataSource) {
        throw new Error(body.error || "Failed to update data source.");
      }
      setSelectedDetail(body.dataSource);
      setEditingMeta(false);
      await loadSources(body.dataSource.id);
    } catch (reason) {
      setMetaError(
        reason instanceof Error
          ? reason.message
          : "Failed to update data source.",
      );
    } finally {
      setMetaSaving(false);
    }
  }

  function openAddItemForm() {
    if (!selectedDetail) return;
    const defaults: Record<string, string> = {};
    for (const field of selectedDetail.fields) {
      defaults[field.key] = "";
    }
    setEditingItemId(null);
    setItemFormValues(defaults);
    setItemStatus("active");
    setItemError("");
    setShowItemForm(true);
  }

  function openEditItemForm(item: DataSourceItemEntity) {
    if (!selectedDetail) return;
    const values: Record<string, string> = {};
    for (const field of selectedDetail.fields) {
      const raw = item.data_jsonb[field.key];
      values[field.key] =
        raw === null || raw === undefined ? "" : String(raw);
    }
    setEditingItemId(item.id);
    setItemFormValues(values);
    setItemStatus(item.status);
    setItemError("");
    setShowItemForm(true);
  }

  async function handleSaveItem(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganizationId || !selectedDetail) return;
    setItemSaving(true);
    setItemError("");
    try {
      const url = editingItemId
        ? `/api/data-sources/${encodeURIComponent(selectedDetail.id)}/items/${encodeURIComponent(editingItemId)}`
        : `/api/data-sources/${encodeURIComponent(selectedDetail.id)}/items`;
      const method = editingItemId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrganizationId,
          data: itemFormValues,
          status: itemStatus,
        }),
      });
      const body = (await response.json()) as {
        item?: DataSourceItemEntity;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Failed to save item.");
      }
      setShowItemForm(false);
      setEditingItemId(null);
      await loadDetail(selectedDetail.id);
      await loadSources(selectedDetail.id);
    } catch (reason) {
      setItemError(
        reason instanceof Error ? reason.message : "Failed to save item.",
      );
    } finally {
      setItemSaving(false);
    }
  }

  async function handleToggleItemStatus(item: DataSourceItemEntity) {
    if (!activeOrganizationId || !selectedDetail) return;
    try {
      if (item.status === "active") {
        await fetch(
          `/api/data-sources/${encodeURIComponent(selectedDetail.id)}/items/${encodeURIComponent(item.id)}?organizationId=${encodeURIComponent(activeOrganizationId)}`,
          { method: "DELETE" },
        );
      } else {
        await fetch(
          `/api/data-sources/${encodeURIComponent(selectedDetail.id)}/items/${encodeURIComponent(item.id)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: activeOrganizationId,
              status: "active",
            }),
          },
        );
      }
      await loadDetail(selectedDetail.id);
      await loadSources(selectedDetail.id);
    } catch {
      await loadDetail(selectedDetail.id);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-700" />
            <h1 className="text-xl font-bold text-slate-900">Data Sources</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Lookup catalogs for{" "}
            {activeOrganization?.name ?? "the active organization"}.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setCreateError("");
              setShowCreateModal(true);
            }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800 sm:h-9 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Create Data Source
          </button>
        )}
      </header>

      {state === "loading" && (
        <div
          role="status"
          className="border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"
        >
          Loading data sources…
        </div>
      )}

      {state === "error" && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 p-5 text-sm text-red-800"
        >
          <strong>Data sources unavailable</strong>
          <p>{error}</p>
        </div>
      )}

      {state === "ready" && sources.length === 0 && (
        <div className="border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Database className="mx-auto h-9 w-9 text-emerald-700" />
          <h2 className="mt-3 font-semibold text-slate-900">
            No data sources yet
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Create a tenant data source to power lookup fields across forms.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
            >
              Create Data Source
            </button>
          )}
        </div>
      )}

      {state === "ready" && sources.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left Panel: Data Sources List */}
          <section
            aria-label="Data sources list"
            className="space-y-3 lg:col-span-4"
          >
            <label className="relative block w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <span className="sr-only">Search data sources</span>
              <input
                aria-label="Search data sources"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-xs"
                placeholder="Search data sources"
              />
            </label>

            <div className="divide-y divide-slate-200 border border-slate-200 bg-white">
              {visibleSources.map((source) => {
                const isSelected = source.id === selectedSourceId;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`flex w-full flex-col gap-1.5 p-3.5 text-left transition-colors ${
                      isSelected
                        ? "border-l-4 border-l-emerald-700 bg-emerald-50/50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {source.name}
                        </div>
                        <div className="truncate font-mono text-[11px] text-slate-500">
                          {source.key}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          source.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {source.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        Display: <strong>{source.display_field_key}</strong> ·
                        Value: <strong>{source.value_field_key}</strong>
                      </span>
                      <span>{source.active_item_count} active items</span>
                    </div>
                  </button>
                );
              })}
              {visibleSources.length === 0 && (
                <p className="p-6 text-center text-xs text-slate-500">
                  No data sources match your search.
                </p>
              )}
            </div>
          </section>

          {/* Right Panel: Selected Data Source Detail & Items */}
          <section
            aria-label="Data source details"
            className="space-y-4 lg:col-span-8"
          >
            {detailState === "loading" && (
              <div
                role="status"
                className="border border-slate-200 bg-white p-10 text-center text-xs text-slate-500"
              >
                Loading data source details…
              </div>
            )}

            {detailState === "error" && (
              <div
                role="alert"
                className="border border-red-200 bg-red-50 p-4 text-xs text-red-800"
              >
                {detailError}
              </div>
            )}

            {detailState === "ready" && selectedDetail && (
              <div className="space-y-4">
                {/* Metadata & Schema Card */}
                <div className="border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          {selectedDetail.name}
                        </h2>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${
                            selectedDetail.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {selectedDetail.status}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        Key: {selectedDetail.key}
                      </p>
                      {selectedDetail.description && (
                        <p className="mt-1 text-xs text-slate-600">
                          {selectedDetail.description}
                        </p>
                      )}
                    </div>
                    {canManage && !editingMeta && (
                      <button
                        type="button"
                        onClick={() => {
                          setMetaError("");
                          setEditingMeta(true);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Configure Source
                      </button>
                    )}
                  </div>

                  {!editingMeta ? (
                    <div className="mt-3 space-y-3">
                      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="text-slate-500">Display Field</dt>
                          <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                            {selectedDetail.display_field_key}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Value Field</dt>
                          <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                            {selectedDetail.value_field_key}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Fields</dt>
                          <dd className="mt-0.5 font-semibold text-slate-900">
                            {selectedDetail.fields.length}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Total Items</dt>
                          <dd className="mt-0.5 font-semibold text-slate-900">
                            {selectedDetail.items.length}
                          </dd>
                        </div>
                      </dl>

                      <div>
                        <h3 className="text-xs font-semibold text-slate-700">
                          Source Fields
                        </h3>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {selectedDetail.fields.map((field) => (
                            <span
                              key={field.id}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                            >
                              <strong className="text-slate-800">
                                {field.label}
                              </strong>
                              <code className="text-[11px] text-slate-500">
                                ({field.key}: {field.field_type})
                              </code>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSaveMetadata}
                      className="mt-4 space-y-3 text-xs"
                    >
                      {metaError && (
                        <div
                          role="alert"
                          className="rounded border border-red-200 bg-red-50 p-2.5 text-red-800"
                        >
                          {metaError}
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block space-y-1">
                          <span className="font-semibold text-slate-700">
                            Data source name
                          </span>
                          <input
                            required
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9 w-full rounded border border-slate-300 px-2.5"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="font-semibold text-slate-700">
                            Status
                          </span>
                          <select
                            value={editStatus}
                            onChange={(e) =>
                              setEditStatus(e.target.value as DataSourceStatus)
                            }
                            className="h-9 w-full rounded border border-slate-300 bg-white px-2.5"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                      </div>

                      <label className="block space-y-1">
                        <span className="font-semibold text-slate-700">
                          Description
                        </span>
                        <input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="h-9 w-full rounded border border-slate-300 px-2.5"
                        />
                      </label>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700">
                            Fields
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditFields([
                                ...editFields,
                                {
                                  key: `field_${editFields.length + 1}`,
                                  label: `Field ${editFields.length + 1}`,
                                  field_type: "text",
                                  required: false,
                                },
                              ])
                            }
                            className="font-semibold text-emerald-700 hover:underline"
                          >
                            + Add field
                          </button>
                        </div>
                        {editFields.map((f, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-1 gap-2 sm:grid-cols-4"
                          >
                            <input
                              placeholder="Field label"
                              value={f.label}
                              onChange={(e) => {
                                const next = [...editFields];
                                next[index] = { ...f, label: e.target.value };
                                setEditFields(next);
                              }}
                              className="h-8 rounded border border-slate-300 px-2"
                            />
                            <input
                              placeholder="field_key"
                              value={f.key}
                              onChange={(e) => {
                                const next = [...editFields];
                                next[index] = { ...f, key: e.target.value };
                                setEditFields(next);
                              }}
                              className="h-8 rounded border border-slate-300 px-2 font-mono"
                            />
                            <select
                              value={f.field_type ?? "text"}
                              onChange={(e) => {
                                const next = [...editFields];
                                next[index] = {
                                  ...f,
                                  field_type: e.target
                                    .value as DataSourceFieldType,
                                };
                                setEditFields(next);
                              }}
                              className="h-8 rounded border border-slate-300 bg-white px-2"
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="currency">Currency</option>
                              <option value="boolean">Boolean</option>
                              <option value="date">Date</option>
                            </select>
                            <button
                              type="button"
                              disabled={editFields.length <= 1}
                              onClick={() =>
                                setEditFields(
                                  editFields.filter((_, idx) => idx !== index),
                                )
                              }
                              className="h-8 rounded border border-slate-300 px-2 text-slate-600 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block space-y-1">
                          <span className="font-semibold text-slate-700">
                            Display field key
                          </span>
                          <select
                            value={editDisplayField}
                            onChange={(e) =>
                              setEditDisplayField(e.target.value)
                            }
                            className="h-9 w-full rounded border border-slate-300 bg-white px-2.5"
                          >
                            {editFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label} ({f.key})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="font-semibold text-slate-700">
                            Value field key
                          </span>
                          <select
                            value={editValueField}
                            onChange={(e) => setEditValueField(e.target.value)}
                            className="h-9 w-full rounded border border-slate-300 bg-white px-2.5"
                          >
                            {editFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label} ({f.key})
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingMeta(false)}
                          className="h-8 rounded border border-slate-300 px-3 font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={metaSaving}
                          className="h-8 rounded bg-emerald-700 px-3 font-semibold text-white disabled:opacity-60"
                        >
                          {metaSaving ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Items Section */}
                <div className="border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Lookup Items
                      </h3>
                      <p className="text-xs text-slate-500">
                        Active records returned when this data source is queried
                        by a Lookup field.
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={openAddItemForm}
                        className="inline-flex h-8 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Item
                      </button>
                    )}
                  </div>

                  {showItemForm && (
                    <form
                      onSubmit={handleSaveItem}
                      className="mt-3 space-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900">
                          {editingItemId
                            ? "Edit Lookup Item"
                            : "New Lookup Item"}
                        </strong>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={itemStatus === "active"}
                            onChange={(e) =>
                              setItemStatus(
                                e.target.checked ? "active" : "inactive",
                              )
                            }
                          />
                          <span>Active</span>
                        </label>
                      </div>
                      {itemError && (
                        <div
                          role="alert"
                          className="rounded border border-red-200 bg-red-50 p-2 text-red-800"
                        >
                          {itemError}
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {selectedDetail.fields.map((field) => (
                          <label key={field.id} className="block space-y-1">
                            <span className="font-semibold text-slate-700">
                              {field.label}{" "}
                              <code className="text-[11px] text-slate-500">
                                ({field.key})
                              </code>
                            </span>
                            <input
                              aria-label={`Item ${field.label}`}
                              value={itemFormValues[field.key] ?? ""}
                              onChange={(e) =>
                                setItemFormValues({
                                  ...itemFormValues,
                                  [field.key]: e.target.value,
                                })
                              }
                              className="h-8 w-full rounded border border-slate-300 bg-white px-2.5"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowItemForm(false);
                            setEditingItemId(null);
                          }}
                          className="h-8 rounded border border-slate-300 bg-white px-3 font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={itemSaving}
                          className="h-8 rounded bg-emerald-700 px-3 font-semibold text-white disabled:opacity-60"
                        >
                          {itemSaving ? "Saving…" : "Save Item"}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="mt-3">
                    <label className="relative block w-full max-w-xs">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <span className="sr-only">Filter items</span>
                      <input
                        aria-label="Filter items"
                        value={itemQuery}
                        onChange={(e) => setItemQuery(e.target.value)}
                        placeholder="Filter items…"
                        className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-3 text-xs"
                      />
                    </label>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          {selectedDetail.fields.map((field) => (
                            <th key={field.id} className="px-3 py-2">
                              {field.label}
                            </th>
                          ))}
                          <th className="px-3 py-2">Status</th>
                          {canManage && (
                            <th className="px-3 py-2 text-right">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {visibleItems.map((item) => (
                          <tr key={item.id}>
                            {selectedDetail.fields.map((field) => (
                              <td key={field.id} className="px-3 py-2.5">
                                {String(item.data_jsonb[field.key] ?? "—")}
                              </td>
                            ))}
                            <td className="px-3 py-2.5">
                              {item.status === "active" ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  <XCircle className="h-3 w-3" />
                                  Inactive
                                </span>
                              )}
                            </td>
                            {canManage && (
                              <td className="space-x-2 px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditItemForm(item)}
                                  className="font-semibold text-emerald-700 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleToggleItemStatus(item)
                                  }
                                  className="font-semibold text-slate-600 hover:underline"
                                >
                                  {item.status === "active"
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleItems.length === 0 && (
                      <p className="p-6 text-center text-xs text-slate-500">
                        No lookup items found for this data source.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Create Data Source Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Data Source"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Create Data Source
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={handleCreateDataSource}
              className="mt-4 space-y-3 text-xs"
            >
              {createError && (
                <div
                  role="alert"
                  className="rounded border border-red-200 bg-red-50 p-2.5 text-red-800"
                >
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">
                    Data source name
                  </span>
                  <input
                    required
                    aria-label="Data source name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Site Locations"
                    className="h-9 w-full rounded border border-slate-300 px-2.5"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">
                    Source key (optional)
                  </span>
                  <input
                    aria-label="Source key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="e.g. site_locations"
                    className="h-9 w-full rounded border border-slate-300 px-2.5 font-mono"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-semibold text-slate-700">
                  Description
                </span>
                <input
                  aria-label="Data source description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe what records this catalog stores"
                  className="h-9 w-full rounded border border-slate-300 px-2.5"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Fields</span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewFields([
                        ...newFields,
                        {
                          key: `field_${newFields.length + 1}`,
                          label: `Field ${newFields.length + 1}`,
                          field_type: "text",
                          required: false,
                        },
                      ])
                    }
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    + Add field
                  </button>
                </div>
                {newFields.map((f, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-4"
                  >
                    <input
                      aria-label={`Field ${index + 1} label`}
                      value={f.label}
                      onChange={(e) => {
                        const next = [...newFields];
                        next[index] = { ...f, label: e.target.value };
                        setNewFields(next);
                      }}
                      placeholder="Label"
                      className="h-8 rounded border border-slate-300 px-2"
                    />
                    <input
                      aria-label={`Field ${index + 1} key`}
                      value={f.key}
                      onChange={(e) => {
                        const next = [...newFields];
                        next[index] = { ...f, key: e.target.value };
                        setNewFields(next);
                      }}
                      placeholder="key"
                      className="h-8 rounded border border-slate-300 px-2 font-mono"
                    />
                    <select
                      aria-label={`Field ${index + 1} type`}
                      value={f.field_type ?? "text"}
                      onChange={(e) => {
                        const next = [...newFields];
                        next[index] = {
                          ...f,
                          field_type: e.target.value as DataSourceFieldType,
                        };
                        setNewFields(next);
                      }}
                      className="h-8 rounded border border-slate-300 bg-white px-2"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="currency">Currency</option>
                      <option value="boolean">Boolean</option>
                      <option value="date">Date</option>
                    </select>
                    <button
                      type="button"
                      disabled={newFields.length <= 1}
                      onClick={() =>
                        setNewFields(
                          newFields.filter((_, idx) => idx !== index),
                        )
                      }
                      className="h-8 rounded border border-slate-300 px-2 text-slate-600 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">
                    Display field key
                  </span>
                  <select
                    aria-label="Display field key"
                    value={newDisplayField}
                    onChange={(e) => setNewDisplayField(e.target.value)}
                    className="h-9 w-full rounded border border-slate-300 bg-white px-2.5"
                  >
                    {newFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} ({f.key})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">
                    Value field key
                  </span>
                  <select
                    aria-label="Value field key"
                    value={newValueField}
                    onChange={(e) => setNewValueField(e.target.value)}
                    className="h-9 w-full rounded border border-slate-300 bg-white px-2.5"
                  >
                    {newFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} ({f.key})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 rounded border border-slate-300 px-4 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex h-9 items-center gap-1.5 rounded bg-emerald-700 px-4 font-semibold text-white disabled:opacity-60"
                >
                  {creating && (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {creating ? "Creating…" : "Create Data Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
