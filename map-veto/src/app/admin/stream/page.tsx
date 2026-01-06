'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function StreamSettingsPage() {
    const [matchId, setMatchId] = useState('demo');
    const [bgMode, setBgMode] = useState<'dark' | 'transparent' | 'chroma'>('transparent');
    const [showBanned, setShowBanned] = useState(true);
    const [compact, setCompact] = useState(false);
    const [animate, setAnimate] = useState(true);
    const [overlayPos, setOverlayPos] = useState<'bottom' | 'top'>('bottom');

    const generateUrl = (type: 'stream' | 'overlay') => {
        const base = `/match/${matchId}/${type}`;
        const params = new URLSearchParams();
        params.set('bg', bgMode);
        if (!showBanned) params.set('banned', 'false');
        if (compact) params.set('compact', 'true');
        if (!animate) params.set('animate', 'false');
        if (type === 'overlay') params.set('pos', overlayPos);
        return `${base}?${params.toString()}`;
    };

    const copyUrl = (type: 'stream' | 'overlay') => {
        const url = `${window.location.origin}${generateUrl(type)}`;
        navigator.clipboard.writeText(url);
        alert(`${type === 'stream' ? 'Results' : 'Live overlay'} URL copied!`);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white mb-2">Stream Overlay Settings</h1>
                <p className="text-white/60">Configure OBS browser source overlays for your broadcast</p>
            </div>

            {/* Match Selection */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Match</h2>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={matchId}
                        onChange={(e) => setMatchId(e.target.value)}
                        placeholder="Match ID"
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                    />
                </div>
            </div>

            {/* Overlay Options */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Display Options</h2>

                <div className="grid grid-cols-2 gap-6">
                    {/* Background Mode */}
                    <div>
                        <label className="block text-sm text-white/60 mb-3">Background</label>
                        <div className="flex gap-2">
                            {(['dark', 'transparent', 'chroma'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setBgMode(mode)}
                                    className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${bgMode === mode
                                            ? mode === 'chroma' ? 'bg-green-500 text-black' : 'bg-purple-500 text-white'
                                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                                        }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Overlay Position */}
                    <div>
                        <label className="block text-sm text-white/60 mb-3">Live Overlay Position</label>
                        <div className="flex gap-2">
                            {(['bottom', 'top'] as const).map((pos) => (
                                <button
                                    key={pos}
                                    onClick={() => setOverlayPos(pos)}
                                    className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${overlayPos === pos
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                                        }`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Toggles */}
                    <div className="col-span-2 flex gap-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showBanned}
                                onChange={(e) => setShowBanned(e.target.checked)}
                                className="w-5 h-5 rounded bg-white/10 border-white/20"
                            />
                            <span className="text-sm text-white/70">Show banned maps</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={compact}
                                onChange={(e) => setCompact(e.target.checked)}
                                className="w-5 h-5 rounded bg-white/10 border-white/20"
                            />
                            <span className="text-sm text-white/70">Compact mode</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={animate}
                                onChange={(e) => setAnimate(e.target.checked)}
                                className="w-5 h-5 rounded bg-white/10 border-white/20"
                            />
                            <span className="text-sm text-white/70">Entrance animations</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Generated URLs */}
            <div className="glass rounded-2xl p-6 space-y-6">
                <h2 className="text-lg font-semibold text-white">OBS Browser Sources</h2>

                {/* Results Overlay */}
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-medium text-purple-400">Results Overlay (Full Screen)</h3>
                            <p className="text-xs text-white/40 mt-1">Shows final veto results with team picks and bans</p>
                        </div>
                        <div className="flex gap-2">
                            <Link
                                href={generateUrl('stream')}
                                target="_blank"
                                className="px-3 py-1.5 text-xs bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 transition-colors"
                            >
                                Preview
                            </Link>
                            <button
                                onClick={() => copyUrl('stream')}
                                className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                            >
                                Copy URL
                            </button>
                        </div>
                    </div>
                    <code className="text-xs text-white/50 font-mono break-all block p-2 bg-black/30 rounded-lg">
                        {typeof window !== 'undefined' ? window.location.origin : ''}{generateUrl('stream')}
                    </code>
                    <p className="text-xs text-white/30 mt-2">Recommended: 1920x1080</p>
                </div>

                {/* Live Overlay */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-medium text-blue-400">Live Overlay (Bottom Bar)</h3>
                            <p className="text-xs text-white/40 mt-1">Real-time veto progress bar for live broadcasts</p>
                        </div>
                        <div className="flex gap-2">
                            <Link
                                href={generateUrl('overlay')}
                                target="_blank"
                                className="px-3 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 transition-colors"
                            >
                                Preview
                            </Link>
                            <button
                                onClick={() => copyUrl('overlay')}
                                className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                            >
                                Copy URL
                            </button>
                        </div>
                    </div>
                    <code className="text-xs text-white/50 font-mono break-all block p-2 bg-black/30 rounded-lg">
                        {typeof window !== 'undefined' ? window.location.origin : ''}{generateUrl('overlay')}
                    </code>
                    <p className="text-xs text-white/30 mt-2">Recommended: 1920x200 ({overlayPos} position)</p>
                </div>
            </div>

            {/* OBS Setup Instructions */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">OBS Setup</h2>
                <ol className="space-y-3 text-sm text-white/60">
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                        <span>In OBS, add a new <strong className="text-white">Browser Source</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                        <span>Paste the URL above and set dimensions (1920x1080 for results, 1920x200 for overlay)</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                        <span>For transparent background, enable <strong className="text-white">&ldquo;Shutdown source when not visible&rdquo;</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                        <span>For chroma key, use the green background mode and apply a Chroma Key filter in OBS</span>
                    </li>
                </ol>
            </div>
        </div>
    );
}
