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
    created_at: string;
}

interface Stats {
    totalMatches: number;
    activeMatches: number;
    completedToday: number;
    pendingMatches: number;
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats>({
        totalMatches: 0,
        activeMatches: 0,
        completedToday: 0,
        pendingMatches: 0,
    });
    const [recentMatches, setRecentMatches] = useState<Match[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const supabase = createClient();

    const fetchData = async () => {
        setIsLoading(true);

        // Fetch all matches
        const { data: matches, error } = await supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && matches) {
            // Calculate stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const completedToday = matches.filter(m => {
                const createdAt = new Date(m.created_at);
                return m.status === 'completed' && createdAt >= today;
            }).length;

            setStats({
                totalMatches: matches.length,
                activeMatches: matches.filter(m => m.status === 'in_progress' || m.status === 'coin_toss').length,
                completedToday,
                pendingMatches: matches.filter(m => m.status === 'pending' || m.status === 'coin_toss').length,
            });

            // Get recent 5 matches
            setRecentMatches(matches.slice(0, 5));
        }

        setIsLoading(false);
    };

    useEffect(() => {
        fetchData();

        // Subscribe to realtime updates for matches table
        const channel = supabase
            .channel('admin-matches')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'matches',
                },
                () => {
                    // Refetch data when any match is created, updated, or deleted
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">Completed</span>;
            case 'in_progress':
                return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs animate-pulse">Live</span>;
            case 'coin_toss':
                return <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs">Coin Toss</span>;
            case 'pending':
                return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs">Pending</span>;
            default:
                return null;
        }
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
        <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="glass rounded-2xl p-6">
                    <p className="text-sm text-white/50 mb-1">Total Matches</p>
                    <p className="text-4xl font-bold text-white">{stats.totalMatches}</p>
                </div>
                <div className="glass rounded-2xl p-6">
                    <p className="text-sm text-white/50 mb-1">Active Now</p>
                    <p className="text-4xl font-bold text-yellow-400">{stats.activeMatches}</p>
                    <p className="text-xs text-white/30 mt-1">Live vetos in progress</p>
                </div>
                <div className="glass rounded-2xl p-6">
                    <p className="text-sm text-white/50 mb-1">Completed Today</p>
                    <p className="text-4xl font-bold text-green-400">{stats.completedToday}</p>
                </div>
                <div className="glass rounded-2xl p-6">
                    <p className="text-sm text-white/50 mb-1">Pending</p>
                    <p className="text-4xl font-bold text-white">{stats.pendingMatches}</p>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Link
                        href="/admin/matches/new"
                        className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">➕</span>
                        <span className="text-sm text-white">Create Match</span>
                    </Link>
                    <Link
                        href="/admin/matches"
                        className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">📋</span>
                        <span className="text-sm text-white">All Matches</span>
                    </Link>
                    <Link
                        href="/admin/matches/new"
                        className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">🎮</span>
                        <span className="text-sm text-white">Quick Veto</span>
                    </Link>
                    <button
                        onClick={fetchData}
                        className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">🔄</span>
                        <span className="text-sm text-white">Refresh</span>
                    </button>
                </div>
            </div>

            {/* Recent Matches */}
            <div className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Recent Matches</h2>
                    <Link href="/admin/matches" className="text-sm text-purple-400 hover:text-purple-300">
                        View All →
                    </Link>
                </div>

                {recentMatches.length === 0 ? (
                    <div className="text-center py-8 text-white/40">
                        <p className="mb-4">No matches yet</p>
                        <Link href="/admin/matches/new" className="btn-primary px-4 py-2 rounded-xl text-sm">
                            Create Your First Match
                        </Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-sm text-white/50 border-b border-white/10">
                                    <th className="pb-3 font-medium">Match</th>
                                    <th className="pb-3 font-medium">Format</th>
                                    <th className="pb-3 font-medium">Status</th>
                                    <th className="pb-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentMatches.map((match) => (
                                    <tr key={match.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-4">
                                            <span className="text-white font-medium">{match.team_a_name}</span>
                                            <span className="text-white/40 mx-2">vs</span>
                                            <span className="text-white font-medium">{match.team_b_name}</span>
                                        </td>
                                        <td className="py-4">
                                            <span className="text-white/60 uppercase text-sm">{match.format}</span>
                                        </td>
                                        <td className="py-4">
                                            {getStatusBadge(match.status)}
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href="/admin/matches"
                                                    className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                                >
                                                    Manage
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
