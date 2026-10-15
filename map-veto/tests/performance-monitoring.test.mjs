import assert from 'node:assert/strict';
import { sanitizePerformanceUrl } from '../src/lib/monitoring/speed-insights.ts';

for (const [path, expected] of [
  ['/match/private-id?token=secret#password', '/match/[id]'],
  ['/match/private-id/overlay?token=secret', '/match/[id]/overlay'],
  ['/admin/events/private-id/sheet?password=secret', '/admin/events/[id]/sheet'],
  ['/events/private-id', '/events/[id]'],
  ['/public/log/private-id', '/public/log/[matchId]'],
  ['/admin/matches?search=private-team', '/admin/matches'],
]) {
  const result = sanitizePerformanceUrl('https://vgveto.com' + path);
  assert.ok(result);
  assert.equal(decodeURI(new URL(result).pathname), expected);
  assert.equal(new URL(result).search, '');
  assert.equal(new URL(result).hash, '');
}
for (const url of ['https://preview.vercel.app/match/id?token=secret', 'http://vgveto.com/', 'https://vgveto.com.evil.test/', 'bad-url']) {
  assert.equal(sanitizePerformanceUrl(url), null);
}
console.log('PASS performance telemetry: only production origin, no query/hash or record identifiers');
