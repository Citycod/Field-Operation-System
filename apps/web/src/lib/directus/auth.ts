import { readMe, login, logout, refresh } from '@directus/sdk';
import { directusClient } from './client';
import { UserProfile } from '@field/types';

export async function loginWithDirectus(email: string, password: string): Promise<UserProfile> {
  // Perform authentication via Directus SDK
  await directusClient.request(login(email, password));

  // Retrieve current authenticated user profile from Directus
  const user = await directusClient.request(
    readMe({
      fields: ['id', 'email', 'first_name', 'last_name', 'status'],
    })
  );

  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name || undefined,
    last_name: user.last_name || undefined,
    status: user.status,
  };
}

export async function logoutDirectus(): Promise<void> {
  try {
    await directusClient.request(logout());
  } catch (error) {
    console.warn('Directus logout warning:', error);
  }
}

export async function refreshDirectusSession(): Promise<void> {
  await directusClient.request(refresh());
}
