import { createDirectus, rest, staticToken } from '@directus/sdk';
import { env } from '../env/env';

// Server-only Directus client initialization
export function getDirectusServerClient(token?: string) {
  const client = createDirectus(env.directusUrl).with(rest());
  
  if (token) {
    return client.with(staticToken(token));
  }
  
  return client;
}
