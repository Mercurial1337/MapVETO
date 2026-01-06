'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import type { MapCardState, SideChoice } from '@/types';

interface MapCardProps {
    map: {
        id: string;
        name: string;
        image_url: string;
    };
    state: MapCardState;
    side?: SideChoice | null;
    pickedBy?: string;
    teamColor?: string;
    canInteract: boolean;
    onSelect?: () => void;
    mapNumber?: number;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

export function MapCard({
    map,
    state,
    side,
    pickedBy,
    teamColor = '#ffffff',
    canInteract,
    onSelect,
    mapNumber,
}: MapCardProps) {
    const isInteractive = canInteract && state === 'available';

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
                'w-[140px] md:w-[160px] lg:w-[180px] xl:w-[200px]',
                'shadow-xl',
                isInteractive && 'cursor-pointer',
                state === 'banned' && 'cursor-not-allowed',
                state === 'active' && 'ring-2 ring-yellow-400 animate-pulse'
            )}
            style={{
                boxShadow: state === 'picked' ? `0 0 40px ${teamColor}60, 0 0 80px ${teamColor}30` : undefined,
            }}
        >
            {/* Map Image */}
            <Image
                src={map.image_url}
                alt={map.name}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 140px, (max-width: 1024px) 160px, 200px"
            />

            {/* Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

            {/* Picked Highlight Border */}
            {state === 'picked' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 rounded-2xl"
                    style={{
                        border: `4px solid ${teamColor}`,
                        boxShadow: `inset 0 0 30px ${teamColor}40`,
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
                        className="text-sm text-white/70 mt-1"
                    >
                        Picked by {pickedBy}
                    </motion.p>
                )}
            </div>

            {/* Banned Overlay with Icon */}
            {state === 'banned' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-black/50"
                >
                    <div className="relative w-12 h-12">
                        {/* Circle */}
                        <div className="absolute inset-0 rounded-full border-[3px] border-red-500/90" />
                        {/* Diagonal Line */}
                        <motion.div
                            initial={{ rotate: 0, opacity: 0 }}
                            animate={{ rotate: 45, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-red-500/90 rounded-full"
                        />
                    </div>
                </motion.div>
            )}

            {/* Side Badge */}
            {state === 'picked' && side && (
                <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className={cn(
                        'absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                        'shadow-lg backdrop-blur-sm',
                        side === 'attack'
                            ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-red-500/30'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/30'
                    )}
                >
                    {side === 'attack' ? 'ATK' : 'DEF'}
                </motion.div>
            )}

            {/* Active/Current Selection Glow */}
            {state === 'active' && (
                <motion.div
                    animate={{
                        boxShadow: [
                            '0 0 20px rgba(255,255,255,0.2), inset 0 0 20px rgba(255,255,255,0.1)',
                            '0 0 60px rgba(255,255,255,0.4), inset 0 0 40px rgba(255,255,255,0.2)',
                            '0 0 20px rgba(255,255,255,0.2), inset 0 0 20px rgba(255,255,255,0.1)',
                        ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                />
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
                        className="px-6 py-3 bg-white/20 backdrop-blur-md rounded-full text-white font-semibold border border-white/30"
                    >
                        Select Map
                    </motion.div>
                </motion.div>
            )}
        </motion.div>
    );
}
