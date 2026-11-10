/**
 * Provider-Neutral Object Storage Interface & Types.
 * 
 * Rules:
 * 1. Do NOT import @supabase/supabase-js or any provider-specific SDK in this file.
 * 2. Do NOT leak provider bucket names, raw CDN URLs, or S3/Supabase specific response shapes.
 * 3. All platform modules (Form Builder, HSE, Jobs, Procurement) must depend only on this abstraction.
 */

export interface UploadFileInput {
  organizationId: string;
  module: string;
  entityId: string;
  filename: string;
  content: Blob | Buffer | Uint8Array;
  mimeType: string;
}

export interface StoredFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageService {
  /**
   * Uploads a file using the provider-neutral storage key structure.
   */
  upload(input: UploadFileInput): Promise<StoredFile>;

  /**
   * Removes a file by its provider-neutral storage key.
   */
  remove(storageKey: string): Promise<void>;

  /**
   * Generates a secure, temporary signed download URL for a private file.
   */
  createSignedUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
}

/**
 * Generates a provider-neutral storage key following the platform standard:
 * {organization_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}
 */
export function generateStorageKey(
  organizationId: string,
  module: string,
  entityId: string,
  filename: string,
  fileId?: string
): string {
  const sanitizedFilename = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  const uniqueId = fileId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `file-${Date.now()}`);

  return `${organizationId}/${module}/${entityId}/${uniqueId}-${sanitizedFilename}`;
}
