import { StorageService, UploadFileInput, StoredFile, generateStorageKey } from './storage-service';
import { createClient as createBrowserClient } from '@/lib/supabase/client';

export class SupabaseStorageService implements StorageService {
  private bucketName: string;

  constructor(bucketName: string = 'platform-files') {
    this.bucketName = bucketName;
  }

  async upload(input: UploadFileInput): Promise<StoredFile> {
    const supabase = createBrowserClient();
    const storageKey = generateStorageKey(
      input.organizationId,
      input.module,
      input.entityId,
      input.filename
    );

    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .upload(storageKey, input.content, {
        contentType: input.mimeType,
        upsert: false,
      });

    if (error || !data) {
      throw new Error(`Storage upload failed: ${error?.message || 'Unknown error'}`);
    }

    const sizeBytes = input.content instanceof Blob
      ? input.content.size
      : input.content.byteLength;

    return {
      storageKey: data.path,
      fileName: input.filename,
      mimeType: input.mimeType,
      sizeBytes,
    };
  }

  async remove(storageKey: string): Promise<void> {
    const supabase = createBrowserClient();
    const { error } = await supabase.storage
      .from(this.bucketName)
      .remove([storageKey]);

    if (error) {
      throw new Error(`Storage file deletion failed: ${error.message}`);
    }
  }

  async createSignedUrl(storageKey: string, expiresInSeconds: number = 3600): Promise<string> {
    const supabase = createBrowserClient();
    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .createSignedUrl(storageKey, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(`Signed URL generation failed: ${error?.message || 'Unknown error'}`);
    }

    return data.signedUrl;
  }
}
