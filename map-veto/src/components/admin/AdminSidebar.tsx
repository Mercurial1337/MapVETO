'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { LayoutDashboard, Gamepad2, PlusCircle, Monitor, LogOut, Menu, X, Calendar } from 'lucide-react';

interface AdminSidebarProps {
    children: React.ReactNode;
}

export function AdminSidebar({ children }: AdminSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            setUser(currentUser);
        };
        getUser();
    }, [supabase]);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    const navItems = [
        { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
        { href: '/admin/matches', icon: Gamepad2, label: 'Matches' },
        { href: '/admin/events', icon: Calendar, label: 'Events' },
        { href: '/admin/matches/new', icon: PlusCircle, label: 'Create Match' },
        { href: '/admin/stream', icon: Monitor, label: 'Stream Overlay' },
    ];

    return (
        <div className="min-h-screen flex flex-col md:flex-row">
            {/* Mobile Header */}
            <header className="md:hidden flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
                <Link href="/admin" className="flex items-center gap-2">
                    <span className="text-xl font-bold text-purple-500">VETO</span>
                    <span className="text-xs text-white/40 uppercase">Admin</span>
                </Link>
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </header>

            {/* Sidebar Overlay (mobile) */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed md:static inset-y-0 left-0 z-50
                w-64 bg-black/95 md:bg-black/40 border-r border-white/10 flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Logo (desktop) */}
                <div className="hidden md:block p-6 border-b border-white/10">
                    <Link href="/admin" className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-purple-500">VETO</span>
                        <span className="text-xs text-white/40 uppercase">Admin</span>
                    </Link>
                </div>

                {/* Mobile sidebar header */}
                <div className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
                    <span className="text-lg font-bold text-purple-500">Menu</span>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="p-2 text-white/70 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4">
                    <ul className="space-y-2">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive
                                            ? 'bg-purple-500/20 text-purple-400'
                                            : 'text-white/70 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <Icon size={20} />
                                        <span>{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
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
                        <LogOut size={20} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-0">
                {/* Top Bar (desktop only) */}
                <header className="hidden md:flex h-16 border-b border-white/10 px-6 items-center justify-between bg-black/20">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold text-white">Admin Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            href={searchParams.get('event')
                                ? `/admin/matches/new?event=${searchParams.get('event')}`
                                : '/admin/matches/new'
                            }
                            className="btn-primary text-sm px-4 py-2"
                        >
                            + New Match
                        </Link>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 p-4 md:p-6 overflow-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
