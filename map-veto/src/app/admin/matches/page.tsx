'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface Match {
    id: string;
    teamA: string;
    teamB: string;
    format: string;
    status: 'pending' | 'coin_toss' | 'in_progress' | 'completed' | 'cancelled';
    scheduledAt: string;
    createdAt: string;
}

const MOCK_MATCHES: Match[] = [
    { id: '1', teamA: 'Fnatic', teamB: 'Sentinels', format: 'bo3', status: 'in_progress', scheduledAt: '2026-01-06T14:00', createdAt: '2026-01-05' },
    { id: '2', teamA: 'Cloud9', teamB: 'NRG', format: 'bo3', status: 'pending', scheduledAt: '2026-01-06T18:00', createdAt: '2026-01-05' },
    { id: '3', teamA: 'Team Liquid', teamB: 'DRX', format: 'bo5', status: 'completed', scheduledAt: '2026-01-05T20:00', createdAt: '2026-01-04' },
    { id: '4', teamA: '100 Thieves', teamB: 'LOUD', format: 'bo3', status: 'pending', scheduledAt: '2026-01-07T16:00', createdAt: '2026-01-06' },
    { id: '5', teamA: 'G2', teamB: 'Heretics', format: 'bo3', status: 'cancelled', scheduledAt: '2026-01-06T12:00', createdAt: '2026-01-05' },
    { id: '6', teamA: 'NRG', teamB: 'Sentinels', format: 'bo3', status: 'completed', scheduledAt: '2026-01-04T20:00', createdAt: '2026-01-03' },
];

export default function MatchesPage() {
    const [filter, setFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredMatches = MOCK_MATCHES.filter(match => {
        if (filter !== 'all' && match.status !== filter) return false;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return match.teamA.toLowerCase().includes(query) || match.teamB.toLowerCase().includes(query);
        }
        return true;
    });

    const getStatusBadge = (status: Match['status']) => {
        const styles = {
            pending: 'bg-gray-500/20 text-gray-400',
            coin_toss: 'bg-yellow-500/20 text-yellow-400',
            in_progress: 'bg-green-500/20 text-green-400 animate-pulse',
            completed: 'bg-blue-500/20 text-blue-400',
            cancelled: 'bg-red-500/20 text-red-400',
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs ${styles[status]}`}>
                {status.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Matches</h1>
                <Link href="/admin/matches/new" className="btn-primary px-4 py-2 rounded-xl text-sm">
                    + New Match
                </Link>
            </div>

            {/* Filters */}
            <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-4">
                <div className="flex gap-2">
                    {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg text-sm transition-colors ${filter === status
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                }`}
                        >
                            {status === 'all' ? 'All' : status.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <div className="flex-1" />
                <input
                    type="text"
                    placeholder="Search teams..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                />
            </div>

            {/* Matches List */}
            <div className="glass rounded-2xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="text-left text-sm text-white/50 border-b border-white/10">
                            <th className="px-6 py-4 font-medium">Match</th>
                            <th className="px-6 py-4 font-medium">Format</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">Scheduled</th>
                            <th className="px-6 py-4 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMatches.map((match) => (
                            <motion.tr
                                key={match.id}
                                layout
                                className="border-b border-white/5 hover:bg-white/5"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium">{match.teamA}</span>
                                        <span className="text-white/40">vs</span>
                                        <span className="text-white font-medium">{match.teamB}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-white/60 uppercase text-sm">{match.format}</span>
                                </td>
                                <td className="px-6 py-4">
                                    {getStatusBadge(match.status)}
                                </td>
                                <td className="px-6 py-4 text-white/50 text-sm">
                                    {new Date(match.scheduledAt).toLocaleString()}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/match/${match.id}`}
                                            target="_blank"
                                            className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                        >
                                            View
                                        </Link>
                                        <button className="px-3 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 transition-colors">
                                            Links
                                        </button>
                                        {match.status === 'pending' && (
                                            <button className="px-3 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-300 transition-colors">
                                                Start
                                            </button>
                                        )}
                                        {match.status === 'in_progress' && (
                                            <button className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 transition-colors">
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>

                {filteredMatches.length === 0 && (
                    <div className="p-12 text-center text-white/40">
                        No matches found
                    </div>
                )}
            </div>
        </div>
    );
}
