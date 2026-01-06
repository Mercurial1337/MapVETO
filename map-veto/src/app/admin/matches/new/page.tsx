'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface MatchFormData {
    teamAName: string;
    teamBName: string;
    teamALogo: string;
    teamBLogo: string;
    format: 'bo1' | 'bo3' | 'bo5';
    tournamentId: string;
    scheduledAt: string;
}

export default function NewMatchPage() {
    const [formData, setFormData] = useState<MatchFormData>({
        teamAName: '',
        teamBName: '',
        teamALogo: '',
        teamBLogo: '',
        format: 'bo3',
        tournamentId: '',
        scheduledAt: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createdMatch, setCreatedMatch] = useState<{
        id: string;
        links: { team_a: string; team_b: string; observer: string };
    } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Simulate API call - in production, this would call /api/matches/create
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mock response
        const mockMatchId = crypto.randomUUID();
        setCreatedMatch({
            id: mockMatchId,
            links: {
                team_a: `${window.location.origin}/match/${mockMatchId}?token=${crypto.randomUUID()}`,
                team_b: `${window.location.origin}/match/${mockMatchId}?token=${crypto.randomUUID()}`,
                observer: `${window.location.origin}/match/${mockMatchId}?token=${crypto.randomUUID()}`,
            },
        });

        setIsSubmitting(false);
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        // In production, show a toast notification
        alert(`${label} link copied!`);
    };

    if (createdMatch) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto"
            >
                <div className="glass rounded-2xl p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-4xl">✓</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Match Created!</h1>
                        <p className="text-white/60">
                            {formData.teamAName} vs {formData.teamBName}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white mb-4">Magic Links</h2>

                        {/* Team A Link */}
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-red-400">Team A ({formData.teamAName})</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.team_a, 'Team A')}
                                    className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-white/50 font-mono break-all">
                                {createdMatch.links.team_a}
                            </p>
                        </div>

                        {/* Team B Link */}
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-400">Team B ({formData.teamBName})</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.team_b, 'Team B')}
                                    className="text-xs px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-white/50 font-mono break-all">
                                {createdMatch.links.team_b}
                            </p>
                        </div>

                        {/* Observer Link */}
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-purple-400">Observer / Stream</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.observer, 'Observer')}
                                    className="text-xs px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-white/50 font-mono break-all">
                                {createdMatch.links.observer}
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 flex gap-4">
                        <button
                            onClick={() => setCreatedMatch(null)}
                            className="flex-1 px-6 py-3 border border-white/20 rounded-xl text-white hover:bg-white/5 transition-colors"
                        >
                            Create Another
                        </button>
                        <a
                            href={`/match/${createdMatch.id}`}
                            target="_blank"
                            className="flex-1 btn-primary px-6 py-3 rounded-xl text-center"
                        >
                            Open Match
                        </a>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">Create New Match</h1>

            <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-6">
                {/* Teams Section */}
                <div className="grid grid-cols-2 gap-6">
                    {/* Team A */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-red-400 uppercase tracking-wider">Team A</h3>
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Team Name *</label>
                            <input
                                type="text"
                                required
                                value={formData.teamAName}
                                onChange={(e) => setFormData({ ...formData, teamAName: e.target.value })}
                                placeholder="e.g. Fnatic"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Logo URL</label>
                            <input
                                type="url"
                                value={formData.teamALogo}
                                onChange={(e) => setFormData({ ...formData, teamALogo: e.target.value })}
                                placeholder="https://..."
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
                            />
                        </div>
                    </div>

                    {/* Team B */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-blue-400 uppercase tracking-wider">Team B</h3>
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Team Name *</label>
                            <input
                                type="text"
                                required
                                value={formData.teamBName}
                                onChange={(e) => setFormData({ ...formData, teamBName: e.target.value })}
                                placeholder="e.g. Sentinels"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Logo URL</label>
                            <input
                                type="url"
                                value={formData.teamBLogo}
                                onChange={(e) => setFormData({ ...formData, teamBLogo: e.target.value })}
                                placeholder="https://..."
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                            />
                        </div>
                    </div>
                </div>

                {/* Match Settings */}
                <div className="border-t border-white/10 pt-6 space-y-4">
                    <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Match Settings</h3>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Format *</label>
                            <select
                                value={formData.format}
                                onChange={(e) => setFormData({ ...formData, format: e.target.value as 'bo1' | 'bo3' | 'bo5' })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                            >
                                <option value="bo1">Best of 1</option>
                                <option value="bo3">Best of 3 (Default)</option>
                                <option value="bo5">Best of 5</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-white/60 mb-2">Scheduled Time</label>
                            <input
                                type="datetime-local"
                                value={formData.scheduledAt}
                                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                            />
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="border-t border-white/10 pt-6">
                    <button
                        type="submit"
                        disabled={isSubmitting || !formData.teamAName || !formData.teamBName}
                        className="w-full btn-primary py-4 rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <motion.span
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block"
                                />
                                Creating Match...
                            </span>
                        ) : (
                            'Create Match & Generate Links'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
