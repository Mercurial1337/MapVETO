import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
process.loadEnvFile('.env.local');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = process.env.TEST_APP_URL || 'http://localhost:3001', users = [], events = [];
async function session() {
  const email = `analytics-${randomUUID()}@example.invalid`, password = randomUUID() + 'aA!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(error); users.push(data.user.id);
  const jar = new Map(), client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: items => items.forEach(({ name, value }) => jar.set(name, value)) } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: data.user.id, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), email, password };
}
async function get(path, cookie = '', status = 200) {
  const response = await fetch(base + path, { headers: { Cookie: cookie } });
  const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body));
  if (status === 200) assert.match(response.headers.get('cache-control'), /no-store/);
  return body;
}
try {
  const owner = await session(), referee = await session(), stranger = await session();
  for (const user of [owner, stranger]) {
    const { data, error } = await db.from('events').insert({ name: 'Codex Veto Analytics QA', created_by: user.id }).select('id').single(); assert.ifError(error); events.push(data.id);
  }
  const event = events[0], path = `/api/events/${event}/analytics`;
  assert.ifError((await db.from('event_admins').insert({ event_id: event, user_id: referee.id, role: 'referee', added_by: owner.id })).error);
  await get(path, '', 401); await get(path, stranger.cookie, 404); await get(path + '?format=bad', owner.cookie, 400);
  assert.equal((await get(path, owner.cookie)).sample, 0);
  const { data: template, error: templateError } = await db.from('veto_templates').select('id').eq('format', 'bo3').eq('is_default', true).single(); assert.ifError(templateError);
  const { data: maps, error: mapError } = await db.from('maps').select('id,name').order('id').limit(3); assert.ifError(mapError); assert.equal(maps.length, 3);
  const matches = Array.from({ length: 253 }, (_, index) => ({ id: randomUUID(), event_id: index === 252 ? events[1] : event, created_by: owner.id, veto_template_id: template.id,
    team_a_name: 'Codex Alpha', team_b_name: 'Codex Beta', format: 'bo3', status: index === 251 ? 'in_progress' : 'completed', completed_at: new Date().toISOString() }));
  assert.ifError((await db.from('matches').insert(matches)).error);
  const ids = matches.map(match => match.id);
  const banned = [{ map_id: maps[0].id, banned_by: 'team_a' }], picked = [{ map_id: maps[1].id, picked_by: 'team_b', map_number: 1, side: 'attack', side_picked_by: 'team_a' }, { map_id: maps[2].id, picked_by: 'system', map_number: 2, side: 'defense', side_picked_by: 'team_b' }];
  assert.ifError((await db.from('match_state').update({ is_complete: true, available_maps: [], banned_maps: banned, picked_maps: picked }).in('match_id', ids)).error);
  const { data: source, error: sourceError } = await db.from('sheet_match_sources').insert({ event_id: event, spreadsheet_id: 'analytics_fixture_sheet_12345', source_id: 'analytics-1', tab_id: 1, tab_title: 'D1',
    snapshot: { round: 'MUTATED ROUND', password: 'DO-NOT-EXPOSE' }, created_snapshot: { round: 'Final' }, match_id: ids[0], was_created: true }).select('id').single(); assert.ifError(sourceError);
  assert.ifError((await db.from('matches').update({ sheet_source_id: source.id }).eq('id', ids[0])).error);
  const result = await get(path, owner.cookie);
  assert.equal(result.sample, 251, 'pagination includes more than 250, excludes other event and unfinished match');
  assert.equal(result.maps.find(map => map.id === maps[0].id).bans, 251);
  assert.equal(result.teams.find(team => team.name === 'Codex Alpha').maps.find(map => map.id === maps[1].id).attack, 251);
  assert.equal((await get(path, referee.cookie)).sample, 251);
  assert.equal((await get(path + '?format=bo1', owner.cookie)).sample, 0);
  assert.equal((await get(path + '?day=D1&round=Final', owner.cookie)).sample, 1);
  assert.equal((await get(path + '?round=MUTATED%20ROUND', owner.cookie)).sample, 0);
  const serialized = JSON.stringify(result); for (const secret of ['DO-NOT-EXPOSE', 'password', 'token', 'snapshot', 'service_role']) assert.ok(!serialized.includes(secret), secret);
  const page = await fetch(base + `/admin/events/${event}/analytics`, { headers: { Cookie: owner.cookie } }); assert.equal(page.status, 200); assert.ok((await page.text()).includes('Veto analytics'));
  console.log('PASS analytics HTTP: owner/referee, anonymous/outsider denial, 251-match pagination, event isolation, filters, immutable round, private response, page renders');
} finally {
  for (const id of events) {
    assert.ifError((await db.from('matches').delete().eq('event_id', id)).error);
    assert.ifError((await db.from('events').delete().eq('id', id)).error);
  }
  for (const id of users) assert.ifError((await db.auth.admin.deleteUser(id)).error);
}
