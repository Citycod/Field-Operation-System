"use client";

import { useState } from "react";
import { FormBuilder } from "@field/form-builder";
import type { FormSchemaV1 } from "@field/form-engine";
import { blankBuilderSchema } from "./fixture";
import "@field/form-builder/styles.css";
import "@field/form-renderer/styles.css";
import "./demo.css";

export function BuilderDemo() {
  const [saved, setSaved] = useState<FormSchemaV1>();
  return (
    <div className="builder-demo-shell">
      <header className="builder-demo-top">
        <strong>◉ FieldOps</strong>
        <nav aria-label="Platform navigation">
          <span>Home</span>
          <span>Forms</span>
          <span>Administration</span>
        </nav>
        <span>Development workspace</span>
      </header>
      <FormBuilder
        initialSchema={blankBuilderSchema}
        onSave={async (schema) => {
          setSaved(structuredClone(schema));
        }}
      />
      {saved && (
        <output className="builder-save-output">
          Local draft callback received {saved.tabs.length} tabs.
        </output>
      )}
    </div>
  );
}
