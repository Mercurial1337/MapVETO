'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

interface PositionSelectionModalProps {
    isOpen: boolean;
    teamAName: string;
    teamBName: string;
    coinTossWinner: VetoActor | null;
    userRole: 'team_a' | 'team_b' | 'observer' | null;
    token: string;
    matchId: string;
    onComplete?: () => void;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

export function PositionSelectionModal({
    isOpen,
    teamAName,
    teamBName,
    coinTossWinner,
    userRole,
    token,
    matchId,
    onComplete,
}: PositionSelectionModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isWinner = userRole === coinTossWinner;
    const winnerName = coinTossWinner === 'team_a' ? teamAName : teamBName;

    const handleChoice = async (pickFirst: boolean) => {
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/veto/position-choice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    match_id: matchId,
                    token,
                    pick_first: pickFirst,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to submit choice');
                setIsSubmitting(false);
                return;
            }

            onComplete?.();
        } catch {
            setError('Network error. Please try again.');
            setIsSubmitting(false);
        }
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
                        className="absolute inset-0 bg-black/90 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: 50 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative z-10 flex flex-col items-center p-8 md:p-12 max-w-lg mx-4"
                    >
                        {/* Winner Announcement */}
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="text-center mb-8"
                        >
                            <div className="text-6xl mb-4">🏆</div>
                            <h2 className="text-3xl font-bold text-yellow-400 mb-2">
                                {winnerName} Won!
                            </h2>
                            <p className="text-white/60">
                                {isWinner ? 'Choose your position' : 'Waiting for position choice...'}
                            </p>
                        </motion.div>

                        {/* Error message */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Position Buttons (only for winner) */}
                        {isWinner ? (
                            <div className="flex flex-col gap-4 w-full">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleChoice(true)}
                                    disabled={isSubmitting}
                                    className={cn(
                                        'p-6 rounded-2xl border-2 text-left transition-all',
                                        'bg-gradient-to-r from-green-500/10 to-emerald-500/10',
                                        'border-green-500/30 hover:border-green-400',
                                        'disabled:opacity-50 disabled:cursor-not-allowed'
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-3xl">🅰️</span>
                                        <div>
                                            <h3 className="text-xl font-bold text-green-400">Be Team A</h3>
                                            <p className="text-white/60 text-sm">You go first (Ban/Pick first)</p>
                                        </div>
                                    </div>
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleChoice(false)}
                                    disabled={isSubmitting}
                                    className={cn(
                                        'p-6 rounded-2xl border-2 text-left transition-all',
                                        'bg-gradient-to-r from-blue-500/10 to-cyan-500/10',
                                        'border-blue-500/30 hover:border-blue-400',
                                        'disabled:opacity-50 disabled:cursor-not-allowed'
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-3xl">🅱️</span>
                                        <div>
                                            <h3 className="text-xl font-bold text-blue-400">Be Team B</h3>
                                            <p className="text-white/60 text-sm">You go second (Ban/Pick second)</p>
                                        </div>
                                    </div>
                                </motion.button>
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-8"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    className="w-12 h-12 border-4 border-white/20 border-t-yellow-400 rounded-full mx-auto mb-4"
                                />
                                <p className="text-white/60">
                                    Waiting for {winnerName} to choose...
                                </p>
                            </motion.div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
