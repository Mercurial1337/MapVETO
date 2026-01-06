import Link from 'next/link';

export default function AdminDashboard() {
    // Mock data - in production, fetch from Supabase
    const stats = {
        totalMatches: 24,
        activeMatches: 3,
        completedToday: 8,
        upcomingMatches: 13,
    };

    const recentMatches = [
        { id: '1', teamA: 'Team Liquid', teamB: 'Sentinels', status: 'completed', format: 'bo3' },
        { id: '2', teamA: 'Fnatic', teamB: 'DRX', status: 'in_progress', format: 'bo3' },
        { id: '3', teamA: 'NRG', teamB: '100 Thieves', status: 'pending', format: 'bo3' },
        { id: '4', teamA: 'Cloud9', teamB: 'LOUD', status: 'pending', format: 'bo5' },
    ];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">Completed</span>;
            case 'in_progress':
                return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs animate-pulse">Live</span>;
            case 'pending':
                return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs">Pending</span>;
            default:
                return null;
        }
    };

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
                    <p className="text-sm text-white/50 mb-1">Upcoming</p>
                    <p className="text-4xl font-bold text-white">{stats.upcomingMatches}</p>
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
                        href="/admin/sync"
                        className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">📊</span>
                        <span className="text-sm text-white">Sync Sheets</span>
                    </Link>
                    <Link
                        href="/admin/maps/upload"
                        className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">🖼️</span>
                        <span className="text-sm text-white">Upload Maps</span>
                    </Link>
                    <Link
                        href="/admin/tournaments/new"
                        className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-colors text-center"
                    >
                        <span className="text-2xl block mb-2">🏆</span>
                        <span className="text-sm text-white">New Tournament</span>
                    </Link>
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
                                        <span className="text-white font-medium">{match.teamA}</span>
                                        <span className="text-white/40 mx-2">vs</span>
                                        <span className="text-white font-medium">{match.teamB}</span>
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
                                                href={`/match/${match.id}`}
                                                className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                            >
                                                View
                                            </Link>
                                            <button className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                                                Links
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
