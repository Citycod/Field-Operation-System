"use client";

import { useState, useEffect, useCallback, use } from "react";
import { FormRenderer, type RendererValue } from "@field/form-renderer";
import type { FormSchemaV1 } from "@field/form-engine";
import "@field/form-renderer/styles.css";

interface PublicFormResponse {
  form: {
    id: string;
    key: string;
    title: string;
    description?: string;
    is_public: boolean;
  };
  publishedVersion: {
    id: string;
    version_number: number;
    schema_version: number;
    schema_jsonb: FormSchemaV1;
  };
}

interface SubmissionSuccessData {
  submissionId: string;
  referenceNumber: string | null;
  status: string;
  successTitle: string;
  successMessage: string;
}

export default function PublicFormPage({
  params,
}: {
  params: Promise<{ slugOrId: string }>;
}) {
  const { slugOrId } = use(params);
  const [formData, setFormData] = useState<PublicFormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedData, setSubmittedData] =
    useState<SubmissionSuccessData | null>(null);

  const fetchForm = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/public/forms/${encodeURIComponent(slugOrId)}`,
      );
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "This form is private, unpublished, or does not exist.",
          );
        }
        const data = await response.json();
        throw new Error(data.error || "Failed to load form.");
      }
      const data = (await response.json()) as PublicFormResponse;
      setFormData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load form.");
    } finally {
      setLoading(false);
    }
  }, [slugOrId]);

  useEffect(() => {
    void fetchForm();
  }, [fetchForm]);

  const handleSubmit = async (values: RendererValue) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(
        `/api/public/forms/${encodeURIComponent(slugOrId)}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: values.fields,
            details: values.details,
            notes: values.notes,
            documents: values.documents,
          }),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Submission failed. Please try again.");
      }

      setSubmittedData(result as SubmissionSuccessData);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmittedData(null);
    setSubmitError(null);
    void fetchForm();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center shadow-sm">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 border-r-transparent align-[-0.125em]" />
        <p className="mt-4 text-sm text-slate-500 font-medium">Loading form…</p>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center shadow-sm max-w-lg mx-auto">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-4">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-900">Form Unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          {error || "This form is not accessible."}
        </p>
        <p className="mt-4 text-xs text-slate-400">
          If you believe this is an error, please contact the organization administrator.
        </p>
      </div>
    );
  }

  if (submittedData) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 sm:p-12 text-center shadow-sm max-w-xl mx-auto">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-6">
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {submittedData.successTitle}
        </h1>
        <p className="mt-2 text-base text-slate-600">
          {submittedData.successMessage}
        </p>

        {submittedData.referenceNumber && (
          <div className="mt-6 rounded-md bg-slate-50 border border-slate-200 p-4 inline-block">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Reference Number
            </span>
            <span className="mt-1 block font-mono text-lg font-bold text-emerald-800">
              {submittedData.referenceNumber}
            </span>
          </div>
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 transition"
          >
            Submit Another Entry
          </button>
        </div>
      </div>
    );
  }

  const schema = formData.publishedVersion.schema_jsonb;

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">{formData.form.title}</h1>
        {formData.form.description && (
          <p className="mt-1 text-sm text-slate-600">{formData.form.description}</p>
        )}
      </header>

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <strong>Submission Error:</strong> {submitError}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 sm:p-8 shadow-sm">
        <fieldset disabled={submitting} className="border-0 p-0 m-0">
          <FormRenderer
            schema={schema}
            mode="edit"
            onSubmit={handleSubmit}
          />
        </fieldset>

        {submitting && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-700 font-semibold">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-emerald-700 border-r-transparent" />
            <span>Submitting record…</span>
          </div>
        )}
      </div>
    </div>
  );
}

