import { FormSchemaV1 } from '../schema/form-schema';

export const MINIMAL_VALID_SCHEMA: FormSchemaV1 = {
  schemaVersion: 1,
  form: {
    id: 'form_min_01',
    key: 'minimal_form',
    title: 'Minimal Valid Form',
    schemaVersion: 1,
  },
  header: {
    columns: 1,
    sections: [],
  },
  tabs: [
    {
      id: 'tab_min_01',
      key: 'general',
      title: 'General',
      type: 'form',
      order: 0,
      sections: [],
    },
  ],
  rules: [],
  workflow: null,
  listView: {
    columns: [],
  },
  permissions: {},
  settings: {},
};
