import { afterEach, describe, expect, it } from 'vitest';
import { getSupabasePublicConfig } from '../config';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe('Supabase public configuration', () => {
  it('rejects missing or placeholder configuration instead of creating a mock session', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getSupabasePublicConfig()).toThrow(/not configured/i);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key';
    expect(() => getSupabasePublicConfig()).toThrow(/not configured/i);
  });

  it('returns configured public values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-key';
    expect(getSupabasePublicConfig()).toEqual({
      url: 'https://project.supabase.co',
      anonKey: 'public-key',
    });
  });
});
