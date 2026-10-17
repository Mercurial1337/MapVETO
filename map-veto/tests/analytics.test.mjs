import assert from 'node:assert/strict';
import { aggregateVeto } from '../src/lib/analytics/veto.ts';
const catalog = ['Ascent', 'Bind', 'Haven', 'Split'].map((name, index) => ({ id: String(index), name }));
const match = (overrides = {}) => ({ id: '1', team_a_name: 'Alpha', team_b_name: 'Beta', format: 'bo3', status: 'completed', completed_at: '2026-10-16T12:00:00Z', day: 'D1', round: 'Round 1',
  state: { is_complete: true, available_maps: [], banned_maps: [{ map_id: '0', banned_by: 'team_b' }, { map_id: '1', banned_by: 'team_a' }],
    picked_maps: [{ map_id: '2', picked_by: 'team_b', side: 'attack', side_picked_by: 'team_a', map_number: 1 }, { map_id: '3', picked_by: 'system', side: 'defense', side_picked_by: 'team_b', map_number: 2 }] }, ...overrides });
const first = match(), second = match({ id: '2', team_a_name: ' ALPHA ', team_b_name: 'Gamma', format: 'bo1', day: 'D2', round: 'Final',
  state: { is_complete: true, available_maps: [], banned_maps: [{ map_id: '0', banned_by: 'team_a' }, { map_id: '1', banned_by: 'team_a' }], picked_maps: [{ map_id: '2', picked_by: 'system', side: 'attack', side_picked_by: 'team_a', map_number: 1 }] } });
const result = aggregateVeto([first, second, match({ status: 'cancelled' }), match({ status: 'in_progress' }), match({ state: { ...first.state, is_complete: false } })], catalog);
assert.equal(result.sample, 2);
const alpha = result.teams.find(t => t.id === 'alpha'), beta = result.teams.find(t => t.id === 'beta');
assert.equal(alpha.sample, 2); assert.equal(result.teams.length, 3);
assert.equal(alpha.maps.find(m => m.id === '2').picks, 0, 'side chooser is not the picker, even after position swaps');
assert.equal(beta.maps.find(m => m.id === '2').picks, 1);
assert.equal(alpha.maps.find(m => m.id === '2').attack, 2);
assert.equal(beta.maps.find(m => m.id === '3').defense, 1);
assert.equal(result.maps.find(m => m.id === '2').deciders, 1);
assert.equal(result.maps.find(m => m.id === '3').appearances, 1, 'different pools use map-specific denominators');
assert.equal(alpha.maps.find(m => m.id === '1').firstBans, 1, 'only first ban per team per veto');
assert.equal(alpha.maps.find(m => m.id === '0').firstBans, 1);
assert.equal(result.maps.find(m => m.id === '0').firstBans, 2);
assert.equal(alpha.recent.length, 2);
assert.deepEqual(aggregateVeto([first, second], catalog, { format: 'bo1', day: 'D2', round: 'Final' }).sample, 1);
assert.equal(aggregateVeto([first], catalog, { day: 'D2' }).sample, 0);
assert.deepEqual(result.options.days, ['D1', 'D2']);
assert.deepEqual(aggregateVeto([], catalog).maps, []);
const undone = match({ state: { ...first.state, banned_maps: [{ map_id: '1', banned_by: 'team_a' }] } });
assert.equal(aggregateVeto([undone], catalog).maps.find(m => m.id === '0'), undefined, 'discarded selections are not reconstructed from logs');
const many = Array.from({ length: 20 }, (_, i) => match({ id: String(i), completed_at: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00Z` }));
assert.equal(aggregateVeto(many, catalog).teams[0].recent.length, 10);
console.log('PASS veto analytics: completed state only, original team attribution, picks vs deciders, first bans, side chooser, pool denominators, filters, name normalization, bounded history and empty data');
