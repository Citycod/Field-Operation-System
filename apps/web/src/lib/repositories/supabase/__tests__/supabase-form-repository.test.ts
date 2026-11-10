import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFormRepository } from '../supabase-form-repository';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }));

describe('SupabaseFormRepository publishing adapter (mocked transport)', () => {
  beforeEach(() => rpc.mockReset());

  it('sends only form/version IDs; the database owns publisher identity', async () => {
    rpc.mockResolvedValue({ error: null });
    await new SupabaseFormRepository().publishVersion({ formId: 'form', versionId: 'version', organizationId: 'org', userId: 'spoofed-user' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('publish_form_version', { p_form_id: 'form', p_version_id: 'version' });
  });

  it('propagates RPC authorization or transaction failures', async () => {
    rpc.mockResolvedValue({ error: { message: 'publishing not authorized' } });
    await expect(new SupabaseFormRepository().publishVersion({ formId: 'form', versionId: 'version', organizationId: 'org', userId: 'user' })).rejects.toThrow('publishing not authorized');
  });
});
