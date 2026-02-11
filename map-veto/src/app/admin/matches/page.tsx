'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { FileSpreadsheet } from 'lucide-react';
import { ExportModal } from '@/components/admin/ExportModal';

interface Event {
    id: string;
    name: string;
}

interface Match {
    id: string;
    team_a_name: string;
    team_b_name: string;
    format: string;
    status: 'pending' | 'coin_toss' | 'in_progress' | 'completed' | 'cancelled';
    scheduled_at: string | null;
    created_at: string;
    event_id: string | null;
    events: { name: string } | null;
}

interface MatchLinks {
    team_a: string;
    team_b: string;
    observer: string;
}

type SortOrder = 'newest' | 'oldest';

export default function MatchesPage() {
    const searchParams = useSearchParams();
    const eventFilter = searchParams.get('event');
    const [matches, setMatches] = useState<Match[]>([]);
    const [events, setEvents] = useState<Event[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [formatFilter, setFormatFilter] = useState<string>('all');
    const [eventFilterLocal, setEventFilterLocal] = useState<string>('all');
    const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMatchLinks, setSelectedMatchLinks] = useState<{ matchId: string; links: MatchLinks } | null>(null);
    const [loadingLinks, setLoadingLinks] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const supabase = createClient();

    const fetchEvents = useCallback(async (userId: string) => {
        // Use the API which returns both owned and admin events
        try {
            const response = await fetch('/api/events');
            if (response.ok) {
                const data = await response.json();
                const eventsList = (data.events || []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }));
                setEvents(eventsList);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
            // Fallback to direct Supabase query for owned events
            const { data } = await supabase
                .from('events')
                .select('id, name')
                .eq('created_by', userId)
                .order('name');
            if (data) setEvents(data);
        }
    }, [supabase]);

    const fetchMatches = useCallback(async (userId: string) => {
        setIsLoading(true);

        // 1. Fetch matches created by the user
        let ownedQuery = supabase
            .from('matches')
            .select('*, events(name)')
            .eq('created_by', userId)
            .order('created_at', { ascending: sortOrder === 'oldest' });

        if (eventFilter) {
            ownedQuery = ownedQuery.eq('event_id', eventFilter);
        }

        const { data: ownedMatches, error: ownedError } = await ownedQuery;

        // 2. Fetch event IDs where user is an admin
        const { data: adminEntries } = await supabase
            .from('event_admins')
            .select('event_id')
            .eq('user_id', userId);

        const adminEventIds = (adminEntries || []).map(e => e.event_id);

        // 3. Fetch event IDs where user is the owner
        const { data: ownedEvents } = await supabase
            .from('events')
            .select('id')
            .eq('created_by', userId);

        const ownedEventIds = (ownedEvents || []).map(e => e.id);

        // 4. Combine all event IDs where user has access (owner or admin)
        const allAccessEventIds = [...new Set([...adminEventIds, ...ownedEventIds])];

        let sharedMatches: typeof ownedMatches = [];
        if (allAccessEventIds.length > 0) {
            let sharedQuery = supabase
                .from('matches')
                .select('*, events(name)')
                .in('event_id', allAccessEventIds)
                .neq('created_by', userId) // Avoid duplicates with ownedMatches
                .order('created_at', { ascending: sortOrder === 'oldest' });

            if (eventFilter) {
                sharedQuery = sharedQuery.eq('event_id', eventFilter);
            }

            const { data } = await sharedQuery;
            sharedMatches = data || [];
        }

        if (!ownedError) {
            // Merge and deduplicate
            const allMatches = [...(ownedMatches || []), ...(sharedMatches || [])];
            // Sort merged results
            allMatches.sort((a, b) => {
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
            });
            setMatches(allMatches);
        }
        setIsLoading(false);
    }, [supabase, eventFilter, sortOrder]);

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const initUser = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
                setUser(currentUser);
                fetchMatches(currentUser.id);
                fetchEvents(currentUser.id);

                // Subscribe to realtime updates for matches created by this user
                channel = supabase
                    .channel('matches-list')
                    .on(
                        'postgres_changes',
                        {
                            event: '*',
                            schema: 'public',
                            table: 'matches',
                            filter: `created_by=eq.${currentUser.id}`,
                        },
                        () => {
                            fetchMatches(currentUser.id);
                        }
                    )
                    .subscribe();
            }
        };

        initUser();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [supabase, fetchMatches]);

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
        // Status filter
        if (filter !== 'all' && match.status !== filter) return false;
        // Format filter
        if (formatFilter !== 'all' && match.format !== formatFilter) return false;
        // Event filter (local dropdown, separate from URL param)
        if (eventFilterLocal !== 'all') {
            if (eventFilterLocal === 'none' && match.event_id !== null) return false;
            if (eventFilterLocal !== 'none' && match.event_id !== eventFilterLocal) return false;
        }
        // Search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const teamMatch = match.team_a_name.toLowerCase().includes(query) || match.team_b_name.toLowerCase().includes(query);
            const eventMatch = match.events?.name?.toLowerCase().includes(query);
            return teamMatch || eventMatch;
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
                <button
                    onClick={() => setIsExportModalOpen(true)}
                    className="btn-secondary px-4 py-2 rounded-xl text-sm flex items-center gap-2"
                >
                    <FileSpreadsheet size={18} />
                    Export
                </button>
            </div>

            {/* Filters */}
            <div className="glass rounded-xl p-4 space-y-4">
                {/* Status Filter Buttons */}
                <div className="flex flex-wrap gap-2">
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

                {/* Filter Dropdowns Row */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Format Filter */}
                    <select
                        value={formatFilter}
                        onChange={(e) => setFormatFilter(e.target.value)}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500/50 cursor-pointer"
                    >
                        <option value="all" className="bg-gray-900">All Formats</option>
                        <option value="bo1" className="bg-gray-900">BO1</option>
                        <option value="bo3" className="bg-gray-900">BO3</option>
                        <option value="bo5" className="bg-gray-900">BO5</option>
                    </select>

                    {/* Event Filter */}
                    <select
                        value={eventFilterLocal}
                        onChange={(e) => setEventFilterLocal(e.target.value)}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500/50 cursor-pointer min-w-[140px]"
                    >
                        <option value="all" className="bg-gray-900">All Events</option>
                        <option value="none" className="bg-gray-900">No Event</option>
                        {events.map((event) => (
                            <option key={event.id} value={event.id} className="bg-gray-900">
                                {event.name}
                            </option>
                        ))}
                    </select>

                    {/* Sort Order */}
                    <select
                        value={sortOrder}
                        onChange={(e) => {
                            setSortOrder(e.target.value as SortOrder);
                            if (user) fetchMatches(user.id);
                        }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500/50 cursor-pointer"
                    >
                        <option value="newest" className="bg-gray-900">Newest First</option>
                        <option value="oldest" className="bg-gray-900">Oldest First</option>
                    </select>

                    <div className="flex-1" />

                    {/* Search Input */}
                    <input
                        type="text"
                        placeholder="Search teams or events..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500/50 min-w-[200px]"
                    />
                </div>
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
                            {(() => {
                                const match = matches.find(m => m.id === selectedMatchLinks.matchId);
                                const colorStyles = {
                                    red: {
                                        container: 'bg-red-500/5 border-red-500/10',
                                        label: 'text-red-400',
                                        button: 'bg-red-500/10 hover:bg-red-500/20 text-red-300',
                                    },
                                    blue: {
                                        container: 'bg-blue-500/5 border-blue-500/10',
                                        label: 'text-blue-400',
                                        button: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300',
                                    },
                                    purple: {
                                        container: 'bg-purple-500/5 border-purple-500/10',
                                        label: 'text-purple-400',
                                        button: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300',
                                    },
                                };
                                return [
                                    { label: match?.team_a_name || 'Team 1', key: 'team_a' as const, color: 'red' as const },
                                    { label: match?.team_b_name || 'Team 2', key: 'team_b' as const, color: 'blue' as const },
                                    { label: 'Observer', key: 'observer' as const, color: 'purple' as const },
                                ].map(({ label, key, color }) => {
                                    const styles = colorStyles[color];
                                    return (
                                        <div key={key} className={`p-3 ${styles.container} border rounded-lg`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`${styles.label} font-medium text-sm`}>{label}</span>
                                                <button
                                                    onClick={() => copyToClipboard(selectedMatchLinks.links[key], label)}
                                                    className={`text-xs px-2 py-1 ${styles.button} rounded`}
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            <p className="text-xs text-white/40 font-mono break-all">
                                                {selectedMatchLinks.links[key]}
                                            </p>
                                        </div>
                                    );
                                });
                            })()}
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
                            <th className="px-6 py-4 font-medium">Event</th>
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
                                    {match.events?.name ? (
                                        <span className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300 text-xs">
                                            {match.events.name}
                                        </span>
                                    ) : (
                                        <span className="text-white/30 text-sm">—</span>
                                    )}
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

            {/* Export Modal */}
            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                preselectedEventId={eventFilter}
            />
        </div>
    );
}
