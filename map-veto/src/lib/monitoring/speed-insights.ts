/** Keep private links and record identifiers out of performance telemetry. */
export function sanitizePerformanceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'vgveto.com') return null;
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    url.pathname = url.pathname
      .replace(/\/match\/[^/]+/, '/match/[id]')
      .replace(/\/events\/[^/]+/, '/events/[id]')
      .replace(/\/public\/log\/[^/]+/, '/public/log/[matchId]');
    return url.toString();
  } catch {
    return null;
  }
}
