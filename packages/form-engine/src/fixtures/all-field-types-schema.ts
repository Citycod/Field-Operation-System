import { FormSchemaV1 } from '../schema/form-schema';

export const ALL_FIELD_TYPES_SCHEMA: FormSchemaV1 = {
  schemaVersion: 1,
  form: {
    id: 'form_all_01',
    key: 'all_fields_form',
    title: 'All Supported Field Types Form',
    description: 'Fixture showcasing every supported field and tab type',
    schemaVersion: 1,
  },
  header: {
    columns: 2,
    sections: [
      {
        id: 'hdr_sec_1',
        key: 'hdr_general',
        title: 'Header Details',
        order: 0,
        fields: [
          {
            id: 'fld_hdr_1',
            key: 'header_text',
            type: 'text',
            label: 'Header Text',
            order: 0,
          },
        ],
      },
    ],
  },
  tabs: [
    {
      id: 'tab_fields_01',
      key: 'fields_tab',
      title: 'All Fields',
      type: 'form',
      order: 0,
      sections: [
        {
          id: 'sec_fields_01',
          key: 'main_fields',
          title: 'Main Fields Section',
          order: 0,
          fields: [
            { id: 'fld_txt', key: 'text_field', type: 'text', label: 'Text', order: 0 },
            { id: 'fld_txa', key: 'textarea_field', type: 'textarea', label: 'Textarea', order: 1 },
            { id: 'fld_num', key: 'number_field', type: 'number', label: 'Number', order: 2 },
            { id: 'fld_cur', key: 'currency_field', type: 'currency', label: 'Currency', order: 3 },
            { id: 'fld_dte', key: 'date_field', type: 'date', label: 'Date', order: 4 },
            {
              id: 'fld_drp',
              key: 'dropdown_field',
              type: 'dropdown',
              label: 'Dropdown',
              order: 5,
              options: [{ label: 'Option A', value: 'a' }],
            },
            { id: 'fld_chk', key: 'checkbox_field', type: 'checkbox', label: 'Checkbox', order: 6 },
            {
              id: 'fld_lkp',
              key: 'lookup_field',
              type: 'lookup',
              label: 'Lookup',
              order: 7,
              lookupConfig: { targetEntity: 'vendors', displayField: 'name', valueField: 'id' },
            },
            { id: 'fld_fle', key: 'file_field', type: 'file', label: 'File', order: 8 },
            {
              id: 'fld_clc',
              key: 'calculated_field',
              type: 'calculated',
              label: 'Calculated',
              order: 9,
              calculationConfig: { operation: 'add', operands: ['fld_num', 'fld_cur'] },
            },
          ],
        },
      ],
    },
    {
      id: 'tab_dtl_01',
      key: 'line_items',
      title: 'Line Items',
      type: 'details',
      order: 1,
      configuration: {
        allowAdd: true,
        allowEdit: true,
        allowDelete: true,
        columns: [
          { id: 'col_item', key: 'item_name', label: 'Item', type: 'text', order: 0 },
          { id: 'col_qty', key: 'quantity', label: 'Qty', type: 'number', order: 1 },
        ],
      },
    },
    {
      id: 'tab_nts_01',
      key: 'notes_tab',
      title: 'Audit Notes',
      type: 'notes',
      order: 2,
      appendOnly: true,
      showAuthor: true,
      showTimestamp: true,
      allowAttachments: true,
      defaultVisibility: 'internal',
    },
    {
      id: 'tab_doc_01',
      key: 'docs_tab',
      title: 'Attachments',
      type: 'documents',
      order: 3,
      allowMultiple: true,
      required: false,
    },
  ],
  rules: [
    {
      id: 'rule_01',
      key: 'show_textarea_if_checkbox',
      name: 'Show textarea on check',
      conditions: [{ fieldId: 'fld_chk', operator: 'equals', value: true }],
      actions: [{ targetFieldId: 'fld_txa', action: 'show' }],
    },
  ],
  workflow: {
    type: 'sequential',
    stages: [
      {
        id: 'stg_01',
        key: 'manager_approval',
        name: 'Manager Approval',
        order: 0,
        approverType: 'managerOfRequester',
      },
    ],
  },
  listView: {
    columns: [
      { id: 'col_ref_1', sourceRef: 'text_field', label: 'Text Field', order: 0 },
      { id: 'col_ref_2', sourceRef: 'system.created_at', label: 'Created At', order: 1 },
    ],
  },
  permissions: {},
  settings: {},
};
