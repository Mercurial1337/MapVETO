'use client';

import { SpeedInsights } from '@vercel/speed-insights/next';
import { sanitizePerformanceUrl } from '@/lib/monitoring/speed-insights';

export default function PerformanceMonitoring() {
  return (
    <SpeedInsights
      debug={false}
      sampleRate={0.1}
      beforeSend={(event) => {
        const url = sanitizePerformanceUrl(event.url);
        return url ? { ...event, url, route: decodeURI(new URL(url).pathname) } : null;
      }}
    />
  );
}
