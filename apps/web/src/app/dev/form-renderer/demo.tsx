"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@field/ui";
import {
  FormRenderer,
  toOutputPayload,
  type RendererValue,
  type RendererMode,
} from "@field/form-renderer";
import { demoLookup, rendererFixture, sampleValue } from "./fixture";
import { MINIMAL_VALID_SCHEMA } from "@field/form-engine";
import "./demo.css";

export function RendererDemo() {
  const [mode, setMode] = useState<RendererMode>("preview");
  const [viewport, setViewport] = useState("desktop");
  const [fixture, setFixture] = useState("complete");
  const [reset, setReset] = useState(0);
  const [initial, setInitial] = useState<RendererValue>();
  const [output, setOutput] = useState<unknown>();
  const schema =
    fixture === "complete"
      ? rendererFixture
      : fixture === "empty"
        ? MINIMAL_VALID_SCHEMA
        : { schemaVersion: 99 };
  const complete = (value: RendererValue) => setOutput(toOutputPayload(value));
  return (
    <div className="renderer-demo">
      <header className="demo-top">
        <Link href="/forms">▤ FieldOps</Link>
        <span>Form Renderer · Development workspace</span>
      </header>
      <main className="demo-main">
        <nav aria-label="Breadcrumb">
          <Link href="/forms">Forms</Link>
          <span> / </span>
          <span>Renderer preview</span>
        </nav>
        <div className="demo-heading">
          <div>
            <h1>Form preview</h1>
            <p>Test the configured layout, fields and local interactions.</p>
          </div>
          <span className="demo-local">Local demonstration</span>
        </div>
        <div className="demo-workspace">
          <section aria-label="Form canvas" className="demo-canvas">
            <div className="demo-device" data-device={viewport}>
              <FormRenderer
                key={`${reset}-${fixture}`}
                schema={schema}
                mode={mode}
                initialValue={initial}
                lookupProvider={demoLookup}
                onSubmit={complete}
                onPreview={complete}
                noteAuthor="Demo user"
              />
            </div>
          </section>
          <aside className="demo-settings">
            <h2>Preview settings</h2>
            <p>Choose how to view this form.</p>
            <fieldset>
              <legend>Viewport</legend>
              <div className="demo-devices">
                {["desktop", "tablet", "mobile"].map((v) => (
                  <button
                    type="button"
                    key={v}
                    aria-pressed={viewport === v}
                    onClick={() => setViewport(v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label htmlFor="demo-mode">Mode</label>
            <select
              id="demo-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as RendererMode)}
            >
              <option value="preview">Interactive preview</option>
              <option value="readOnly">Read only</option>
              <option value="edit">Local runtime</option>
            </select>
            <label htmlFor="demo-fixture">Schema fixture</label>
            <select
              id="demo-fixture"
              value={fixture}
              onChange={(e) => {
                setFixture(e.target.value);
                setInitial(undefined);
                setOutput(undefined);
              }}
            >
              <option value="complete">All field types & tabs</option>
              <option value="empty">Empty areas</option>
              <option value="invalid">Invalid schema</option>
            </select>
            <div className="demo-test">
              <h2>Test form</h2>
              <p>Try populated or empty local values.</p>
              <Button
                type="button"
                variant="outline"
                disabled={fixture !== "complete"}
                onClick={() => {
                  setInitial(sampleValue);
                  setReset((n) => n + 1);
                  setOutput(undefined);
                }}
              >
                Fill with sample data
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setInitial(undefined);
                  setReset((n) => n + 1);
                  setOutput(undefined);
                }}
              >
                Reset form
              </Button>
            </div>
            <div className="demo-info">
              This is a local preview. Form data and files are not saved or
              uploaded.
            </div>
            {output !== undefined && (
              <details className="demo-output" open>
                <summary>Validated local payload</summary>
                <pre>{JSON.stringify(output, null, 2)}</pre>
              </details>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
