'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

interface CoinTossModalProps {
    isOpen: boolean;
    teamAName: string;
    teamBName: string;
    isAdmin?: boolean;
    winner?: VetoActor | null;
    onFlip?: () => Promise<VetoActor | null>;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

export function CoinTossModal({
    isOpen,
    teamAName,
    teamBName,
    isAdmin = false,
    winner: externalWinner,
    onFlip,
}: CoinTossModalProps) {
    const [isFlipping, setIsFlipping] = useState(false);
    const [result, setResult] = useState<VetoActor | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // If external winner is passed, show the result
    useEffect(() => {
        if (externalWinner) {
            setResult(externalWinner);
            setShowResult(true);
        }
    }, [externalWinner]);

    const handleFlip = async () => {
        if (isFlipping || !onFlip) return;

        setIsFlipping(true);
        setShowResult(false);
        setError(null);

        // Start the animation
        await new Promise((resolve) => setTimeout(resolve, 2500));

        // Call the server to get the actual result
        const winner = await onFlip();

        if (winner) {
            setResult(winner);
            setShowResult(true);
        } else {
            setError('Failed to complete coin toss. Only admins can flip the coin.');
        }

        setIsFlipping(false);
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
                        className="relative z-10 flex flex-col items-center p-8 md:p-12"
                    >
                        {/* Title */}
                        <motion.h2
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-3xl md:text-4xl font-bold text-white mb-8 tracking-wider"
                        >
                            COIN TOSS
                        </motion.h2>

                        {/* Team Names */}
                        <div className="flex items-center gap-8 mb-10">
                            <motion.div
                                animate={result === 'team_a' && showResult ? { scale: 1.1 } : { scale: 1 }}
                                className={cn(
                                    'text-center transition-all duration-300',
                                    result === 'team_a' && showResult ? 'text-yellow-400' : 'text-white/70'
                                )}
                            >
                                <div className="text-xl md:text-2xl font-bold">{teamAName}</div>
                                <div className="text-sm text-white/50 mt-1">Team A</div>
                            </motion.div>

                            <div className="text-3xl text-white/30 font-light">vs</div>

                            <motion.div
                                animate={result === 'team_b' && showResult ? { scale: 1.1 } : { scale: 1 }}
                                className={cn(
                                    'text-center transition-all duration-300',
                                    result === 'team_b' && showResult ? 'text-yellow-400' : 'text-white/70'
                                )}
                            >
                                <div className="text-xl md:text-2xl font-bold">{teamBName}</div>
                                <div className="text-sm text-white/50 mt-1">Team B</div>
                            </motion.div>
                        </div>

                        {/* Coin */}
                        <div className="relative w-40 h-40 md:w-48 md:h-48 mb-10 perspective-1000">
                            <motion.div
                                animate={
                                    isFlipping
                                        ? {
                                            rotateY: [0, 1800],
                                            y: [0, -150, 0],
                                        }
                                        : {}
                                }
                                transition={{
                                    duration: 2.5,
                                    ease: [0.25, 0.1, 0.25, 1],
                                }}
                                className="relative w-full h-full"
                                style={{ transformStyle: 'preserve-3d' }}
                            >
                                {/* Coin Face A */}
                                <div
                                    className={cn(
                                        'absolute inset-0 rounded-full flex items-center justify-center text-6xl font-bold',
                                        'bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600',
                                        'shadow-2xl shadow-yellow-500/50',
                                        'border-4 border-yellow-200/50'
                                    )}
                                    style={{ backfaceVisibility: 'hidden' }}
                                >
                                    <span className="bg-gradient-to-b from-yellow-800 to-yellow-950 bg-clip-text text-transparent drop-shadow-sm">
                                        A
                                    </span>
                                </div>

                                {/* Coin Face B */}
                                <div
                                    className={cn(
                                        'absolute inset-0 rounded-full flex items-center justify-center text-6xl font-bold',
                                        'bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600',
                                        'shadow-2xl shadow-slate-500/50',
                                        'border-4 border-slate-200/50'
                                    )}
                                    style={{
                                        backfaceVisibility: 'hidden',
                                        transform: 'rotateY(180deg)',
                                    }}
                                >
                                    <span className="bg-gradient-to-b from-slate-700 to-slate-900 bg-clip-text text-transparent drop-shadow-sm">
                                        B
                                    </span>
                                </div>
                            </motion.div>

                            {/* Glow effect */}
                            <motion.div
                                animate={
                                    isFlipping
                                        ? {
                                            opacity: [0.3, 0.8, 0.3],
                                            scale: [1, 1.2, 1],
                                        }
                                        : {}
                                }
                                transition={{ duration: 0.5, repeat: 5 }}
                                className="absolute inset-0 rounded-full bg-yellow-400/30 blur-xl -z-10"
                            />
                        </div>

                        {/* Result / Button / Waiting */}
                        <AnimatePresence mode="wait">
                            {error ? (
                                <motion.div
                                    key="error"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center"
                                >
                                    <div className="text-red-400 text-lg mb-4">{error}</div>
                                </motion.div>
                            ) : showResult && result ? (
                                <motion.div
                                    key="result"
                                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center"
                                >
                                    <motion.div
                                        animate={{
                                            scale: [1, 1.05, 1],
                                        }}
                                        transition={{ duration: 0.5, repeat: 2 }}
                                        className="text-4xl md:text-5xl font-bold text-yellow-400 mb-2"
                                    >
                                        {result === 'team_a' ? teamAName : teamBName}
                                    </motion.div>
                                    <div className="text-lg text-green-400 font-semibold">
                                        🎉 Wins the Coin Toss!
                                    </div>
                                </motion.div>
                            ) : isFlipping ? (
                                <motion.div
                                    key="flipping"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-xl text-white/60 animate-pulse"
                                >
                                    Flipping...
                                </motion.div>
                            ) : isAdmin ? (
                                <motion.button
                                    key="button"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleFlip}
                                    className={cn(
                                        'px-10 py-4 rounded-2xl font-bold text-lg',
                                        'bg-gradient-to-r from-purple-600 via-pink-600 to-red-500',
                                        'text-white shadow-xl shadow-purple-500/30',
                                        'hover:shadow-2xl hover:shadow-purple-500/50',
                                        'transition-all duration-300',
                                        'border border-white/20'
                                    )}
                                >
                                    Flip Coin
                                </motion.button>
                            ) : (
                                <motion.div
                                    key="waiting"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center"
                                >
                                    <div className="text-xl text-white/60 mb-2">
                                        ⏳ Waiting for admin to flip the coin...
                                    </div>
                                    <div className="text-sm text-white/40">
                                        The match will start once the coin toss is complete
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
