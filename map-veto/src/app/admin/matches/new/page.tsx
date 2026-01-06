'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface MatchFormData {
    teamAName: string;
    teamBName: string;
    teamALogo: string;
    teamBLogo: string;
    format: 'bo1' | 'bo3' | 'bo5';
    scheduledAt: string;
}

interface CreatedMatch {
    id: string;
    links: {
        team_a: { token: string; url: string };
        team_b: { token: string; url: string };
        observer: { token: string; url: string };
    };
}

export default function NewMatchPage() {
    const [formData, setFormData] = useState<MatchFormData>({
        teamAName: '',
        teamBName: '',
        teamALogo: '',
        teamBLogo: '',
        format: 'bo3',
        scheduledAt: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [createdMatch, setCreatedMatch] = useState<CreatedMatch | null>(null);
    const [isFlippingCoin, setIsFlippingCoin] = useState(false);
    const [coinFlipResult, setCoinFlipResult] = useState<'team_a' | 'team_b' | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/matches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    team_a_name: formData.teamAName,
                    team_b_name: formData.teamBName,
                    team_a_logo: formData.teamALogo || null,
                    team_b_logo: formData.teamBLogo || null,
                    format: formData.format,
                    scheduled_at: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to create match');
                setIsSubmitting(false);
                return;
            }

            setCreatedMatch({
                id: data.match.id,
                links: data.links,
            });
        } catch {
            setError('Network error. Please try again.');
        }

        setIsSubmitting(false);
    };

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert(`${label} link copied!`);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert(`${label} link copied!`);
        }
    };

    const handleCoinFlip = async () => {
        if (!createdMatch || isFlippingCoin) return;

        setIsFlippingCoin(true);
        setError('');

        try {
            const response = await fetch('/api/veto/coin-toss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ match_id: createdMatch.id }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to flip coin');
            } else {
                setCoinFlipResult(data.winner);
            }
        } catch {
            setError('Network error. Please try again.');
        }

        setIsFlippingCoin(false);
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
                        <p className="text-sm text-white/50 mb-4">
                            Share these unique links with each team. They can use them to participate in the veto.
                        </p>

                        {/* Team A Link */}
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-red-400">Team A ({formData.teamAName})</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.team_a.url, 'Team A')}
                                    className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-white/50 font-mono break-all">
                                {createdMatch.links.team_a.url}
                            </p>
                        </div>

                        {/* Team B Link */}
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-400">Team B ({formData.teamBName})</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.team_b.url, 'Team B')}
                                    className="text-xs px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-white/50 font-mono break-all">
                                {createdMatch.links.team_b.url}
                            </p>
                        </div>

                        {/* Observer Link */}
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-purple-400">Observer / Stream</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.observer.url, 'Observer')}
                                    className="text-xs px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-xs text-white/50 font-mono break-all">
                                {createdMatch.links.observer.url}
                            </p>
                        </div>
                    </div>

                    {/* Coin Flip Section */}
                    <div className="mt-8 p-6 bg-white/5 rounded-xl border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-3">Coin Toss</h3>
                        {coinFlipResult ? (
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-center py-4"
                            >
                                <p className="text-yellow-400 text-xl font-bold">
                                    🎉 {coinFlipResult === 'team_a' ? formData.teamAName : formData.teamBName} wins!
                                </p>
                                <p className="text-white/60 text-sm mt-1">They will pick first</p>
                            </motion.div>
                        ) : (
                            <div className="text-center">
                                <p className="text-white/60 text-sm mb-4">Flip the coin to determine who picks first</p>
                                <button
                                    onClick={handleCoinFlip}
                                    disabled={isFlippingCoin}
                                    className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl hover:from-yellow-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isFlippingCoin ? (
                                        <span className="flex items-center gap-2">
                                            <motion.span
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
                                            >
                                                🪙
                                            </motion.span>
                                            Flipping...
                                        </span>
                                    ) : (
                                        '🪙 Flip Coin'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 flex gap-4">
                        <button
                            onClick={() => {
                                setCreatedMatch(null);
                                setCoinFlipResult(null);
                                setFormData({
                                    teamAName: '',
                                    teamBName: '',
                                    teamALogo: '',
                                    teamBLogo: '',
                                    format: 'bo3',
                                    scheduledAt: '',
                                });
                            }}
                            className="flex-1 px-6 py-3 border border-white/20 rounded-xl text-white hover:bg-white/5 transition-colors"
                        >
                            Create Another
                        </button>
                        <a
                            href={createdMatch.links.observer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 btn-primary px-6 py-3 rounded-xl text-center"
                        >
                            Open Match (Observer)
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
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                        {error}
                    </div>
                )}

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
