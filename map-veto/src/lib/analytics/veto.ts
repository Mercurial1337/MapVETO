import type { BannedMap, PickedMap } from '../../types/index.ts';

export interface AnalyticsMatch {
  id: string;
  team_a_name: string;
  team_b_name: string;
  format: string;
  status: string;
  completed_at: string | null;
  day: string;
  round: string;
  state: { is_complete: boolean; available_maps: string[]; banned_maps: BannedMap[]; picked_maps: PickedMap[] } | null;
}
export interface MapStats {
  id: string; name: string; appearances: number; picks: number; bans: number;
  firstBans: number; deciders: number; attack: number; defense: number;
}
export interface TeamStats {
  id: string; name: string; sample: number; maps: MapStats[];
  recent: { id: string; opponent: string; format: string; completedAt: string | null; picks: string[]; bans: string[] }[];
}
export interface VetoAnalytics {
  maps: MapStats[]; teams: TeamStats[]; sample: number;
  options: { days: string[]; rounds: string[] };
}
export interface AnalyticsFilters { format?: string; day?: string; round?: string }

export const teamKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const emptyMap = (id: string, names: Map<string, string>): MapStats => ({
  id, name: names.get(id) || 'Unknown map', appearances: 0, picks: 0, bans: 0, firstBans: 0, deciders: 0, attack: 0, defense: 0,
});
const sorted = (maps: Map<string, MapStats>) => [...maps.values()].sort((a, b) => a.name.localeCompare(b.name));

/** Current completed state is authoritative: audit logs also contain undone actions. */
export function aggregateVeto(matches: AnalyticsMatch[], catalog: { id: string; name: string }[], filters: AnalyticsFilters = {}): VetoAnalytics {
  const names = new Map(catalog.map(map => [map.id, map.name]));
  const maps = new Map<string, MapStats>(), teams = new Map<string, TeamStats>();
  const teamMaps = new Map<string, Map<string, MapStats>>();
  const days = new Set<string>(), rounds = new Set<string>();
  let sample = 0;
  for (const match of matches) {
    const state = match.state;
    if (match.status !== 'completed' || !state?.is_complete) continue;
    if (match.day) days.add(match.day);
    if (match.round) rounds.add(match.round);
    if ((filters.format && match.format !== filters.format) || (filters.day && match.day !== filters.day) || (filters.round && match.round !== filters.round)) continue;
    sample++;
    const actors = new Map<string, { team: TeamStats; maps: Map<string, MapStats> }>();
    for (const [actor, name] of [['team_a', match.team_a_name], ['team_b', match.team_b_name]]) {
      const id = teamKey(name);
      if (!teams.has(id)) {
        teams.set(id, { id, name: name.trim().replace(/\s+/g, ' '), sample: 0, maps: [], recent: [] });
        teamMaps.set(id, new Map());
      }
      const team = teams.get(id)!;
      team.sample++;
      actors.set(actor, { team, maps: teamMaps.get(id)! });
    }
    const pool = new Set([...state.available_maps, ...state.banned_maps.map(m => m.map_id), ...state.picked_maps.map(m => m.map_id)]);
    for (const id of pool) {
      if (!maps.has(id)) maps.set(id, emptyMap(id, names));
      maps.get(id)!.appearances++;
      for (const entry of actors.values()) {
        if (!entry.maps.has(id)) entry.maps.set(id, emptyMap(id, names));
        entry.maps.get(id)!.appearances++;
      }
    }
    // Array order is selection order. Track each team's own first ban, not only step 1.
    const firstBan = new Set<string>();
    for (const ban of state.banned_maps) {
      const entry = actors.get(ban.banned_by);
      const total = maps.get(ban.map_id);
      if (!entry || !total) continue;
      const own = entry.maps.get(ban.map_id)!;
      total.bans++; own.bans++;
      if (!firstBan.has(ban.banned_by)) { total.firstBans++; own.firstBans++; firstBan.add(ban.banned_by); }
    }
    for (const pick of state.picked_maps) {
      const total = maps.get(pick.map_id)!;
      if (pick.picked_by === 'system') {
        total.deciders++;
        for (const entry of actors.values()) entry.maps.get(pick.map_id)!.deciders++;
      } else {
        const entry = actors.get(pick.picked_by);
        if (entry) { total.picks++; entry.maps.get(pick.map_id)!.picks++; }
      }
      // Actors in saved selections are original team links, independent of A/B role swaps.
      const chooser = actors.get(pick.side_picked_by || '');
      if (chooser && (pick.side === 'attack' || pick.side === 'defense')) {
        total[pick.side]++; chooser.maps.get(pick.map_id)![pick.side]++;
      }
    }
    for (const [actor, { team }] of actors) {
      team.recent.push({ id: match.id, opponent: actor === 'team_a' ? match.team_b_name : match.team_a_name,
        format: match.format, completedAt: match.completed_at,
        picks: state.picked_maps.filter(m => m.picked_by === actor).map(m => names.get(m.map_id) || 'Unknown map'),
        bans: state.banned_maps.filter(m => m.banned_by === actor).map(m => names.get(m.map_id) || 'Unknown map') });
    }
  }
  for (const team of teams.values()) {
    team.maps = sorted(teamMaps.get(team.id)!);
    team.recent.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '') || a.id.localeCompare(b.id));
    team.recent = team.recent.slice(0, 10);
  }
  return { maps: sorted(maps), teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)), sample,
    options: { days: [...days].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), rounds: [...rounds].sort() } };
}
