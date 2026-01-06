'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SideChoice } from '@/types';

interface SideSelectionModalProps {
    isOpen: boolean;
    mapName: string;
    teamName: string;
    onSelect: (side: SideChoice) => void;
    isSubmitting?: boolean;
}

export function SideSelectionModal({
    isOpen,
    mapName,
    teamName,
    onSelect,
    isSubmitting = false,
}: SideSelectionModalProps) {
    const [selectedSide, setSelectedSide] = useState<SideChoice | null>(null);

    const handleSelect = (side: SideChoice) => {
        setSelectedSide(side);
        onSelect(side);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: 50 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative z-10 glass rounded-3xl p-8 max-w-md mx-4 text-center"
                    >
                        <h2 className="text-2xl font-bold text-white mb-2">Choose Your Side</h2>
                        <p className="text-white/60 mb-2">
                            <span className="text-yellow-400 font-semibold">{teamName}</span> is picking side for
                        </p>
                        <p className="text-xl font-bold text-white mb-8">{mapName}</p>

                        <div className="flex gap-4 justify-center">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleSelect('attack')}
                                disabled={isSubmitting}
                                className={`flex-1 p-6 rounded-2xl border-2 transition-all ${selectedSide === 'attack'
                                        ? 'bg-red-500/30 border-red-400'
                                        : 'bg-red-500/10 border-red-500/30 hover:border-red-400'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-4xl mb-2">⚔️</div>
                                <div className="text-xl font-bold text-red-400">Attack</div>
                                <div className="text-xs text-white/50 mt-1">Start on attack side</div>
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleSelect('defense')}
                                disabled={isSubmitting}
                                className={`flex-1 p-6 rounded-2xl border-2 transition-all ${selectedSide === 'defense'
                                        ? 'bg-blue-500/30 border-blue-400'
                                        : 'bg-blue-500/10 border-blue-500/30 hover:border-blue-400'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-4xl mb-2">🛡️</div>
                                <div className="text-xl font-bold text-blue-400">Defense</div>
                                <div className="text-xs text-white/50 mt-1">Start on defense side</div>
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
