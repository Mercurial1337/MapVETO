'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { VetoTemplate, VetoSequence, VetoStep } from '@/types';
import Link from 'next/link';
import Image from 'next/image';

interface Event {
    id: string;
    name: string;
    logo_url: string | null;
}

type MapPoolType = 'competitive' | 'all' | 'custom';

const COMPETITIVE_MAPS = ['Abyss', 'Bind', 'Corrode', 'Haven', 'Pearl', 'Split', 'Sunset'];
const ALL_MAPS = ['Abyss', 'Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Sunset'];

interface MatchFormData {
    teamAName: string;
    teamBName: string;
    teamALogo: string;
    teamBLogo: string;
    format: 'bo1' | 'bo3' | 'bo5';
    mapPoolType: MapPoolType;
    customMaps: string[];
    scheduledAt: string;
    eventId: string;
    templateId: string;
    isCustomSequence: boolean;
    customSequence: VetoSequence | null;
}

interface CreatedMatch {
    id: string;
    links: {
        team_a: { token: string; url: string };
        team_b: { token: string; url: string };
        observer: { token: string; url: string };
    };
}

function NewMatchContent() {
    const searchParams = useSearchParams();
    const preselectedEventId = searchParams.get('event') || '';

    const [formData, setFormData] = useState<MatchFormData>({
        teamAName: '',
        teamBName: '',
        teamALogo: '',
        teamBLogo: '',
        format: 'bo3',
        mapPoolType: 'competitive',
        customMaps: [],
        scheduledAt: '',
        eventId: preselectedEventId,
        templateId: '',
        isCustomSequence: false,
        customSequence: null,
    });

    // Sync eventId from URL if it changes (and if not already set manually)
    useEffect(() => {
        if (preselectedEventId && !formData.eventId) {
            setFormData(prev => ({ ...prev, eventId: preselectedEventId }));
        }
    }, [preselectedEventId]);
    const [events, setEvents] = useState<Event[]>([]);
    const [templates, setTemplates] = useState<VetoTemplate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [createdMatch, setCreatedMatch] = useState<CreatedMatch | null>(null);
    const [isFlippingCoin, setIsFlippingCoin] = useState(false);
    const [coinFlipResult, setCoinFlipResult] = useState<'team_a' | 'team_b' | null>(null);
    const [wasForced, setWasForced] = useState(false);

    // Fetch events on mount
    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const response = await fetch('/api/events');
                if (response.ok) {
                    const data = await response.json();
                    setEvents(data.events || []);
                }
            } catch (err) {
                console.error('Error fetching events:', err);
            }
        };
        fetchEvents();
    }, []);

    // Fetch templates when format changes
    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const response = await fetch(`/api/templates?format=${formData.format}`);
                if (response.ok) {
                    const data = await response.json();
                    setTemplates(data.templates || []);
                    // Auto-select first/default template
                    const defaultTemplate = data.templates?.find((t: VetoTemplate) => t.is_default) || data.templates?.[0];
                    if (defaultTemplate) {
                        setFormData(prev => ({
                            ...prev,
                            templateId: defaultTemplate.id,
                            customSequence: prev.isCustomSequence ? prev.customSequence : defaultTemplate.sequence
                        }));
                    }
                }
            } catch (err) {
                console.error('Error fetching templates:', err);
            }
        };
        fetchTemplates();
    }, [formData.format]);

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
                    map_pool_type: formData.mapPoolType,
                    custom_maps: formData.mapPoolType === 'custom' ? formData.customMaps : null,
                    scheduled_at: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null,
                    event_id: formData.eventId || null,
                    template_id: formData.templateId,
                    custom_veto_sequence: formData.isCustomSequence ? formData.customSequence : null,
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

    const updateSequenceStep = (index: number, updates: Partial<VetoStep>) => {
        if (!formData.customSequence) return;
        const newSteps = [...formData.customSequence.steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        setFormData({
            ...formData,
            customSequence: {
                ...formData.customSequence,
                steps: newSteps,
                total_steps: newSteps.length
            }
        });
    };

    const addSequenceStep = () => {
        if (!formData.customSequence) return;
        const lastStep = formData.customSequence.steps[formData.customSequence.steps.length - 1];
        const newStep: VetoStep = {
            step: (lastStep?.step || 0) + 1,
            action: 'ban',
            actor: 'team_a',
            description: 'Custom step'
        };
        const newSteps = [...formData.customSequence.steps, newStep];
        setFormData({
            ...formData,
            customSequence: {
                ...formData.customSequence,
                steps: newSteps,
                total_steps: newSteps.length
            }
        });
    };

    const removeSequenceStep = (index: number) => {
        if (!formData.customSequence) return;
        const newSteps = formData.customSequence.steps.filter((_, i) => i !== index)
            .map((step, i) => ({ ...step, step: i + 1 })); // Re-index
        setFormData({
            ...formData,
            customSequence: {
                ...formData.customSequence,
                steps: newSteps,
                total_steps: newSteps.length
            }
        });
    };

    const handleCoinFlip = async (forcedWinner?: 'team_a' | 'team_b') => {
        if (!createdMatch || isFlippingCoin) return;

        setIsFlippingCoin(true);
        setError('');

        try {
            const response = await fetch('/api/veto/coin-toss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    match_id: createdMatch.id,
                    forced_winner: forcedWinner,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to flip coin');
            } else {
                setCoinFlipResult(data.winner);
                setWasForced(!!forcedWinner);
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
                            <span className="text-3xl text-green-400">✓</span>
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
                                <span className="text-sm font-medium text-red-400">{formData.teamAName}</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.team_a.url, formData.teamAName)}
                                    className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Team B Link */}
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-400">{formData.teamBName}</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.team_b.url, formData.teamBName)}
                                    className="text-xs px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Observer Link */}
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-purple-400">Observer</span>
                                <button
                                    onClick={() => copyToClipboard(createdMatch.links.observer.url, 'Observer')}
                                    className="text-xs px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
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
                                    {coinFlipResult === 'team_a' ? formData.teamAName : formData.teamBName} wins!
                                </p>
                                <p className="text-white/60 text-sm mt-1">
                                    {wasForced ? 'Admin selected winner' : 'They will pick first'}
                                </p>
                            </motion.div>
                        ) : isFlippingCoin ? (
                            <div className="text-center py-4">
                                <motion.span
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
                                    className="text-4xl inline-block"
                                >
                                    🪙
                                </motion.span>
                                <p className="text-white/60 mt-2">Flipping...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Random Coin Flip */}
                                <div className="text-center">
                                    <p className="text-white/60 text-sm mb-3">Flip the coin to determine who picks first</p>
                                    <button
                                        onClick={() => handleCoinFlip()}
                                        className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl hover:from-yellow-400 hover:to-orange-400 transition-all"
                                    >
                                        Flip Coin
                                    </button>
                                </div>

                                {/* Divider */}
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-px bg-white/10" />
                                    <span className="text-white/30 text-xs">or select winner (seeded match)</span>
                                    <div className="flex-1 h-px bg-white/10" />
                                </div>

                                {/* Manual Selection Buttons */}
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => handleCoinFlip('team_a')}
                                        className="px-6 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 font-medium transition-colors"
                                    >
                                        {formData.teamAName}
                                    </button>
                                    <button
                                        onClick={() => handleCoinFlip('team_b')}
                                        className="px-6 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-400 font-medium transition-colors"
                                    >
                                        {formData.teamBName}
                                    </button>
                                </div>
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
                                    mapPoolType: 'competitive',
                                    customMaps: [],
                                    scheduledAt: '',
                                    eventId: '',
                                    templateId: '',
                                    isCustomSequence: false,
                                    customSequence: null,
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
                        <h3 className="text-sm font-medium text-red-400 uppercase tracking-wider">Team 1</h3>
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
                            <label className="block text-sm text-white/60 mb-2">Team Logo (Optional)</label>
                            <div className="flex items-center gap-3">
                                {formData.teamALogo && (
                                    <img src={formData.teamALogo} alt="Team A" className="w-12 h-12 rounded-lg object-cover bg-white/10" />
                                )}
                                <label className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/50 cursor-pointer hover:bg-white/10 transition-colors text-center">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = () => setFormData({ ...formData, teamALogo: reader.result as string });
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    {formData.teamALogo ? 'Change Logo' : 'Upload Logo'}
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Team B */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-blue-400 uppercase tracking-wider">Team 2</h3>
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
                            <label className="block text-sm text-white/60 mb-2">Team Logo (Optional)</label>
                            <div className="flex items-center gap-3">
                                {formData.teamBLogo && (
                                    <img src={formData.teamBLogo} alt="Team B" className="w-12 h-12 rounded-lg object-cover bg-white/10" />
                                )}
                                <label className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/50 cursor-pointer hover:bg-white/10 transition-colors text-center">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = () => setFormData({ ...formData, teamBLogo: reader.result as string });
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    {formData.teamBLogo ? 'Change Logo' : 'Upload Logo'}
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Match Settings */}
                <div className="border-t border-white/10 pt-6 space-y-4">
                    <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Match Settings</h3>

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

                    {/* Event Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm text-white/60">Event (Optional)</label>
                            <Link href="/admin/events/new" className="text-xs text-purple-400 hover:text-purple-300">
                                + Create Event
                            </Link>
                        </div>
                        <select
                            value={formData.eventId}
                            onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                        >
                            <option value="">No Event (Standalone Match)</option>
                            {events.map((event) => (
                                <option key={event.id} value={event.id}>
                                    {event.name}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-white/40 mt-1">
                            Assign to an event to use custom branding (logo, coin, font)
                        </p>
                    </div>

                    {/* Map Pool Selection */}
                    <div className="border-t border-white/10 pt-6">
                        <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Map Pool</h3>
                        <p className="text-xs text-white/40 mb-4">
                            Select which maps will be available for the veto process
                        </p>

                        {/* Pool Type Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {/* Competitive Maps */}
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, mapPoolType: 'competitive', customMaps: [] })}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${formData.mapPoolType === 'competitive'
                                    ? 'border-cyan-500 bg-cyan-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/30'
                                    }`}
                            >
                                <h4 className={`font-semibold mb-1 ${formData.mapPoolType === 'competitive' ? 'text-cyan-400' : 'text-white'}`}>
                                    Competitive Maps
                                </h4>
                                <p className="text-xs text-white/50 mb-2">7 maps</p>
                                <p className="text-xs text-white/40">
                                    {COMPETITIVE_MAPS.join(', ')}
                                </p>
                            </button>

                            {/* All Maps */}
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, mapPoolType: 'all', customMaps: [] })}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${formData.mapPoolType === 'all'
                                    ? 'border-cyan-500 bg-cyan-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/30'
                                    }`}
                            >
                                <h4 className={`font-semibold mb-1 ${formData.mapPoolType === 'all' ? 'text-cyan-400' : 'text-white'}`}>
                                    All Maps
                                </h4>
                                <p className="text-xs text-white/50 mb-2">12 maps</p>
                                <p className="text-xs text-white/40">
                                    All available maps including retired
                                </p>
                            </button>

                            {/* Custom */}
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, mapPoolType: 'custom', customMaps: formData.customMaps.length > 0 ? formData.customMaps : [...COMPETITIVE_MAPS] })}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${formData.mapPoolType === 'custom'
                                    ? 'border-cyan-500 bg-cyan-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/30'
                                    }`}
                            >
                                <h4 className={`font-semibold mb-1 ${formData.mapPoolType === 'custom' ? 'text-cyan-400' : 'text-white'}`}>
                                    Custom Map Pool
                                </h4>
                                <p className="text-xs text-white/50 mb-2">
                                    {formData.mapPoolType === 'custom' ? `${formData.customMaps.length} maps` : 'Your selection'}
                                </p>
                                <p className="text-xs text-white/40">
                                    Choose exactly which maps to include
                                </p>
                            </button>
                        </div>

                        {/* Custom Map Selector */}
                        {formData.mapPoolType === 'custom' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm text-white/60">Select maps for this match</p>
                                        <span className="text-xs text-cyan-400">{formData.customMaps.length} selected</span>
                                    </div>
                                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                                        {ALL_MAPS.map((mapName) => {
                                            const isSelected = formData.customMaps.includes(mapName);
                                            return (
                                                <button
                                                    key={mapName}
                                                    type="button"
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setFormData({
                                                                ...formData,
                                                                customMaps: formData.customMaps.filter(m => m !== mapName)
                                                            });
                                                        } else {
                                                            setFormData({
                                                                ...formData,
                                                                customMaps: [...formData.customMaps, mapName]
                                                            });
                                                        }
                                                    }}
                                                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${isSelected
                                                        ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                                                        : 'border-transparent opacity-50 grayscale hover:opacity-75 hover:grayscale-0'
                                                        }`}
                                                >
                                                    <Image
                                                        src={`/maps/valorant/${mapName}.webp`}
                                                        alt={mapName}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                                                    <span className={`absolute bottom-1 left-2 text-xs font-medium ${isSelected ? 'text-cyan-400' : 'text-white/80'}`}>
                                                        {mapName}
                                                    </span>
                                                    {isSelected && (
                                                        <div className="absolute top-1 right-1 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
                                                            <span className="text-white text-xs">✓</span>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {formData.customMaps.length < 3 && (
                                        <p className="text-xs text-yellow-400 mt-3">
                                            ⚠ Select at least 3 maps for a proper veto
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </div>
                    {/* Veto Sequence */}
                    <div className="border-t border-white/10 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Veto Order</h3>
                                <p className="text-xs text-white/40 mt-1">
                                    Choose the ban/pick sequence for this match
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, isCustomSequence: !formData.isCustomSequence })}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${formData.isCustomSequence
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                                    }`}
                            >
                                {formData.isCustomSequence ? '✓ Custom Mode' : 'Customize Order'}
                            </button>
                        </div>

                        <div className="space-y-4">
                            {!formData.isCustomSequence ? (
                                <select
                                    value={formData.templateId}
                                    onChange={(e) => {
                                        const template = templates.find(t => t.id === e.target.value);
                                        setFormData({
                                            ...formData,
                                            templateId: e.target.value,
                                            customSequence: template?.sequence || null
                                        });
                                    }}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                                >
                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.name} {template.is_default ? '(Default)' : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="space-y-3">
                                    {formData.customSequence?.steps.map((step, index) => (
                                        <div key={index} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                                            <span className="w-6 h-6 flex items-center justify-center bg-white/10 rounded text-[10px] font-bold text-white/40">
                                                {index + 1}
                                            </span>

                                            <select
                                                value={step.action}
                                                onChange={(e) => updateSequenceStep(index, { action: e.target.value as any })}
                                                className="bg-transparent text-sm text-cyan-400 font-semibold focus:outline-none"
                                            >
                                                <option value="ban" className="bg-slate-900">Ban</option>
                                                <option value="pick" className="bg-slate-900">Pick Map</option>
                                                <option value="side" className="bg-slate-900">Pick Side</option>
                                                <option value="decider" className="bg-slate-900">Decider</option>
                                            </select>

                                            <span className="text-white/40 text-xs">:</span>

                                            <select
                                                value={step.actor}
                                                onChange={(e) => updateSequenceStep(index, { actor: e.target.value as any })}
                                                className="bg-transparent text-sm text-white/80 focus:outline-none"
                                            >
                                                <option value="team_a" className="bg-slate-900">Team A</option>
                                                <option value="team_b" className="bg-slate-900">Team B</option>
                                                <option value="system" className="bg-slate-900">System (Auto)</option>
                                            </select>

                                            {['pick', 'side'].includes(step.action) && (
                                                <div className="flex items-center gap-2 ml-auto">
                                                    <span className="text-[10px] text-white/30 uppercase">Map #</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="5"
                                                        value={step.map_number || 1}
                                                        onChange={(e) => updateSequenceStep(index, { map_number: parseInt(e.target.value) })}
                                                        className="w-10 bg-white/10 rounded text-center text-xs text-white"
                                                    />
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => removeSequenceStep(index)}
                                                className="p-1.5 text-white/20 hover:text-red-500 transition-colors ml-auto"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={addSequenceStep}
                                        className="w-full py-2 border-2 border-dashed border-white/10 rounded-xl text-xs text-white/40 hover:border-white/20 hover:text-white/60 transition-all"
                                    >
                                        + Add Veto Step
                                    </button>
                                </div>
                            )}
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

export default function NewMatchPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-20">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        }>
            <NewMatchContent />
        </Suspense>
    );
}
