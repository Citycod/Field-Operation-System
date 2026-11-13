import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FormRenderer } from '../form-renderer';
import { FormSchemaV1 } from '@field/form-engine';

afterEach(() => {
  cleanup();
});

const BASE_TEST_SCHEMA: FormSchemaV1 = {
  schemaVersion: 1,
  form: {
    id: 'form_rules_test',
    key: 'rules_test',
    title: 'Rules Integration Test Form',
  },
  header: {
    columns: 2,
    sections: [
      {
        id: 'sec_header',
        key: 'header_sec',
        title: 'Header Section',
        order: 0,
        fields: [
          {
            id: 'f_category',
            key: 'category',
            type: 'dropdown',
            label: 'Category',
            order: 0,
            options: [
              { label: 'Standard', value: 'standard' },
              { label: 'Special', value: 'special' },
            ],
          },
          {
            id: 'f_special_notes',
            key: 'special_notes',
            type: 'text',
            label: 'Special Notes',
            order: 1,
          },
          {
            id: 'f_qty',
            key: 'qty',
            type: 'number',
            label: 'Quantity',
            order: 2,
          },
          {
            id: 'f_price',
            key: 'price',
            type: 'currency',
            label: 'Unit Price',
            order: 3,
          },
          {
            id: 'f_total',
            key: 'total',
            type: 'calculated',
            label: 'Total Cost',
            order: 4,
            calculationConfig: {
              operation: 'multiply',
              operands: ['qty', 'price'],
            },
          },
        ],
      },
    ],
  },
  tabs: [
    {
      id: 'tab_details',
      key: 'details_tab',
      title: 'Details Tab',
      type: 'form',
      order: 0,
      sections: [],
    },
  ],
  rules: [
    {
      id: 'r_show_special',
      key: 'show_special',
      name: 'Show special notes if category is special',
      conditions: [{ fieldId: 'f_category', operator: 'equals', value: 'special' }],
      actions: [
        { targetFieldId: 'f_special_notes', action: 'show' },
        { targetFieldId: 'f_special_notes', action: 'require' },
      ],
    },
    {
      id: 'r_hide_special',
      key: 'hide_special',
      name: 'Hide special notes if category is standard',
      conditions: [{ fieldId: 'f_category', operator: 'equals', value: 'standard' }],
      actions: [{ targetFieldId: 'f_special_notes', action: 'hide' }],
    },
  ],
  workflow: null,
  listView: { columns: [{ id: 'c1', sourceRef: 'category', label: 'Category', order: 0 }] },
  permissions: {
    createRoles: ['employee', 'manager', 'business_admin', 'super_admin'],
    readOwnRoles: ['employee', 'manager', 'business_admin', 'super_admin'],
    readAllRoles: ['manager', 'business_admin', 'super_admin'],
    manageFormRoles: ['business_admin', 'super_admin'],
  },
  settings: {
    trackLocation: false,
    requireLocation: false,
  },
};

describe('FormRenderer - Dynamic Rules & Calculations', () => {
  it('dynamically hides and shows fields based on condition evaluation', () => {
    const { rerender } = render(
      <FormRenderer
        schema={BASE_TEST_SCHEMA}
        value={{ fields: { category: 'standard' } }}
      />
    );

    // With category='standard', r_hide_special triggers -> special_notes is hidden
    expect(screen.queryByLabelText(/Special Notes/i)).toBeNull();

    // Change controlled value prop to category='special'
    rerender(
      <FormRenderer
        schema={BASE_TEST_SCHEMA}
        value={{ fields: { category: 'special' } }}
      />
    );

    // With category='special', r_show_special triggers -> special_notes is visible
    expect(screen.getByLabelText(/Special Notes/i)).toBeDefined();
  });

  it('enforces required validation on dynamically required fields when shown', async () => {
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        schema={BASE_TEST_SCHEMA}
        value={{ fields: { category: 'special', special_notes: '' } }}
        onSubmit={onSubmit}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Validate form/i });
    fireEvent.click(submitBtn);

    // Rule r_show_special makes special_notes required -> validation error
    await waitFor(() => {
      expect(screen.getAllByText(/This field is required/i).length).toBeGreaterThan(0);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does NOT block submission for required fields that are hidden by rules', async () => {
    const onSubmit = vi.fn();
    const schemaWithHiddenRequired: FormSchemaV1 = {
      ...BASE_TEST_SCHEMA,
      header: {
        ...BASE_TEST_SCHEMA.header,
        sections: [
          {
            ...BASE_TEST_SCHEMA.header.sections[0],
            fields: BASE_TEST_SCHEMA.header.sections[0].fields.map((f) =>
              f.key === 'special_notes' ? { ...f, required: true } : f
            ),
          },
        ],
      },
      rules: [
        {
          id: 'r_hide',
          key: 'r_hide',
          name: 'Hide special notes always',
          conditions: [{ fieldId: 'category', operator: 'equals', value: 'standard' }],
          actions: [{ targetFieldId: 'special_notes', action: 'hide' }],
        },
      ],
    };

    render(
      <FormRenderer
        schema={schemaWithHiddenRequired}
        value={{ fields: { category: 'standard', special_notes: '' } }}
        onSubmit={onSubmit}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Validate form/i });
    fireEvent.click(submitBtn);

    // Because special_notes is hidden by the rule, it does NOT trigger required validation
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('automatically calculates derived values in real time when operands change', () => {
    render(
      <FormRenderer
        schema={BASE_TEST_SCHEMA}
        value={{ fields: { qty: 4, price: 25 } }}
      />
    );

    // Total Cost should be 4 * 25 = 100
    const totalInput = screen.getByLabelText(/Total Cost/i) as HTMLInputElement;
    expect(totalInput.value).toBe('100');
    expect(totalInput.disabled).toBe(true);
  });

  it('does not display deferred rules warning banner', () => {
    render(<FormRenderer schema={BASE_TEST_SCHEMA} />);
    expect(screen.queryByText(/Rules and calculations are not applied/i)).toBeNull();
  });
});
