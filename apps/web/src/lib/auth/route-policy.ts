export function isPublicPage(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/');
}

export function isProtectedPage(pathname: string): boolean {
  if (pathname.startsWith('/api/') || pathname === '/api') return false;
  if (pathname.startsWith('/dev/') || pathname === '/dev') return false;
  return !isPublicPage(pathname);
}

export function safePostLoginPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';

  try {
    const url = new URL(value, 'https://fieldops.local');
    if (url.origin !== 'https://fieldops.local' || !isProtectedPage(url.pathname)) {
      return '/dashboard';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}
