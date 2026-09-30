import { ALL_FIELD_TYPES_SCHEMA, type FormSchemaV1 } from "@field/form-engine";
import type { LookupProvider, RendererValue } from "@field/form-renderer";

// Configuration-only demo: none of these business labels live in the renderer.
export const rendererFixture: FormSchemaV1 = {
  ...ALL_FIELD_TYPES_SCHEMA,
  form: {
    id: "renderer_demo",
    key: "operations_request",
    title: "Operations request",
    description:
      "Capture the information your team needs to plan and coordinate work.",
    schemaVersion: 1,
  },
  header: {
    columns: 3,
    sections: [
      {
        id: "main",
        key: "main",
        title: "Main information",
        order: 0,
        fields: [
          {
            id: "title",
            key: "title",
            label: "Request title",
            type: "text",
            order: 0,
            required: true,
            placeholder: "Enter a request title",
          },
          {
            id: "date",
            key: "date",
            label: "Request date",
            type: "date",
            order: 1,
            required: true,
          },
          {
            id: "priority",
            key: "priority",
            label: "Priority",
            type: "dropdown",
            order: 2,
            defaultValue: "normal",
            options: [
              { label: "Normal", value: "normal" },
              { label: "High", value: "high" },
            ],
          },
          {
            id: "team",
            key: "team",
            label: "Responsible team",
            type: "lookup",
            order: 3,
            lookupConfig: {
              targetEntity: "demo_teams",
              displayField: "name",
              valueField: "id",
            },
          },
          {
            id: "budget",
            key: "budget",
            label: "Estimated budget",
            type: "currency",
            currencyCode: "NGN",
            order: 4,
            validation: { min: 0 },
          },
          {
            id: "reference",
            key: "reference",
            label: "Reference",
            type: "text",
            order: 5,
            readOnly: true,
            defaultValue: "LOCAL-001",
          },
        ],
      },
    ],
  },
  tabs: [
    {
      id: "general",
      key: "general",
      title: "Request details",
      type: "form",
      order: 0,
      columns: 2,
      sections: [
        {
          id: "description",
          key: "description",
          title: "Request information",
          order: 0,
          fields: [
            {
              id: "purpose",
              key: "purpose",
              label: "Description",
              type: "textarea",
              order: 0,
              width: "full",
              placeholder: "Describe what is needed and why…",
              required: true,
              validation: { maxLength: 1000 },
            },
            {
              id: "people",
              key: "people",
              label: "People involved",
              type: "number",
              order: 1,
              validation: { min: 1 },
            },
            {
              id: "estimate",
              key: "estimate",
              label: "Provided estimate",
              type: "calculated",
              order: 2,
              calculationConfig: { operation: "add", operands: ["budget"] },
            },
            {
              id: "confirmed",
              key: "confirmed",
              label: "Information confirmed",
              type: "checkbox",
              order: 3,
            },
            {
              id: "brief",
              key: "brief",
              label: "Supporting file",
              type: "file",
              order: 4,
              validation: {
                allowedFileExtensions: ["pdf", "txt", "png"],
                maxFileSizeMb: 5,
              },
            },
          ],
        },
      ],
    },
    {
      id: "resources",
      key: "resources",
      title: "Resources",
      type: "details",
      order: 1,
      configuration: {
        allowAdd: true,
        allowEdit: true,
        allowDelete: true,
        maxRows: 10,
        columns: [
          {
            id: "resource",
            key: "resource",
            label: "Resource",
            type: "text",
            order: 0,
            required: true,
          },
          {
            id: "quantity",
            key: "quantity",
            label: "Quantity",
            type: "number",
            order: 1,
          },
          {
            id: "cost",
            key: "cost",
            label: "Unit cost",
            type: "currency",
            order: 2,
          },
        ],
      },
    },
    {
      id: "equipment",
      key: "equipment",
      title: "Equipment",
      type: "details",
      order: 2,
      configuration: {
        allowAdd: true,
        allowEdit: true,
        allowDelete: true,
        columns: [
          {
            id: "equipment_name",
            key: "equipment_name",
            label: "Equipment name",
            type: "text",
            order: 0,
          },
          {
            id: "equipment_ready",
            key: "equipment_ready",
            label: "Ready",
            type: "checkbox",
            order: 1,
          },
        ],
      },
    },
    {
      id: "additional",
      key: "additional",
      title: "Additional information",
      type: "form",
      order: 3,
      sections: [],
    },
    {
      id: "notes",
      key: "notes",
      title: "Team notes",
      type: "notes",
      order: 4,
      appendOnly: true,
      showAuthor: true,
      showTimestamp: true,
      allowAttachments: true,
      defaultVisibility: "internal",
    },
    {
      id: "documents",
      key: "documents",
      title: "Documents",
      type: "documents",
      order: 5,
      allowMultiple: true,
      required: false,
      maxFiles: 3,
      maxFileSizeMb: 5,
      allowedExtensions: ["pdf", "png", "txt"],
      allowDeleteBeforeSubmit: true,
    },
  ],
  rules: [],
  workflow: null,
  listView: { columns: [] },
  settings: {},
  permissions: {},
};
export const demoLookup: LookupProvider = async (_config, { signal }) => {
  if (signal.aborted) return [];
  return [
    { label: "Operations", value: "operations" },
    { label: "Field services", value: "field" },
    { label: "Facilities", value: "facilities" },
  ];
};
export const sampleValue: RendererValue = {
  fields: {
    title: "Site readiness review",
    date: "2026-09-30",
    priority: "normal",
    team: "operations",
    budget: 24000,
    reference: "LOCAL-001",
    purpose:
      "Review equipment and coordinate the team before the next site visit.",
    people: 4,
    confirmed: true,
    estimate: 24000,
  },
  details: {
    resources: [
      {
        id: "sample-row",
        values: { resource: "Safety supplies", quantity: 4, cost: 6000 },
      },
    ],
  },
  notes: {},
  documents: {},
};
