import { OrganizationRepository } from '../organization-repository';
import { Organization } from '@field/types';
import { createClient } from '@/lib/supabase/client';

export class SupabaseOrganizationRepository implements OrganizationRepository {
  async findById(id: string): Promise<Organization | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    const org = data as { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status as 'active' | 'suspended' | 'archived',
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async findManyByIds(ids: string[]): Promise<Organization[]> {
    if (ids.length === 0) return [];

    const supabase = createClient();
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', ids)
      .eq('status', 'active');

    if (error) throw new Error('Unable to load organizations.');
    if (!data) return [];

    const orgs = data as Array<{ id: string; name: string; slug: string; status: string; created_at: string; updated_at: string }>;
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status as 'active' | 'suspended' | 'archived',
      created_at: org.created_at,
      updated_at: org.updated_at,
    }));
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    const org = data as { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status as 'active' | 'suspended' | 'archived',
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }
}
