import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RulesEditor } from "../rules-editor";
import { FormBuilder } from "../form-builder";
import type { FormSchemaV1 } from "@field/form-engine";

afterEach(() => {
  cleanup();
});

const TEST_SCHEMA: FormSchemaV1 = {
  schemaVersion: 1,
  form: {
    schemaVersion: 1,
    id: "f_rules_editor_test",
    key: "rules_editor_test",
    title: "Rules Editor Test Form",
  },
  header: {
    columns: 2,
    sections: [
      {
        id: "sec_1",
        key: "sec_main",
        title: "Main Section",
        order: 0,
        fields: [
          {
            id: "f_role",
            key: "user_role",
            type: "dropdown",
            label: "User Role",
            order: 0,
            options: [
              { label: "Admin", value: "admin" },
              { label: "Guest", value: "guest" },
            ],
          },
          {
            id: "f_access_code",
            key: "access_code",
            type: "text",
            label: "Access Code",
            order: 1,
          },
        ],
      },
    ],
  },
  tabs: [
    {
      id: "tab_1",
      key: "tab_1",
      title: "Tab 1",
      type: "form",
      order: 0,
      sections: [],
    },
  ],
  rules: [],
  workflow: null,
  listView: { columns: [{ id: "c1", sourceRef: "user_role", label: "User Role", order: 0 }] },
  permissions: {
    createRoles: ["employee", "manager", "business_admin", "super_admin"],
    readOwnRoles: ["employee", "manager", "business_admin", "super_admin"],
    readAllRoles: ["manager", "business_admin", "super_admin"],
    manageFormRoles: ["business_admin", "super_admin"],
  },
  settings: {},
};

describe("RulesEditor Component", () => {
  it("renders empty state when no rules exist and allows creating first rule", () => {
    const onChange = vi.fn();
    render(<RulesEditor schema={TEST_SCHEMA} onChange={onChange} />);

    expect(screen.getByTestId("rules-empty-state")).toBeDefined();
    expect(screen.getByText(/No rules defined/i)).toBeDefined();

    const createBtn = screen.getByTestId("create-first-rule-btn");
    fireEvent.click(createBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    expect(updatedSchema.rules.length).toBe(1);
    expect(updatedSchema.rules[0].name).toBe("New Rule 1");
    expect(updatedSchema.rules[0].enabled).toBe(true);
    expect(updatedSchema.rules[0].conditions.length).toBe(1);
    expect(updatedSchema.rules[0].actions.length).toBe(1);
  });

  it("edits rule name, active status, and condition logic", () => {
    const onChange = vi.fn();
    const schemaWithRule: FormSchemaV1 = {
      ...TEST_SCHEMA,
      rules: [
        {
          id: "r1",
          key: "r1",
          name: "Original Rule",
          enabled: true,
          conditionLogic: "AND",
          conditions: [{ fieldId: "f_role", operator: "equals", value: "guest" }],
          actions: [{ targetFieldId: "f_access_code", action: "hide" }],
        },
      ],
    };

    render(<RulesEditor schema={schemaWithRule} onChange={onChange} />);

    // Edit rule name
    const nameInput = screen.getByTestId("rule-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Original Rule");
    fireEvent.change(nameInput, { target: { value: "Require Access Code for Admin" } });

    expect(onChange).toHaveBeenCalled();
    const nameCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(nameCall.rules[0].name).toBe("Require Access Code for Admin");

    // Toggle rule status
    const statusToggle = screen.getByTestId("rule-status-toggle") as HTMLInputElement;
    expect(statusToggle.checked).toBe(true);
    fireEvent.click(statusToggle);

    const toggleCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(toggleCall.rules[0].enabled).toBe(false);

    // Change condition logic to OR
    const logicSelect = screen.getByTestId("rule-logic-select") as HTMLSelectElement;
    fireEvent.change(logicSelect, { target: { value: "OR" } });

    const logicCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(logicCall.rules[0].conditionLogic).toBe("OR");
  });

  it("adds and removes conditions and actions", () => {
    const onChange = vi.fn();
    const schemaWithRule: FormSchemaV1 = {
      ...TEST_SCHEMA,
      rules: [
        {
          id: "r1",
          key: "r1",
          name: "Rule 1",
          enabled: true,
          conditionLogic: "AND",
          conditions: [{ fieldId: "f_role", operator: "equals", value: "guest" }],
          actions: [{ targetFieldId: "f_access_code", action: "hide" }],
        },
      ],
    };

    render(<RulesEditor schema={schemaWithRule} onChange={onChange} />);

    // Add condition
    const addCondBtn = screen.getByTestId("add-condition-btn");
    fireEvent.click(addCondBtn);

    const addCondCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(addCondCall.rules[0].conditions.length).toBe(2);

    // Add action
    const addActBtn = screen.getByTestId("add-action-btn");
    fireEvent.click(addActBtn);

    const addActCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(addActCall.rules[0].actions.length).toBe(2);

    // Remove first condition
    const removeCondBtn = screen.getByTestId("remove-condition-0");
    fireEvent.click(removeCondBtn);

    const removeCondCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(removeCondCall.rules[0].conditions.length).toBe(0);
  });

  it("deletes a rule and reorders rules", () => {
    const onChange = vi.fn();
    const schemaWithTwoRules: FormSchemaV1 = {
      ...TEST_SCHEMA,
      rules: [
        {
          id: "r1",
          key: "r1",
          name: "First Rule",
          enabled: true,
          conditions: [{ fieldId: "f_role", operator: "equals", value: "admin" }],
          actions: [{ targetFieldId: "f_access_code", action: "show" }],
        },
        {
          id: "r2",
          key: "r2",
          name: "Second Rule",
          enabled: true,
          conditions: [{ fieldId: "f_role", operator: "equals", value: "guest" }],
          actions: [{ targetFieldId: "f_access_code", action: "hide" }],
        },
      ],
    };

    render(<RulesEditor schema={schemaWithTwoRules} onChange={onChange} />);

    // Move first rule down
    const downBtn = screen.getByTestId("rule-down-r1");
    fireEvent.click(downBtn);

    const moveCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(moveCall.rules[0].id).toBe("r2");
    expect(moveCall.rules[1].id).toBe("r1");

    // Delete a rule
    const deleteBtn = screen.getByTestId("rule-delete-r1");
    fireEvent.click(deleteBtn);

    const deleteCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormSchemaV1;
    expect(deleteCall.rules.length).toBe(1);
    expect(deleteCall.rules[0].id).toBe("r2");
  });

  it("integrates seamlessly into FormBuilder top navigation", () => {
    render(<FormBuilder initialSchema={TEST_SCHEMA} />);

    // Click "Rules" module in top navigation
    const rulesNavBtn = screen.getByRole("button", { name: /^Rules$/i });
    fireEvent.click(rulesNavBtn);

    // Rules designer view should now be displayed
    expect(screen.getByTestId("rules-designer")).toBeDefined();
    expect(screen.getByText(/Business Rules & Dynamic Behavior/i)).toBeDefined();
  });
});
