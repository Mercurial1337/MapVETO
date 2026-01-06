'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

interface Match {
    id: string;
    team_a_name: string;
    team_b_name: string;
    format: string;
    status: 'pending' | 'coin_toss' | 'in_progress' | 'completed' | 'cancelled';
    scheduled_at: string | null;
    created_at: string;
}

interface MatchLinks {
    team_a: string;
    team_b: string;
    observer: string;
}

export default function MatchesPage() {
    const [matches, setMatches] = useState<Match[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMatchLinks, setSelectedMatchLinks] = useState<{ matchId: string; links: MatchLinks } | null>(null);
    const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchMatches();
    }, []);

    const fetchMatches = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setMatches(data);
        }
        setIsLoading(false);
    };

    const fetchMatchLinks = async (matchId: string) => {
        setLoadingLinks(matchId);
        const { data, error } = await supabase
            .from('match_links')
            .select('link_type, token')
            .eq('match_id', matchId);

        if (!error && data) {
            const baseUrl = window.location.origin;
            const links: MatchLinks = {
                team_a: '',
                team_b: '',
                observer: '',
            };
            data.forEach(link => {
                const url = `${baseUrl}/match/${matchId}?token=${link.token}`;
                if (link.link_type === 'team_a') links.team_a = url;
                else if (link.link_type === 'team_b') links.team_b = url;
                else if (link.link_type === 'observer') links.observer = url;
            });
            setSelectedMatchLinks({ matchId, links });
        }
        setLoadingLinks(null);
    };

    const copyToClipboard = async (text: string, label: string) => {
        await navigator.clipboard.writeText(text);
        alert(`${label} link copied!`);
    };

    const filteredMatches = matches.filter(match => {
        if (filter !== 'all' && match.status !== filter) return false;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return match.team_a_name.toLowerCase().includes(query) || match.team_b_name.toLowerCase().includes(query);
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        );
    }

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
                    {['all', 'pending', 'coin_toss', 'in_progress', 'completed', 'cancelled'].map((status) => (
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

            {/* Links Modal */}
            {selectedMatchLinks && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setSelectedMatchLinks(null)}
                >
                    <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        className="glass rounded-2xl p-6 max-w-lg w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-white mb-4">Match Links</h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Team A', key: 'team_a' as const, color: 'red' },
                                { label: 'Team B', key: 'team_b' as const, color: 'blue' },
                                { label: 'Observer', key: 'observer' as const, color: 'purple' },
                            ].map(({ label, key, color }) => (
                                <div key={key} className={`p-3 bg-${color}-500/10 border border-${color}-500/20 rounded-lg`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-${color}-400 font-medium text-sm`}>{label}</span>
                                        <button
                                            onClick={() => copyToClipboard(selectedMatchLinks.links[key], label)}
                                            className={`text-xs px-2 py-1 bg-${color}-500/20 hover:bg-${color}-500/30 rounded text-${color}-300`}
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <p className="text-xs text-white/50 font-mono break-all">
                                        {selectedMatchLinks.links[key]}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setSelectedMatchLinks(null)}
                            className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                        >
                            Close
                        </button>
                    </motion.div>
                </motion.div>
            )}

            {/* Matches List */}
            <div className="glass rounded-2xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="text-left text-sm text-white/50 border-b border-white/10">
                            <th className="px-6 py-4 font-medium">Match</th>
                            <th className="px-6 py-4 font-medium">Format</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">Created</th>
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
                                        <span className="text-white font-medium">{match.team_a_name}</span>
                                        <span className="text-white/40">vs</span>
                                        <span className="text-white font-medium">{match.team_b_name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-white/60 uppercase text-sm">{match.format}</span>
                                </td>
                                <td className="px-6 py-4">
                                    {getStatusBadge(match.status)}
                                </td>
                                <td className="px-6 py-4 text-white/50 text-sm">
                                    {new Date(match.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fetchMatchLinks(match.id)}
                                            disabled={loadingLinks === match.id}
                                            className="px-3 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 transition-colors disabled:opacity-50"
                                        >
                                            {loadingLinks === match.id ? '...' : 'Links'}
                                        </button>
                                        {(match.status === 'in_progress' || match.status === 'coin_toss' || match.status === 'completed') && (
                                            <a
                                                href={`/match/${match.id}?token=observer`}
                                                target="_blank"
                                                className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                            >
                                                View
                                            </a>
                                        )}
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>

                {filteredMatches.length === 0 && (
                    <div className="p-12 text-center text-white/40">
                        {matches.length === 0 ? 'No matches yet. Create your first match!' : 'No matches found'}
                    </div>
                )}
            </div>
        </div>
    );
}
