import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFormRepository } from '../supabase-form-repository';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc, from }) }));

describe('SupabaseFormRepository publishing adapter (mocked transport)', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('sends only form/version IDs; the database owns publisher identity', async () => {
    rpc.mockResolvedValue({ error: null });
    await new SupabaseFormRepository().publishVersion({ formId: 'form', versionId: 'version', organizationId: 'org', userId: 'spoofed-user' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('publish_form_version', { p_form_id: 'form', p_version_id: 'version' });
  });

  it('updates change_note if provided prior to publishing', async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    });
    from.mockReturnValue({ update });
    rpc.mockResolvedValue({ error: null });

    await new SupabaseFormRepository().publishVersion({
      formId: 'form',
      versionId: 'version',
      organizationId: 'org',
      userId: 'user',
      changeNote: 'Release note',
    });

    expect(from).toHaveBeenCalledWith('form_versions');
    expect(update).toHaveBeenCalledWith({ change_note: 'Release note' });
    expect(rpc).toHaveBeenCalledWith('publish_form_version', { p_form_id: 'form', p_version_id: 'version' });
  });

  it('lists versions for a form with tenant isolation and descending order', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: 'v2', version_number: 2, status: 'draft' },
        { id: 'v1', version_number: 1, status: 'published' },
      ],
      error: null,
    });
    const eqOrg = vi.fn().mockReturnValue({ order });
    const eqForm = vi.fn().mockReturnValue({ eq: eqOrg });
    const select = vi.fn().mockReturnValue({ eq: eqForm });
    from.mockReturnValue({ select });

    const versions = await new SupabaseFormRepository().listVersions('form-123', 'org-456');

    expect(from).toHaveBeenCalledWith('form_versions');
    expect(select).toHaveBeenCalledWith('*');
    expect(eqForm).toHaveBeenCalledWith('form_id', 'form-123');
    expect(eqOrg).toHaveBeenCalledWith('organization_id', 'org-456');
    expect(order).toHaveBeenCalledWith('version_number', { ascending: false });
    expect(versions).toHaveLength(2);
    expect(versions[0].version_number).toBe(2);
  });

  it('propagates RPC authorization or transaction failures', async () => {
    rpc.mockResolvedValue({ error: { message: 'publishing not authorized' } });
    await expect(new SupabaseFormRepository().publishVersion({ formId: 'form', versionId: 'version', organizationId: 'org', userId: 'user' })).rejects.toThrow('publishing not authorized');
  });
});
