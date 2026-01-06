'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import type { GameMap, VetoStep, VetoActor } from '@/types';

// Mock maps for demo
const MOCK_MAPS: GameMap[] = [
    { id: '1', game_id: 'val', name: 'Abyss', slug: 'abyss', image_url: '/maps/valorant/Abyss.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '2', game_id: 'val', name: 'Bind', slug: 'bind', image_url: '/maps/valorant/Bind.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '3', game_id: 'val', name: 'Haven', slug: 'haven', image_url: '/maps/valorant/Haven.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '4', game_id: 'val', name: 'Pearl', slug: 'pearl', image_url: '/maps/valorant/Pearl.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '5', game_id: 'val', name: 'Corrode', slug: 'corrode', image_url: '/maps/valorant/Corrode.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '6', game_id: 'val', name: 'Split', slug: 'split', image_url: '/maps/valorant/Split.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
    { id: '7', game_id: 'val', name: 'Sunset', slug: 'sunset', image_url: '/maps/valorant/Sunset.webp', callout_image_url: null, is_active: true, metadata: {}, created_at: '' },
];

// Simulated live veto state for demo
const useLiveVetoSimulation = () => {
    const [step, setStep] = useState(0);
    const [banned, setBanned] = useState<{ mapId: string; actor: VetoActor }[]>([]);
    const [picked, setPicked] = useState<{ mapId: string; actor: VetoActor; side?: 'attack' | 'defense'; mapNumber: number }[]>([]);
    const [currentAction, setCurrentAction] = useState<{ action: string; actor: VetoActor } | null>(null);
    const [isComplete, setIsComplete] = useState(false);

    const sequence = [
        { action: 'ban', actor: 'team_a' as VetoActor, mapId: '1', delay: 2000 },
        { action: 'ban', actor: 'team_b' as VetoActor, mapId: '2', delay: 2500 },
        { action: 'pick', actor: 'team_a' as VetoActor, mapId: '3', mapNumber: 1, delay: 3000 },
        { action: 'side', actor: 'team_b' as VetoActor, mapId: '3', side: 'defense' as const, delay: 1500 },
        { action: 'pick', actor: 'team_b' as VetoActor, mapId: '5', mapNumber: 2, delay: 2500 },
        { action: 'side', actor: 'team_a' as VetoActor, mapId: '5', side: 'attack' as const, delay: 1500 },
        { action: 'ban', actor: 'team_a' as VetoActor, mapId: '4', delay: 2000 },
        { action: 'ban', actor: 'team_b' as VetoActor, mapId: '7', delay: 2000 },
        { action: 'decider', actor: 'system' as VetoActor, mapId: '6', mapNumber: 3, delay: 1000 },
        { action: 'side', actor: 'team_a' as VetoActor, mapId: '6', side: 'attack' as const, delay: 1500 },
    ];

    useEffect(() => {
        if (step >= sequence.length) {
            setIsComplete(true);
            setCurrentAction(null);
            return;
        }

        const currentSeq = sequence[step];
        setCurrentAction({ action: currentSeq.action, actor: currentSeq.actor });

        const timer = setTimeout(() => {
            if (currentSeq.action === 'ban') {
                setBanned(prev => [...prev, { mapId: currentSeq.mapId, actor: currentSeq.actor }]);
            } else if (currentSeq.action === 'pick' || currentSeq.action === 'decider') {
                setPicked(prev => [...prev, {
                    mapId: currentSeq.mapId,
                    actor: currentSeq.actor,
                    mapNumber: currentSeq.mapNumber!
                }]);
            } else if (currentSeq.action === 'side') {
                setPicked(prev => prev.map(p =>
                    p.mapId === currentSeq.mapId
                        ? { ...p, side: currentSeq.side }
                        : p
                ));
            }
            setStep(s => s + 1);
        }, currentSeq.delay);

        return () => clearTimeout(timer);
    }, [step]);

    return { step, banned, picked, currentAction, isComplete, totalSteps: sequence.length };
};

function LiveOverlayContent() {
    const params = useParams();
    const searchParams = useSearchParams();

    const bgMode = (searchParams.get('bg') || 'dark') as 'dark' | 'transparent' | 'chroma';
    const position = searchParams.get('pos') || 'bottom'; // bottom, top, left, right

    const { step, banned, picked, currentAction, isComplete, totalSteps } = useLiveVetoSimulation();

    const teamA = 'Fnatic';
    const teamB = 'Sentinels';

    const bgClass = {
        dark: 'bg-[#0a0a0f]/95',
        transparent: 'bg-transparent',
        chroma: 'bg-[#00ff00]',
    }[bgMode];

    const getMapById = (id: string) => MOCK_MAPS.find(m => m.id === id);

    const getActorLabel = (actor: VetoActor) => {
        if (actor === 'team_a') return teamA;
        if (actor === 'team_b') return teamB;
        return 'Auto';
    };

    return (
        <div className={`fixed ${position === 'bottom' ? 'bottom-0 left-0 right-0' : position === 'top' ? 'top-0 left-0 right-0' : ''} ${bgClass} backdrop-blur-lg border-t border-white/10 py-4 px-6`}>
            <div className="max-w-6xl mx-auto">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-4">
                    {/* Team A */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                            <span className="font-bold text-red-400">F</span>
                        </div>
                        <span className="text-lg font-semibold text-white">{teamA}</span>
                    </div>

                    {/* Current Action */}
                    <AnimatePresence mode="wait">
                        {currentAction ? (
                            <motion.div
                                key={`${step}-${currentAction.action}`}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex items-center gap-3 px-6 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40"
                            >
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className="w-2 h-2 rounded-full bg-yellow-400"
                                />
                                <span className="text-sm text-yellow-400 font-medium">
                                    {getActorLabel(currentAction.actor)} {currentAction.action === 'ban' ? 'BANNING' : currentAction.action.toUpperCase() + 'ING'}
                                </span>
                            </motion.div>
                        ) : isComplete ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="px-6 py-2 rounded-full bg-green-500/20 border border-green-500/40"
                            >
                                <span className="text-sm text-green-400 font-medium">✓ VETO COMPLETE</span>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>

                    {/* Team B */}
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-white">{teamB}</span>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                            <span className="font-bold text-blue-400">S</span>
                        </div>
                    </div>
                </div>

                {/* Maps Row */}
                <div className="flex items-center justify-center gap-3">
                    {/* Picked Maps */}
                    {picked.map((pick, index) => {
                        const map = getMapById(pick.mapId);
                        if (!map) return null;
                        const color = pick.actor === 'team_a' ? '#ef4444' : pick.actor === 'team_b' ? '#3b82f6' : '#8b5cf6';

                        return (
                            <motion.div
                                key={pick.mapId}
                                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ type: 'spring', damping: 15 }}
                                className="relative w-40 aspect-video rounded-xl overflow-hidden border-2"
                                style={{ borderColor: color, boxShadow: `0 0 20px ${color}40` }}
                            >
                                <Image src={map.image_url} alt={map.name} fill className="object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                {/* Map Number */}
                                <div
                                    className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                    style={{ backgroundColor: color }}
                                >
                                    {pick.mapNumber}
                                </div>

                                {/* Side Badge */}
                                {pick.side && (
                                    <motion.div
                                        initial={{ x: 20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pick.side === 'attack' ? 'bg-red-500 text-white' : 'bg-cyan-500 text-white'
                                            }`}
                                    >
                                        {pick.side}
                                    </motion.div>
                                )}

                                {/* Map Name */}
                                <div className="absolute bottom-2 left-2 right-2">
                                    <p className="text-sm font-bold text-white truncate">{map.name}</p>
                                </div>
                            </motion.div>
                        );
                    })}

                    {/* Separator */}
                    {picked.length > 0 && banned.length > 0 && (
                        <div className="w-px h-16 bg-white/20 mx-2" />
                    )}

                    {/* Banned Maps (smaller) */}
                    {banned.map((ban) => {
                        const map = getMapById(ban.mapId);
                        if (!map) return null;

                        return (
                            <motion.div
                                key={ban.mapId}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 0.5, scale: 1 }}
                                className="relative w-20 aspect-video rounded-lg overflow-hidden grayscale"
                            >
                                <Image src={map.image_url} alt={map.name} fill className="object-cover" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <div className="w-6 h-6 rounded-full border-2 border-red-500/80 flex items-center justify-center">
                                        <div className="w-4 h-0.5 bg-red-500/80 rotate-45" />
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Progress Bar */}
                <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(step / totalSteps) * 100}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            </div>
        </div>
    );
}

export default function LiveOverlayPage() {
    return (
        <Suspense fallback={<div className="fixed bottom-0 left-0 right-0 h-40 bg-black/50" />}>
            <LiveOverlayContent />
        </Suspense>
    );
}
