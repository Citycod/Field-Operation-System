export interface FormModuleMeta {
  moduleName: string;
  version: string;
  status: 'placeholder' | 'active';
  supportedCapabilities: string[];
}
