import { createDirectus, rest, authentication, AuthenticationStorage, AuthenticationData } from '@directus/sdk';
import { env } from '../env/env';

const customStorage: AuthenticationStorage = {
  get: () => {
    if (typeof window === 'undefined') return null;
    const item = localStorage.getItem('directus_auth_data');
    return item ? (JSON.parse(item) as AuthenticationData) : null;
  },
  set: (data: AuthenticationData | null) => {
    if (typeof window !== 'undefined') {
      if (data) localStorage.setItem('directus_auth_data', JSON.stringify(data));
      else localStorage.removeItem('directus_auth_data');
    }
  },
};

export const directusClient = createDirectus(env.directusUrl)
  .with(rest())
  .with(authentication('json', { storage: customStorage }));
