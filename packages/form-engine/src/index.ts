export const FORM_ENGINE_VERSION = '0.1.0-placeholder';

export interface FormEngineStatus {
  status: 'placeholder';
  modulesPlanned: string[];
}

export const getFormEngineStatus = (): FormEngineStatus => ({
  status: 'placeholder',
  modulesPlanned: [
    'schema',
    'registry',
    'renderer',
    'rules',
    'calculations',
    'validation',
    'versioning',
  ],
});
