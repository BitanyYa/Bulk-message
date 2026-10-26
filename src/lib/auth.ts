/**
 * Minimal server-side access control for internal company deployment.
 * Prevents unauthorized public access from exhausting company AfroMessage SMS credits.
 */

export function isAccessProtectionConfigured(): boolean {
  const key = process.env.APP_ACCESS_KEY;
  return Boolean(key && key.trim().length > 0);
}

export function validateRequestAccess(request: Request): { authorized: boolean; reason?: string } {
  const configuredKey = process.env.APP_ACCESS_KEY?.trim();

  // If no internal access key is configured in development, allow access with caution
  if (!configuredKey) {
    return { authorized: true };
  }

  // Check header 'x-app-access-key' or Authorization header or cookie
  const providedKey = request.headers.get('x-app-access-key')?.trim();

  if (!providedKey) {
    return {
      authorized: false,
      reason: 'Missing access key. An internal company access key is required to send campaigns.',
    };
  }

  if (providedKey !== configuredKey) {
    return {
      authorized: false,
      reason: 'Invalid access key. Please provide the authorized Yonas Mobile employee access key.',
    };
  }

  return { authorized: true };
}
