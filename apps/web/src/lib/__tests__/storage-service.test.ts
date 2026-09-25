import { describe, it, expect } from 'vitest';
import { generateStorageKey, StorageService, UploadFileInput, StoredFile } from '../storage/storage-service';

describe('StorageService Provider-Neutral Abstraction', () => {
  it('generates storage keys following the platform standard pattern: {organization_id}/{module}/{entity_id}/{uuid}-{filename}', () => {
    const key = generateStorageKey(
      'org-123',
      'forms',
      'submission-456',
      'Inspection Report (Final).pdf',
      'file-uuid-789'
    );

    expect(key).toBe('org-123/forms/submission-456/file-uuid-789-inspection_report_final_.pdf');
  });

  it('sanitizes filename special characters and spaces safely', () => {
    const key = generateStorageKey(
      'org-abc',
      'hse',
      'incident-101',
      'Photo #1 & Signature @2026.png',
      'fixed-uuid'
    );

    expect(key).toBe('org-abc/hse/incident-101/fixed-uuid-photo_1_signature_2026.png');
  });

  it('operates mock StorageService implementation without exposing provider SDK details', async () => {
    class MockStorageService implements StorageService {
      private files = new Map<string, StoredFile>();

      async upload(input: UploadFileInput): Promise<StoredFile> {
        const storageKey = generateStorageKey(
          input.organizationId,
          input.module,
          input.entityId,
          input.filename,
          'mock-id'
        );
        const stored: StoredFile = {
          storageKey,
          fileName: input.filename,
          mimeType: input.mimeType,
          sizeBytes: 1024,
        };
        this.files.set(storageKey, stored);
        return stored;
      }

      async remove(storageKey: string): Promise<void> {
        this.files.delete(storageKey);
      }

      async createSignedUrl(storageKey: string, expiresInSeconds: number): Promise<string> {
        return `https://storage.local/signed/${storageKey}?expires=${expiresInSeconds}`;
      }
    }

    const service = new MockStorageService();
    const result = await service.upload({
      organizationId: 'org-test',
      module: 'procurement',
      entityId: 'req-001',
      filename: 'invoice.pdf',
      content: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
    });

    expect(result.storageKey).toBe('org-test/procurement/req-001/mock-id-invoice.pdf');
    expect(result.fileName).toBe('invoice.pdf');

    const signedUrl = await service.createSignedUrl(result.storageKey, 1800);
    expect(signedUrl).toContain('https://storage.local/signed/org-test/procurement/req-001/mock-id-invoice.pdf');
  });
});
