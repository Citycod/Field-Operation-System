"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";

export default function CreateFormPage() {
  const router = useRouter();
  const { activeOrganization } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!activeOrganization || !title.trim()) return;
    setCreating(true);
    setError("");
    const response = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: activeOrganization.id,
        title,
        description,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Form creation failed.");
      setCreating(false);
      return;
    }
    router.push(`/forms/${body.form.id}/builder`);
  }
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href="/forms">Forms</Link> / Create form
      </nav>
      <div className="border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-xl font-bold">Create New Form</h1>
          <p className="mt-1 text-xs text-slate-500">
            Create a blank draft before opening the visual builder.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-5 p-6">
          <label className="block text-xs font-semibold">
            Form title *
            <input
              aria-label="Form title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-3"
            />
          </label>
          <label className="block text-xs font-semibold">
            Description
            <textarea
              aria-label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mt-1 block w-full rounded border border-slate-300 p-3"
            />
          </label>
          <div className="border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            A Draft V1 with a blank header and General Information tab will be
            created through the authorized form service.
          </div>
          {error && (
            <p
              role="alert"
              className="border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Link
              href="/forms"
              className="rounded border border-slate-300 px-4 py-2 text-xs font-semibold"
            >
              Cancel
            </Link>
            <button
              disabled={creating || !activeOrganization}
              className="rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create and Open Builder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
