'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MapStats, TeamStats, VetoAnalytics } from '@/lib/analytics/veto';

type View = 'maps' | 'team' | 'compare';
const percent = (value: number, total: number) => total ? `${Math.round(value / total * 100)}%` : '—';
const rate = (value: number, total: number) => `${value} · ${percent(value, total)}`;
const top = (maps: MapStats[], key: 'picks' | 'bans' | 'firstBans' | 'deciders') => {
  const max = Math.max(0, ...maps.map(map => map[key]));
  return max ? maps.filter(map => map[key] === max).map(map => map.name).join(', ') : 'No selections yet';
};

function MapTable({ maps }: { maps: MapStats[] }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-sm text-left whitespace-nowrap">
      <caption className="sr-only">Map veto selections. Pick, ban and decider percentages use vetoes where the map was available. First bans count each team’s first ban.</caption>
      <thead className="text-white/60 border-b border-white/15"><tr>
        {['Map', 'Picks', 'Bans', 'First bans', 'Deciders', 'Side choices ATK / DEF'].map(title => <th key={title} scope="col" className="px-3 py-3 font-medium">{title}</th>)}
      </tr></thead>
      <tbody>{maps.map(map => <tr key={map.id} className="border-b border-white/10 last:border-0">
        <th scope="row" className="px-3 py-4 font-semibold">{map.name}<span className="block text-xs font-normal text-white/45 mt-1">Available in {map.appearances} vetoes</span></th>
        <td className="px-3 py-4 text-[var(--brand-lime)] tabular-nums">{rate(map.picks, map.appearances)}</td>
        <td className="px-3 py-4 tabular-nums">{rate(map.bans, map.appearances)}</td>
        <td className="px-3 py-4 tabular-nums">{map.firstBans}</td>
        <td className="px-3 py-4 tabular-nums">{rate(map.deciders, map.appearances)}</td>
        <td className="px-3 py-4 tabular-nums">{map.attack} / {map.defense}<span className="block text-xs text-white/45 mt-1">{percent(map.attack, map.attack + map.defense)} ATK</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function TeamProfile({ team }: { team: TeamStats }) {
  return <div className="space-y-5">
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="border border-white/10 rounded p-4"><p className="brand-label">Most picked</p><p className="font-bold mt-2">{top(team.maps, 'picks')}</p></div>
      <div className="border border-white/10 rounded p-4"><p className="brand-label">Most banned</p><p className="font-bold mt-2">{top(team.maps, 'bans')}</p></div>
    </div>
    <p className="text-sm text-white/60">Based on {team.sample} completed veto{team.sample === 1 ? '' : 'es'}. Side preferences count choices made by this team.</p>
    <MapTable maps={team.maps} />
    <div><h3 className="font-semibold mb-3">Recent vetoes</h3>
      <ul className="divide-y divide-white/10">{team.recent.map(match => <li key={match.id} className="py-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">vs {match.opponent}</span><span className="text-white/50">{match.format.toUpperCase()}{match.completedAt ? ` · ${match.completedAt.slice(0, 10)}` : ''}</span></div>
        <p className="text-white/60 mt-1">Picked: {match.picks.join(', ') || '—'} · Banned: {match.bans.join(', ') || '—'}</p>
      </li>)}</ul>
    </div>
  </div>;
}

function TeamSelect({ label, value, onChange, teams }: { label: string; value: string; onChange: (value: string) => void; teams: TeamStats[] }) {
  return <label className="block min-w-0 text-sm text-white/70">{label}
    <select className="match-input mt-2" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Choose a team</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
    </select>
  </label>;
}

function Comparison({ left, right }: { left: TeamStats; right: TeamStats }) {
  const ids = [...new Set([...left.maps.map(map => map.id), ...right.maps.map(map => map.id)])];
  const l = new Map(left.maps.map(map => [map.id, map])), r = new Map(right.maps.map(map => [map.id, map]));
  ids.sort((a, b) => (l.get(a)?.name || r.get(a)!.name).localeCompare(l.get(b)?.name || r.get(b)!.name));
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4 text-sm">
      {[left, right].map((team, index) => <div key={team.id} className={`border-t-2 pt-3 min-w-0 ${index === 0 ? 'border-[var(--brand-lime)]' : 'border-[var(--team-b)]'}`}>
        <h3 className="font-bold text-lg break-words">{team.name}</h3><p className="text-white/50">{team.sample} completed vetoes</p>
      </div>)}
    </div>
    <p className="text-xs text-white/60">Each rate uses that team’s vetoes where the map was available. Side choices show ATK / DEF. Deciders are shared outcomes, not team picks.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm text-left">
      <caption className="sr-only">Map preference comparison for {left.name} and {right.name}</caption>
      <thead className="border-b border-white/15 text-white/60"><tr><th scope="col" className="p-3">Map</th><th scope="col" className="p-3">{left.name}</th><th scope="col" className="p-3">{right.name}</th></tr></thead>
      <tbody>{ids.map(id => <tr key={id} className="border-b border-white/10 last:border-0 align-top">
        <th scope="row" className="p-3 font-semibold">{l.get(id)?.name || r.get(id)!.name}</th>
        {[l.get(id), r.get(id)].map((map, index) => <td key={index} className="p-3 min-w-44 space-y-2">
          {map ? <><div className="flex justify-between gap-4"><span className="text-white/60">Pick</span><span>{rate(map.picks, map.appearances)}</span></div>
            <div className="h-1 bg-white/10 rounded overflow-hidden" aria-hidden="true"><div className={index === 0 ? 'h-full bg-[var(--brand-lime)]' : 'h-full bg-[var(--team-b)]'} style={{ width: `${map.appearances ? map.picks / map.appearances * 100 : 0}%` }} /></div>
            <div className="flex justify-between gap-4"><span className="text-white/60">Ban</span><span>{rate(map.bans, map.appearances)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/60">First ban</span><span>{map.firstBans}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/60">Decider</span><span>{map.deciders}</span></div>
            <div className="flex justify-between gap-4"><span className="text-white/60">ATK / DEF</span><span>{map.attack} / {map.defense}</span></div>
          </> : <span className="text-white/45">No data for this map</span>}
        </td>)}
      </tr>)}</tbody>
    </table></div>
  </div>;
}

export function EventAnalytics({ eventId }: { eventId: string }) {
  const [data, setData] = useState<VetoAnalytics | null>(null), [eventName, setEventName] = useState('');
  const [view, setView] = useState<View>('maps'), [format, setFormat] = useState(''), [day, setDay] = useState(''), [round, setRound] = useState('');
  const [teamId, setTeamId] = useState(''), [otherId, setOtherId] = useState('');
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/events/${eventId}`, { signal: controller.signal }).then(r => r.json()).then(result => setEventName(result.event?.name || '')).catch(() => {});
    return () => controller.abort();
  }, [eventId]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (format) query.set('format', format); if (day) query.set('day', day); if (round) query.set('round', round);
    fetch(`/api/events/${eventId}/analytics?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load analytics.'); return result as VetoAnalytics; })
      .then(result => { setData(result); setLoading(false); })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [eventId, format, day, round, revision]);
  function changeFilter(setter: (value: string) => void, value: string) {
    setLoading(true); setError(''); setter(value);
  }
  function refresh() { setLoading(true); setError(''); setRevision(value => value + 1); }
  const team = data?.teams.find(t => t.id === teamId), other = data?.teams.find(t => t.id === otherId);
  return <div className="max-w-7xl mx-auto space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><Link href="/admin/events" className="text-sm text-white/60 hover:text-white">← Events</Link>
        <p className="brand-label mt-5 break-words">{eventName || 'Tournament'}</p><h1 className="brand-title text-3xl sm:text-4xl mt-2">Veto analytics</h1>
        <p className="text-sm text-white/60 mt-3">Map preferences. Team tendencies. Head-to-head comparison.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading} className="btn-secondary px-4 py-2">{loading ? 'Loading…' : 'Refresh analytics'}</button>
    </header>
    <div className="match-panel space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="text-sm text-white/70 flex-1 min-w-40">Format<select className="match-input mt-2" value={format} onChange={event => changeFilter(setFormat, event.target.value)}><option value="">All formats</option>{['bo1', 'bo3', 'bo5'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label>
        <label className="text-sm text-white/70 flex-1 min-w-40">Day<select className="match-input mt-2" value={day} onChange={event => changeFilter(setDay, event.target.value)}><option value="">All days</option>{data?.options.days.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
        <label className="text-sm text-white/70 flex-1 min-w-40">Round<select className="match-input mt-2" value={round} onChange={event => changeFilter(setRound, event.target.value)}><option value="">All rounds</option>{data?.options.rounds.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
      </div>
      <p className="text-xs text-white/50">Day and round labels come from Google Sheets imports. Manually created matches are included under All days / All rounds.</p>
    </div>
    <nav aria-label="Analytics views" className="flex flex-wrap gap-2">
      {([['maps', 'Map overview'], ['team', 'Team profile'], ['compare', 'Compare teams']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)} className={`${view === key ? 'btn-primary' : 'btn-secondary'} px-4 py-3 text-sm`}>{label}</button>)}
    </nav>
    <div aria-live="polite" aria-busy={loading}>
      {error ? <div role="alert" className="match-panel text-red-300">{error} <button type="button" className="underline ml-2" onClick={refresh}>Try again</button></div>
        : loading ? <p className="text-white/60 py-12 text-center">Loading veto analytics…</p>
          : !data?.sample ? <div className="match-panel py-12 text-center"><h2 className="font-bold text-xl">No completed vetoes in this selection</h2><p className="text-white/60 mt-2">Try different filters, or refresh after a veto finishes.</p></div>
            : <>
              {view === 'maps' ? <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">{([['Most picked', 'picks'], ['Most banned', 'bans'], ['Most common decider', 'deciders']] as const).map(([label, key]) => <div key={key} className="match-panel"><p className="brand-label">{label}</p><p className="text-xl font-bold mt-3">{top(data.maps, key)}</p></div>)}</div>
                <section className="match-panel"><h2 className="panel-head">Map pool tendencies</h2>
                  <p className="text-xs text-white/60 mb-4">Based on {data.sample} completed vetoes. Rates use vetoes where each map was available. First bans count each team’s first ban. Side counts reflect the choosing team’s preference.</p>
                  <MapTable maps={data.maps} />
                </section>
              </> : <section className="match-panel"><h2 className="panel-head">{view === 'team' ? 'Team profile' : 'Compare teams'}</h2>
                <div className={`grid gap-4 mb-6 ${view === 'compare' ? 'sm:grid-cols-2' : 'sm:max-w-md'}`}>
                  <TeamSelect label={view === 'team' ? 'Team' : 'First team'} value={team?.id || ''} onChange={setTeamId} teams={data.teams} />
                  {view === 'compare' ? <TeamSelect label="Second team" value={other?.id || ''} onChange={setOtherId} teams={data.teams} /> : null}
                </div>
                {view === 'team' ? team ? <TeamProfile team={team} /> : <p className="text-white/60 py-6">Choose a team to explore its veto preferences.</p>
                  : team && other && team.id !== other.id ? <Comparison left={team} right={other} /> : <p className="text-white/60 py-6">Choose two different teams to compare their map preferences.</p>}
              </section>}
            </>}
    </div>
  </div>;
}
