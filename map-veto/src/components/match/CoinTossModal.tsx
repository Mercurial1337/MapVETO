'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

// Default coin images (custom design with A and B sides)
const COIN_SIDE_A = '/coin/side-a.png';
const COIN_SIDE_B = '/coin/side-b.png';

interface CoinTossModalProps {
    isOpen: boolean;
    teamAName: string;
    teamBName: string;
    isAdmin?: boolean;
    winner?: VetoActor | null;
    onFlip?: (forcedWinner?: VetoActor) => Promise<VetoActor | null>;
    coinImageA?: string | null;
    coinImageB?: string | null;
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
    coinImageA,
    coinImageB,
}: CoinTossModalProps) {
    const [isLocalFlipping, setIsLocalFlipping] = useState(false);
    const [isFlipping, setIsFlipping] = useState(false);
    const [result, setResult] = useState<VetoActor | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentGif, setCurrentGif] = useState<string | null>(null);

    // If external winner is passed, show the result, but ONLY if we aren't already locally flipping
    useEffect(() => {
        if (externalWinner && !isLocalFlipping) {
            setResult(externalWinner);
            setShowResult(true);
        }
    }, [externalWinner, isLocalFlipping]);

    const handleFlip = useCallback(async (forcedWinner?: VetoActor) => {
        if (isLocalFlipping || !onFlip) return;

        // Reset states for a new flip
        setIsLocalFlipping(true);
        setIsFlipping(true);
        setShowResult(false);
        setError(null);
        setCurrentGif(null);

        try {
            // 1. Call API to get result
            const winner = await onFlip(forcedWinner);

            if (winner) {
                setResult(winner);
                // 2. Set the correct GIF based on winner
                const gifPath = winner === 'team_a' ? '/coin/coin-flip-a.gif' : '/coin/coin-flip-b.gif';
                // Add timestamp to force GIF restart from frame 0
                setCurrentGif(`${gifPath}?t=${Date.now()}`);

                // 3. Wait for GIF duration (approx 2.5s)
                await new Promise(resolve => setTimeout(resolve, 2600));

                // 4. Show result text
                setShowResult(true);
            } else {
                setError('Failed to complete coin toss. Only admins can flip the coin.');
            }
        } catch (err) {
            setError('An unexpected error occurred during the coin toss.');
        } finally {
            setIsFlipping(false);
            setIsLocalFlipping(false);
        }
    }, [isLocalFlipping, onFlip]);

    const handleForceWinner = (team: VetoActor) => {
        handleFlip(team);
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
                        className="relative z-10 flex flex-col items-center p-8 md:p-12 w-full max-w-lg"
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
                        <div className="flex items-center gap-8 mb-10 w-full justify-center">
                            <motion.div
                                animate={result === 'team_a' && showResult ? { scale: 1.1 } : { scale: 1 }}
                                className={cn(
                                    'text-center transition-all duration-300',
                                    result === 'team_a' && showResult ? 'text-cyan-400' : 'text-white/70'
                                )}
                            >
                                <div className="text-xl md:text-2xl font-bold truncate max-w-[150px]">{teamAName}</div>
                                <div className="text-sm mt-1 font-semibold uppercase tracking-widest text-cyan-500/80">Team A</div>
                            </motion.div>

                            <div className="text-3xl text-white/30 font-light">vs</div>

                            <motion.div
                                animate={result === 'team_b' && showResult ? { scale: 1.1 } : { scale: 1 }}
                                className={cn(
                                    'text-center transition-all duration-300',
                                    result === 'team_b' && showResult ? 'text-lime-400' : 'text-white/70'
                                )}
                            >
                                <div className="text-xl md:text-2xl font-bold truncate max-w-[150px]">{teamBName}</div>
                                <div className="text-sm mt-1 font-semibold uppercase tracking-widest text-lime-500/80">Team B</div>
                            </motion.div>
                        </div>

                        {/* GIF Coin Container */}
                        <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
                            {isFlipping && currentGif ? (
                                <img
                                    src={`${currentGif}?t=${Date.now()}`}
                                    alt="Coin flipping"
                                    className="w-full h-full object-contain"
                                />
                            ) : showResult && result ? (
                                <img
                                    src={result === 'team_a' ? '/coin/side-a.png' : '/coin/side-b.png'}
                                    alt="Winner Side"
                                    className="w-48 h-48 object-contain"
                                />
                            ) : (
                                <img
                                    src="/coin/side-a.png"
                                    alt="Coin Idle"
                                    className="w-48 h-48 object-contain opacity-50 grayscale"
                                />
                            )}
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
                                        animate={{ scale: [1, 1.05, 1] }}
                                        transition={{ duration: 0.5, repeat: 2 }}
                                        className={cn(
                                            "text-4xl md:text-5xl font-bold mb-2",
                                            result === 'team_a' ? "text-cyan-400" : "text-lime-400"
                                        )}
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
                                <motion.div
                                    key="admin-controls"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex flex-col items-center gap-4"
                                >
                                    {/* Random Coin Flip */}
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleFlip()}
                                        className={cn(
                                            'px-10 py-4 rounded-2xl font-bold text-lg',
                                            'bg-gradient-to-r from-purple-600 to-indigo-600',
                                            'text-white',
                                            'hover:from-purple-500 hover:to-indigo-500',
                                            'transition-all duration-300',
                                            'shadow-lg shadow-purple-500/30',
                                            'border border-white/10'
                                        )}
                                    >
                                        🎲 Flip Coin
                                    </motion.button>

                                    {/* Divider */}
                                    <div className="flex items-center gap-3 w-full max-w-xs">
                                        <div className="flex-1 h-px bg-white/20" />
                                        <span className="text-white/40 text-sm">or select winner</span>
                                        <div className="flex-1 h-px bg-white/20" />
                                    </div>

                                    {/* Manual Selection Buttons */}
                                    <div className="flex gap-3">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleForceWinner('team_a')}
                                            className={cn(
                                                'px-6 py-3 rounded-xl font-semibold',
                                                'bg-cyan-500/20 hover:bg-cyan-500/30',
                                                'text-cyan-400 border border-cyan-500/30',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            {teamAName} (A)
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleForceWinner('team_b')}
                                            className={cn(
                                                'px-6 py-3 rounded-xl font-semibold',
                                                'bg-lime-500/20 hover:bg-lime-500/30',
                                                'text-lime-400 border border-lime-500/30',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            {teamBName} (B)
                                        </motion.button>
                                    </div>
                                </motion.div>
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
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
