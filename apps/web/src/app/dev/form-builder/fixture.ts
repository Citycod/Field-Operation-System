import type { FormSchemaV1 } from "@field/form-engine";

export const blankBuilderSchema: FormSchemaV1 = {
  schemaVersion: 1,
  form: {
    id: "builder_demo",
    key: "operations_form",
    title: "Operations form",
    description:
      "Configure a reusable operational form from the approved schema.",
    schemaVersion: 1,
  },
  header: { columns: 2, sections: [] },
  tabs: [
    {
      id: "tab_general",
      key: "general",
      title: "General",
      type: "form",
      order: 0,
      columns: 2,
      sections: [],
    },
  ],
  rules: [],
  workflow: null,
  listView: { columns: [] },
  permissions: {},
  settings: {},
};
