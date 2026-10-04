'use client';
import { Fragment } from 'react';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense, useMemo, useState, useEffect } from 'react';
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

    const isRevealed=true;

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
                </div>
            )}

            {/* Main Container */}
            <div
                className="max-w-5xl mx-auto"
            >
                {/* Header with Teams */}
                <div
                    className="flex items-center justify-center gap-8 mb-8"
                >
                    {/* Team A */}
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded bg-[#25252a]   border border-red-500/40 flex items-center justify-center">
                            <span className="text-2xl font-bold text-red-400">F</span>
                        </div>
                        <div className="text-right">
                            <h2 className="text-2xl font-bold text-white">{DEMO_RESULTS.teamA}</h2>
                            <span className="text-xs text-red-400/70 uppercase tracking-wider">Team 1</span>
                        </div>
                    </div>

                    <div className="text-3xl font-light text-white/20">VS</div>

                    {/* Team B */}
                    <div className="flex items-center gap-4">
                        <div className="text-left">
                            <h2 className="text-2xl font-bold text-white">{DEMO_RESULTS.teamB}</h2>
                            <span className="text-xs text-blue-400/70 uppercase tracking-wider">Team 2</span>
                        </div>
                        <div className="w-16 h-16 rounded bg-[#25252a]   border border-blue-500/40 flex items-center justify-center">
                            <span className="text-2xl font-bold text-blue-400">S</span>
                        </div>
                    </div>
                </div>

                {/* Veto Results Title */}
                <div
                    className="text-center mb-6"
                >
                    <h1 className="text-lg font-semibold text-white/60 uppercase tracking-[0.3em]">
                        Map Veto Results
                    </h1>
                </div>

                {/* Picked Maps */}
                <div className={`grid ${compact ? 'grid-cols-3 gap-4' : 'grid-cols-3 gap-6'} mb-8`}>
                    {DEMO_RESULTS.maps.map((result, index) => (
                        <div
                            key={result.map.id}
                            className="relative group"
                        >
                            {/* Map Card */}
                            <div
                                className={`relative overflow-hidden rounded border-2 ${compact ? 'aspect-[16/10]' : 'aspect-video'}`}
                                style={{
                                    borderColor: result.pickedBy === 'team_a' ? '#ef4444' : result.pickedBy === 'team_b' ? '#3b82f6' : '#8b5cf6',

                                }}
                            >
                                <Image
                                    src={result.map.image_url}
                                    alt={result.map.name}
                                    fill
                                    className="object-cover"
                                />

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-black/50   " />

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
                                        ? 'bg-[#25252a]   text-white'
                                        : 'bg-[#25252a]   text-white'
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
                        </div>
                    ))}
                </div>

                {/* Banned Maps */}
                <Fragment>
                    {showBanned && (
                        <div
                        >
                            <div className="text-center mb-4">
                                <span className="text-xs text-white/40 uppercase tracking-wider">Banned Maps</span>
                            </div>
                            <div className="flex justify-center gap-3">
                                {DEMO_RESULTS.banned.map((ban, index) => (
                                    <div
                                        key={ban.map.id}
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Fragment>

                {/* Footer Branding */}
                <div
                    className="mt-8 text-center"
                >
                    <span className="text-xs text-white/20 uppercase tracking-[0.5em]">Map Veto</span>
                </div>
            </div>
        </div>
    );
}

export default function StreamPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <div
                    className="w-8 h-8 border-2 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        }>
            <StreamOverlayContent />
        </Suspense>
    );
}
