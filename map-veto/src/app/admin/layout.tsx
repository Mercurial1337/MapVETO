'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const supabase = createClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            setUser(currentUser);
        };
        getUser();
    }, [supabase]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="w-64 bg-black/40 border-r border-white/10 flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-white/10">
                    <Link href="/admin" className="flex items-center gap-2">
                        <span className="text-2xl font-bold gradient-text">VETO</span>
                        <span className="text-xs text-white/40 uppercase">Admin</span>
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4">
                    <ul className="space-y-2">
                        <li>
                            <Link
                                href="/admin"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <span>📊</span>
                                <span>Dashboard</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/matches"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <span>🎮</span>
                                <span>Matches</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/matches/new"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <span>➕</span>
                                <span>Create Match</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/stream"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <span>📺</span>
                                <span>Stream Overlay</span>
                            </Link>
                        </li>
                    </ul>
                </nav>

                {/* User Section */}
                <div className="p-4 border-t border-white/10">
                    {user && (
                        <div className="px-4 py-2 mb-2">
                            <p className="text-xs text-white/40">Signed in as</p>
                            <p className="text-sm text-white/70 truncate">{user.email}</p>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-red-500/10 transition-colors"
                    >
                        <span>🚪</span>
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                {/* Top Bar */}
                <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold text-white">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/admin/matches/new" className="btn-primary text-sm px-4 py-2">
                            + New Match
                        </Link>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 p-6 overflow-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
