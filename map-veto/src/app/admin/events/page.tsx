'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { Plus, Pencil, Trash2, Image as ImageIcon, Eye } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Event {
    id: string;
    name: string;
    logo_url: string | null;
    coin_image_url: string | null;
    custom_font_url: string | null;
    custom_font_name: string | null;
    is_active: boolean;
    created_at: string;
    matches: { count: number }[];
}

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const supabase = createClient();

    const fetchEvents = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/events');
            if (response.ok) {
                const data = await response.json();
                setEvents(data.events || []);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        const initUser = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
                setUser(currentUser);
                fetchEvents();
            }
        };
        initUser();
    }, [supabase, fetchEvents]);

    const handleDelete = async (eventId: string) => {
        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setEvents(events.filter(e => e.id !== eventId));
                setDeleteConfirm(null);
            }
        } catch (error) {
            console.error('Error deleting event:', error);
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Events</h1>
                <Link href="/admin/events/new" className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                    <Plus size={18} />
                    New Event
                </Link>
            </div>

            <p className="text-white/50 text-sm">
                Create events to group matches with custom branding (logo, coin design, font).
            </p>

            {events.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ImageIcon size={32} className="text-purple-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">No Events Yet</h2>
                    <p className="text-white/50 mb-6">Create your first event to start branding your matches.</p>
                    <Link href="/admin/events/new" className="btn-primary px-6 py-3 rounded-xl inline-flex items-center gap-2">
                        <Plus size={18} />
                        Create Your First Event
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.map((event) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass rounded-xl p-5 relative group"
                        >
                            {/* Logo Preview */}
                            <div className="h-12 mb-4 flex items-center">
                                {event.logo_url ? (
                                    <img
                                        src={event.logo_url}
                                        alt={event.name}
                                        className="h-full object-contain"
                                    />
                                ) : (
                                    <div className="h-full w-32 bg-white/5 rounded flex items-center justify-center">
                                        <ImageIcon size={20} className="text-white/30" />
                                    </div>
                                )}
                            </div>

                            {/* Event Name */}
                            <h3 className="text-lg font-semibold text-white mb-1">{event.name}</h3>

                            {/* Stats */}
                            <p className="text-sm text-white/50 mb-4">
                                {event.matches?.[0]?.count || 0} matches
                            </p>

                            {/* Branding Status */}
                            <div className="flex gap-2 mb-4">
                                <span className={`text-xs px-2 py-1 rounded ${event.logo_url ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                                    Logo
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${event.coin_image_url ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                                    Coin
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${event.custom_font_url ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                                    Font
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <Link
                                    href={`/admin/matches?event=${event.id}`}
                                    className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-sm text-purple-400 flex items-center gap-1 transition-colors"
                                    title="View matches in this event"
                                >
                                    <Eye size={14} />
                                    {event.matches?.[0]?.count || 0}
                                </Link>
                                <Link
                                    href={`/admin/events/${event.id}/edit`}
                                    className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Pencil size={14} />
                                    Edit
                                </Link>
                                {deleteConfirm === event.id ? (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleDelete(event.id)}
                                            className="px-3 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-sm text-white transition-colors"
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(null)}
                                            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setDeleteConfirm(event.id)}
                                        className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
