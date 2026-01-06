'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { GameMap, VetoStep } from '@/types';

// Mock data for demonstration
const MOCK_MAPS: GameMap[] = [
    { id: '1', game_id: 'val', name: 'Abyss', slug: 'abyss', image_url: '/maps/valorant/Abyss.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '2', game_id: 'val', name: 'Bind', slug: 'bind', image_url: '/maps/valorant/Bind.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '3', game_id: 'val', name: 'Haven', slug: 'haven', image_url: '/maps/valorant/Haven.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '4', game_id: 'val', name: 'Pearl', slug: 'pearl', image_url: '/maps/valorant/Pearl.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '5', game_id: 'val', name: 'Corrode', slug: 'corrode', image_url: '/maps/valorant/Corrode.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '6', game_id: 'val', name: 'Split', slug: 'split', image_url: '/maps/valorant/Split.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '7', game_id: 'val', name: 'Sunset', slug: 'sunset', image_url: '/maps/valorant/Sunset.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
];

// Demo veto results
const DEMO_RESULTS = {
    teamA: 'Fnatic',
    teamB: 'Sentinels',
    maps: [
        { map: MOCK_MAPS[2], pickedBy: 'team_a', side: 'attack' as const, mapNumber: 1 },
        { map: MOCK_MAPS[4], pickedBy: 'team_b', side: 'defense' as const, mapNumber: 2 },
        { map: MOCK_MAPS[5], pickedBy: 'system', side: 'attack' as const, mapNumber: 3 },
    ],
    banned: [
        { map: MOCK_MAPS[0], bannedBy: 'team_a' },
        { map: MOCK_MAPS[1], bannedBy: 'team_b' },
        { map: MOCK_MAPS[3], bannedBy: 'team_a' },
        { map: MOCK_MAPS[6], bannedBy: 'team_b' },
    ],
    isComplete: true,
};

type BackgroundMode = 'dark' | 'transparent' | 'chroma';

function StreamOverlayContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const matchId = params.id as string;

    // Stream options from URL params
    const bgMode = (searchParams.get('bg') || 'dark') as BackgroundMode;
    const showBanned = searchParams.get('banned') !== 'false';
    const compact = searchParams.get('compact') === 'true';
    const animateIn = searchParams.get('animate') !== 'false';

    const [isRevealed, setIsRevealed] = useState(!animateIn);

    useEffect(() => {
        if (animateIn) {
            const timer = setTimeout(() => setIsRevealed(true), 500);
            return () => clearTimeout(timer);
        }
    }, [animateIn]);

    const bgClass = {
        dark: 'bg-[#0a0a0f]',
        transparent: 'bg-transparent',
        chroma: 'bg-[#00ff00]',
    }[bgMode];

    return (
        <div className={`min-h-screen ${bgClass} p-8 overflow-hidden`}>
            {/* Stream Controls Info (only visible in dark mode) */}
            {bgMode === 'dark' && (
                <div className="absolute top-4 right-4 text-xs text-white/30 space-y-1">
                    <div>?bg=transparent | chroma | dark</div>
                    <div>?banned=false (hide banned)</div>
                    <div>?compact=true (smaller)</div>
                    <div>?animate=false (no entrance)</div>
                </div>
            )}

            {/* Main Container */}
            <motion.div
                initial={animateIn ? { opacity: 0, y: 30 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="max-w-5xl mx-auto"
            >
                {/* Header with Teams */}
                <motion.div
                    initial={animateIn ? { opacity: 0, scale: 0.95 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="flex items-center justify-center gap-8 mb-8"
                >
                    {/* Team A */}
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-500/30 to-red-600/20 border border-red-500/40 flex items-center justify-center">
                            <span className="text-2xl font-bold text-red-400">F</span>
                        </div>
                        <div className="text-right">
                            <h2 className="text-2xl font-bold text-white">{DEMO_RESULTS.teamA}</h2>
                            <span className="text-xs text-red-400/70 uppercase tracking-wider">Team A</span>
                        </div>
                    </div>

                    <div className="text-3xl font-light text-white/20">VS</div>

                    {/* Team B */}
                    <div className="flex items-center gap-4">
                        <div className="text-left">
                            <h2 className="text-2xl font-bold text-white">{DEMO_RESULTS.teamB}</h2>
                            <span className="text-xs text-blue-400/70 uppercase tracking-wider">Team B</span>
                        </div>
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-600/20 border border-blue-500/40 flex items-center justify-center">
                            <span className="text-2xl font-bold text-blue-400">S</span>
                        </div>
                    </div>
                </motion.div>

                {/* Veto Results Title */}
                <motion.div
                    initial={animateIn ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                    className="text-center mb-6"
                >
                    <h1 className="text-lg font-semibold text-white/60 uppercase tracking-[0.3em]">
                        Map Veto Results
                    </h1>
                </motion.div>

                {/* Picked Maps */}
                <div className={`grid ${compact ? 'grid-cols-3 gap-4' : 'grid-cols-3 gap-6'} mb-8`}>
                    {DEMO_RESULTS.maps.map((result, index) => (
                        <motion.div
                            key={result.map.id}
                            initial={animateIn ? { opacity: 0, y: 20, scale: 0.9 } : false}
                            animate={isRevealed ? { opacity: 1, y: 0, scale: 1 } : {}}
                            transition={{ delay: 0.5 + index * 0.2, duration: 0.5, ease: 'backOut' }}
                            className="relative group"
                        >
                            {/* Map Card */}
                            <div
                                className={`relative overflow-hidden rounded-2xl border-2 ${compact ? 'aspect-[16/10]' : 'aspect-video'}`}
                                style={{
                                    borderColor: result.pickedBy === 'team_a' ? '#ef4444' : result.pickedBy === 'team_b' ? '#3b82f6' : '#8b5cf6',
                                    boxShadow: `0 0 30px ${result.pickedBy === 'team_a' ? 'rgba(239,68,68,0.3)' : result.pickedBy === 'team_b' ? 'rgba(59,130,246,0.3)' : 'rgba(139,92,246,0.3)'}`,
                                }}
                            >
                                <Image
                                    src={result.map.image_url}
                                    alt={result.map.name}
                                    fill
                                    className="object-cover"
                                />

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                                {/* Map Number Badge */}
                                <div
                                    className="absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                    style={{
                                        backgroundColor: result.pickedBy === 'team_a' ? '#ef4444' : result.pickedBy === 'team_b' ? '#3b82f6' : '#8b5cf6',
                                    }}
                                >
                                    {result.mapNumber}
                                </div>

                                {/* Side Badge */}
                                <div
                                    className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold uppercase ${result.side === 'attack'
                                        ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                                        : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                        }`}
                                >
                                    {result.side}
                                </div>

                                {/* Map Info */}
                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                    <h3 className="text-xl font-bold text-white mb-1">{result.map.name}</h3>
                                    <p className="text-xs text-white/60">
                                        {result.pickedBy === 'team_a' ? DEMO_RESULTS.teamA : result.pickedBy === 'team_b' ? DEMO_RESULTS.teamB : 'Decider'} pick
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Banned Maps */}
                <AnimatePresence>
                    {showBanned && (
                        <motion.div
                            initial={animateIn ? { opacity: 0, y: 20 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ delay: 1.2, duration: 0.4 }}
                        >
                            <div className="text-center mb-4">
                                <span className="text-xs text-white/40 uppercase tracking-wider">Banned Maps</span>
                            </div>
                            <div className="flex justify-center gap-3">
                                {DEMO_RESULTS.banned.map((ban, index) => (
                                    <motion.div
                                        key={ban.map.id}
                                        initial={animateIn ? { opacity: 0, scale: 0.8 } : false}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 1.3 + index * 0.1, duration: 0.3 }}
                                        className="relative w-24 aspect-video rounded-lg overflow-hidden opacity-50 grayscale"
                                    >
                                        <Image
                                            src={ban.map.image_url}
                                            alt={ban.map.name}
                                            fill
                                            className="object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <div className="w-8 h-8 rounded-full border-2 border-red-500/80 flex items-center justify-center">
                                                <div className="w-6 h-0.5 bg-red-500/80 rotate-45" />
                                            </div>
                                        </div>
                                        <div className="absolute bottom-1 left-1 right-1 text-center">
                                            <span className="text-[10px] text-white/60">{ban.map.name}</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Branding */}
                <motion.div
                    initial={animateIn ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5, duration: 0.4 }}
                    className="mt-8 text-center"
                >
                    <span className="text-xs text-white/20 uppercase tracking-[0.5em]">Map Veto</span>
                </motion.div>
            </motion.div>
        </div>
    );
}

export default function StreamPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 border-2 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        }>
            <StreamOverlayContent />
        </Suspense>
    );
}
