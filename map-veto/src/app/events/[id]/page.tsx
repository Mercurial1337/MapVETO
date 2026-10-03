'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface EventData {
    name: string;
    logo_url: string | null;
}

interface MatchData {
    id: string;
    team_a_name: string;
    team_b_name: string;
    format: string;
    created_at: string;
    scheduled_at: string | null;
}

export default function PublicEventPage({ params }: { params: { id: string } }) {
    const [event, setEvent] = useState<EventData | null>(null);
    const [matches, setMatches] = useState<MatchData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Pagination
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);
    const LIMIT = 10;

    useEffect(() => {
        const fetchEventMatches = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/events/${params.id}/completed-matches?offset=${offset}&limit=${LIMIT}`);
                const data = await res.json();
                
                if (!res.ok) {
                    setError(data.error || 'Failed to fetch event matches');
                } else {
                    setEvent(data.event);
                    setMatches(data.matches);
                    setTotal(data.pagination.total);
                }
            } catch (err) {
                setError('Network error');
            }
            setIsLoading(false);
        };
        
        fetchEventMatches();
    }, [params.id, offset]);

    if (isLoading && !event) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="min-h-screen flex items-center justify-center text-center">
                <div className="glass p-8 rounded-2xl max-w-md w-full">
                    <h1 className="text-xl font-bold text-red-400 mb-2">Error</h1>
                    <p className="text-white/60">{error || 'Event not found'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center py-12 px-4 max-w-3xl mx-auto">
            {/* Event Header */}
            <div className="text-center mb-12">
                {event.logo_url && (
                    <img 
                        src={event.logo_url} 
                        alt={event.name} 
                        className="w-24 h-24 object-contain mx-auto mb-4 rounded-xl bg-white/5 p-2 border border-white/10"
                    />
                )}
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{event.name}</h1>
                <p className="text-white/50 text-sm uppercase tracking-wider">Completed Matches</p>
            </div>

            {/* Matches List */}
            <div className="w-full space-y-4">
                {matches.length === 0 ? (
                    <div className="glass p-8 rounded-2xl text-center text-white/50">
                        No completed matches found for this event yet.
                    </div>
                ) : (
                    matches.map(match => (
                        <div key={match.id} className="glass p-5 rounded-2xl border border-white/10 hover:border-white/20 transition-colors flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="text-center md:text-left flex-1">
                                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                                    <span className="font-bold text-white text-lg">{match.team_a_name}</span>
                                    <span className="text-white/30 text-sm">vs</span>
                                    <span className="font-bold text-white text-lg">{match.team_b_name}</span>
                                </div>
                                <div className="text-xs text-white/40 flex items-center justify-center md:justify-start gap-2">
                                    <span>{new Date(match.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span>•</span>
                                    <span className="uppercase">{match.format}</span>
                                </div>
                            </div>
                            
                            <Link 
                                href={`/public/log/${match.id}`} 
                                className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors w-full md:w-auto text-center"
                            >
                                View Log
                            </Link>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
                <div className="flex items-center gap-4 mt-8">
                    <button 
                        onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                        disabled={offset === 0}
                        className="px-4 py-2 bg-white/5 rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-white/40 text-sm">
                        Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}
                    </span>
                    <button 
                        onClick={() => setOffset(offset + LIMIT)}
                        disabled={offset + LIMIT >= total}
                        className="px-4 py-2 bg-white/5 rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
