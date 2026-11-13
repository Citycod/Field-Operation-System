export * from './schema';
export * from './validation';
export * from './fixtures';
export * from './rules';
export * from './workflow';

export function getFormEngineStatus() {
  return {
    status: 'active',
    version: '1.0.0',
    modulesPlanned: ['schema', 'validation', 'renderer', 'rules', 'workflow'],
  };
}
