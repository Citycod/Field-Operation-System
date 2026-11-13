import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFormRepository } from '../supabase-form-repository';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc, from }) }));

describe('SupabaseFormRepository publishing adapter (mocked transport)', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('sends form/version IDs and null change note when no change note is provided', async () => {
    rpc.mockResolvedValue({ error: null });
    await new SupabaseFormRepository().publishVersion({
      formId: 'form',
      versionId: 'version',
      organizationId: 'org',
      userId: 'spoofed-user',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('publish_form_version', {
      p_form_id: 'form',
      p_version_id: 'version',
      p_change_note: null,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('passes change_note atomically to the RPC without a separate update query', async () => {
    rpc.mockResolvedValue({ error: null });

    await new SupabaseFormRepository().publishVersion({
      formId: 'form',
      versionId: 'version',
      organizationId: 'org',
      userId: 'user',
      changeNote: 'Release note',
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('publish_form_version', {
      p_form_id: 'form',
      p_version_id: 'version',
      p_change_note: 'Release note',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not persist any change-note update when the RPC call fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'publishing not authorized' } });

    await expect(
      new SupabaseFormRepository().publishVersion({
        formId: 'form',
        versionId: 'version',
        organizationId: 'org',
        userId: 'user',
        changeNote: 'Failed note',
      }),
    ).rejects.toThrow('publishing not authorized');

    expect(from).not.toHaveBeenCalled();
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

  it('preserves backwards compatibility for callers omitting changeNote (invoking RPC with default null)', async () => {
    rpc.mockResolvedValue({ error: null });

    // Calling publishVersion with changeNote omitted completely
    await new SupabaseFormRepository().publishVersion({
      formId: 'form-legacy',
      versionId: 'ver-legacy',
      organizationId: 'org-legacy',
      userId: 'user-legacy',
    });

    expect(rpc).toHaveBeenCalledWith('publish_form_version', {
      p_form_id: 'form-legacy',
      p_version_id: 'ver-legacy',
      p_change_note: null,
    });

    // Calling publishVersion with explicit undefined changeNote
    rpc.mockClear();
    await new SupabaseFormRepository().publishVersion({
      formId: 'form-legacy',
      versionId: 'ver-legacy',
      organizationId: 'org-legacy',
      userId: 'user-legacy',
      changeNote: undefined,
    });

    expect(rpc).toHaveBeenCalledWith('publish_form_version', {
      p_form_id: 'form-legacy',
      p_version_id: 'ver-legacy',
      p_change_note: null,
    });
  });

  it('permits 2-argument RPC invocations where p_change_note is omitted', async () => {
    const supabase = (new SupabaseFormRepository() as any).client();
    rpc.mockResolvedValue({ error: null });

    // Emulate a caller invoking supabase.rpc with only p_form_id and p_version_id
    await supabase.rpc('publish_form_version', {
      p_form_id: 'form-2-arg',
      p_version_id: 'ver-2-arg',
    });

    expect(rpc).toHaveBeenCalledWith('publish_form_version', {
      p_form_id: 'form-2-arg',
      p_version_id: 'ver-2-arg',
    });
  });
});
