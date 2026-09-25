import { Organization } from '@field/types';

export interface OrganizationRepository {
  /**
   * Finds an active organization by unique ID.
   */
  findById(id: string): Promise<Organization | null>;

  /**
   * Finds multiple active organizations by array of IDs.
   */
  findManyByIds(ids: string[]): Promise<Organization[]>;

  /**
   * Finds an active organization by unique slug.
   */
  findBySlug(slug: string): Promise<Organization | null>;
}
