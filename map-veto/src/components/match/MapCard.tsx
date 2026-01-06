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
                'relative aspect-[16/9] rounded-2xl overflow-hidden transition-all duration-300',
                'min-w-[280px] md:min-w-[320px] lg:min-w-[380px]',
                'shadow-2xl',
                isInteractive && 'cursor-pointer',
                state === 'banned' && 'cursor-not-allowed',
                state === 'active' && 'ring-4 ring-yellow-400 animate-pulse'
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
                sizes="(max-width: 768px) 280px, (max-width: 1024px) 320px, 380px"
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
                    className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/80 border-2 flex items-center justify-center text-white font-bold text-lg"
                    style={{ borderColor: teamColor }}
                >
                    {mapNumber}
                </motion.div>
            )}

            {/* Map Name */}
            <div className="absolute bottom-4 left-4 right-4">
                <motion.h3
                    className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg tracking-wide"
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
                    <div className="relative w-28 h-28">
                        {/* Circle */}
                        <div className="absolute inset-0 rounded-full border-[6px] border-red-500/90" />
                        {/* Diagonal Line */}
                        <motion.div
                            initial={{ rotate: 0, opacity: 0 }}
                            animate={{ rotate: 45, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="absolute top-1/2 left-0 right-0 h-[6px] -translate-y-1/2 bg-red-500/90 rounded-full"
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
                        'absolute top-4 right-4 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider',
                        'shadow-lg backdrop-blur-sm',
                        side === 'attack'
                            ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-red-500/30'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/30'
                    )}
                >
                    {side === 'attack' ? '⚔️ Attack' : '🛡️ Defense'}
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
