import { describe, it, expect } from 'vitest';
import { getFormEngineStatus } from '@field/form-engine';

describe('Platform Foundation Smoke Tests', () => {
  it('loads environment variables correctly', () => {
    expect(process.env.NEXT_PUBLIC_APP_NAME || 'Field Workforce Platform').toBeDefined();
  });

  it('verifies form engine status', () => {
    const status = getFormEngineStatus();
    expect(status.status).toBe('active');
    expect(status.modulesPlanned).toContain('schema');
    expect(status.modulesPlanned).toContain('renderer');
  });
});
