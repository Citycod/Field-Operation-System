import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@field/types';
import { isProtectedPage, isPublicPage, safePostLoginPath } from '@/lib/auth/route-policy';
import { getSupabasePublicConfig } from './config';

function redirectWithCookies(url: URL, source: NextResponse) {
  const response = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

function loginRedirect(request: NextRequest, source: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (request.nextUrl.pathname !== '/') {
    url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  }
  return redirectWithCookies(url, source);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  let config;
  try {
    config = getSupabasePublicConfig();
  } catch {
    if (isProtectedPage(pathname)) return loginRedirect(request, supabaseResponse);
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPage(pathname)) {
    return loginRedirect(request, supabaseResponse);
  }

  if (user && (pathname === '/' || isPublicPage(pathname))) {
    const url = request.nextUrl.clone();
    const destination = new URL(
      safePostLoginPath(request.nextUrl.searchParams.get('next')),
      request.url,
    );
    url.pathname = destination.pathname;
    url.search = destination.search;
    url.hash = destination.hash;
    return redirectWithCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}
