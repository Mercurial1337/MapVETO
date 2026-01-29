'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import type { MapCardState, SideChoice } from '@/types';

// Map name to local image fallback
const MAP_IMAGE_FALLBACKS: Record<string, string> = {
    'Abyss': '/maps/valorant/Abyss.webp',
    'Bind': '/maps/valorant/Bind.webp',
    'Haven': '/maps/valorant/Haven.webp',
    'Pearl': '/maps/valorant/Pearl.webp',
    'Corrode': '/maps/valorant/Corrode.webp',
    'Split': '/maps/valorant/Split.webp',
    'Sunset': '/maps/valorant/Sunset.webp',
    'Ascent': '/maps/valorant/Ascent.webp',
    'Icebox': '/maps/valorant/Icebox.webp',
    'Breeze': '/maps/valorant/Breeze.webp',
    'Fracture': '/maps/valorant/Fracture.webp',
    'Lotus': '/maps/valorant/Lotus.webp',
};

interface MapCardProps {
    map: {
        id: string;
        name: string;
        image_url: string;
    };
    state: MapCardState;
    side?: SideChoice | null;
    sidePickedBy?: string; // Team name who picked the side
    pickedBy?: string;
    teamColor?: string;
    canInteract: boolean;
    onSelect?: () => void;
    mapNumber?: number;
    action?: string;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

export function MapCard({
    map,
    state,
    side,
    sidePickedBy,
    pickedBy,
    teamColor = '#ffffff',
    canInteract,
    onSelect,
    mapNumber,
    action,
}: MapCardProps) {
    // canInteract is already computed by the parent based on turn, map state, etc.
    // We just need to make sure the map is not banned or already picked
    const isInteractive = canInteract && (state === 'available' || state === 'active');

    // Use fallback image if needed
    const [imgError, setImgError] = useState(false);
    const imageUrl = imgError || !map.image_url
        ? (MAP_IMAGE_FALLBACKS[map.name] || '/maps/valorant/default.webp')
        : map.image_url;

    // Determine hover text
    const hoverText = action === 'ban' ? 'Ban Map' : action === 'pick' ? 'Pick Map' : 'Select Map';
    const hoverColor = action === 'ban' ? 'bg-red-500/80 border-red-400' : action === 'pick' ? 'bg-green-500/80 border-green-400' : 'bg-white/20 border-white/30';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
                opacity: state === 'banned' ? 0.4 : 1,
                scale: 1,
                filter: state === 'banned' ? 'grayscale(100%)' : 'none',
            }}
            whileHover={isInteractive ? { scale: 1.05, y: -8 } : {}}
            whileTap={isInteractive ? { scale: 0.98 } : {}}
            onClick={isInteractive ? onSelect : undefined}
            className={cn(
                'relative aspect-[16/9] rounded-xl overflow-hidden transition-all duration-300',
                'w-[96px] sm:w-[120px] md:w-[160px] lg:w-[180px] xl:w-[200px]',
                isInteractive && 'cursor-pointer',
                state === 'banned' && 'cursor-not-allowed',
                state === 'active' && 'ring-2 ring-yellow-400 animate-pulse'
            )}
        >
            {/* Map Image */}
            <Image
                src={imageUrl}
                alt={map.name}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 640px) 96px, (max-width: 768px) 120px, (max-width: 1024px) 160px, 200px"
                onError={() => setImgError(true)}
            />

            {/* Dark Overlays */}
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-black/40" />

            {/* Picked Highlight Border */}
            {state === 'picked' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 rounded-2xl"
                    style={{
                        border: `4px solid ${teamColor}`,
                    }}
                />
            )}

            {/* Map Number Badge (for picked maps) */}
            {state === 'picked' && mapNumber && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/80 border-2 flex items-center justify-center text-white font-bold text-xs"
                    style={{ borderColor: teamColor }}
                >
                    {mapNumber}
                </motion.div>
            )}

            {/* Map Name */}
            <div className="absolute bottom-2 left-2 right-2">
                <motion.h3
                    className="text-sm md:text-base font-bold text-white drop-shadow-lg tracking-wide"
                    animate={{ opacity: state === 'banned' ? 0.6 : 1 }}
                >
                    {map.name}
                </motion.h3>

                {/* Picked By Indicator */}
                {state === 'picked' && pickedBy && (
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[10px] md:text-xs text-white/80 font-medium"
                    >
                        Picked by {pickedBy}
                    </motion.p>
                )}

                {state === 'banned' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-8"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                    </motion.div>
                )}
            </div>

            {/* Banned Overlay Stripe */}
            {state === 'banned' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <motion.div
                        initial={{ rotate: 0, opacity: 0 }}
                        animate={{ rotate: 45, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-red-500/90 rounded-full"
                    />
                </div>
            )}

            {/* Side Badge */}
            {state === 'picked' && side && (
                <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className={cn(
                        'absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                        'shadow-lg backdrop-blur-sm flex items-center gap-1',
                        side === 'attack'
                            ? 'bg-red-600 text-white shadow-red-500/30'
                            : 'bg-blue-600 text-white shadow-blue-500/30'
                    )}
                >
                    {side === 'attack' ? 'ATK' : 'DEF'}
                    {sidePickedBy && (
                        <span className="text-[8px] font-medium opacity-90 normal-case">
                            · {sidePickedBy}
                        </span>
                    )}
                </motion.div>
            )}

            {/* Active/Current Selection Indicator */}
            {state === 'active' && (
                <div className="absolute inset-0 rounded-2xl border-2 border-white/40 pointer-events-none" />
            )}

            {/* Hover Overlay for Interactive Cards */}
            {isInteractive && (
                <motion.div
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    className="absolute inset-0 bg-white/10 flex items-center justify-center"
                >
                    <motion.div
                        initial={{ scale: 0.8 }}
                        whileHover={{ scale: 1 }}
                        className={cn(
                            "px-6 py-3 backdrop-blur-md rounded-full text-white font-semibold border",
                            hoverColor
                        )}
                    >
                        {hoverText}
                    </motion.div>
                </motion.div>
            )}
        </motion.div>
    );
}
