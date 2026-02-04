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
    onFlip?: (forcedWinner?: VetoActor) => Promise<VetoActor | null>;
    customCoinImage?: string | null;
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
    customCoinImage,
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

    const handleFlip = async (forcedWinner?: VetoActor) => {
        if (isFlipping || !onFlip) return;

        setIsFlipping(true);
        setShowResult(false);
        setError(null);

        // Start the animation (shorter for forced winner)
        await new Promise((resolve) => setTimeout(resolve, forcedWinner ? 1000 : 2500));

        // Call the server to get the actual result
        const winner = await onFlip(forcedWinner);

        if (winner) {
            setResult(winner);
            setShowResult(true);
        } else {
            setError('Failed to complete coin toss. Only admins can flip the coin.');
        }

        setIsFlipping(false);
    };

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
                                <div className="text-sm text-white/50 mt-1">Team 1</div>
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
                                <div className="text-sm text-white/50 mt-1">Team 2</div>
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
                                {customCoinImage ? (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center"
                                        style={{ backfaceVisibility: 'hidden' }}
                                    >
                                        <img
                                            src={customCoinImage}
                                            alt="Coin"
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={cn(
                                            'absolute inset-0 rounded-full flex items-center justify-center text-6xl font-bold',
                                            'bg-yellow-500',
                                            'border-4 border-yellow-300/50'
                                        )}
                                        style={{ backfaceVisibility: 'hidden' }}
                                    >
                                        <span className="text-yellow-900 drop-shadow-sm">
                                            A
                                        </span>
                                    </div>
                                )}

                                {/* Coin Face B */}
                                {customCoinImage ? (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center"
                                        style={{
                                            backfaceVisibility: 'hidden',
                                            transform: 'rotateY(180deg)',
                                        }}
                                    >
                                        <img
                                            src={customCoinImage}
                                            alt="Coin"
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={cn(
                                            'absolute inset-0 rounded-full flex items-center justify-center text-6xl font-bold',
                                            'bg-slate-400',
                                            'border-4 border-slate-300/50'
                                        )}
                                        style={{
                                            backfaceVisibility: 'hidden',
                                            transform: 'rotateY(180deg)',
                                        }}
                                    >
                                        <span className="text-slate-800 drop-shadow-sm">
                                            B
                                        </span>
                                    </div>
                                )}
                            </motion.div>
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
                                            'bg-purple-600',
                                            'text-white',
                                            'hover:bg-purple-500',
                                            'transition-all duration-300',
                                            'border border-white/20'
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
                                                'bg-red-500/20 hover:bg-red-500/30',
                                                'text-red-400 border border-red-500/30',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            {teamAName}
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleForceWinner('team_b')}
                                            className={cn(
                                                'px-6 py-3 rounded-xl font-semibold',
                                                'bg-blue-500/20 hover:bg-blue-500/30',
                                                'text-blue-400 border border-blue-500/30',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            {teamBName}
                                        </motion.button>
                                    </div>

                                    <p className="text-xs text-white/30 text-center max-w-xs">
                                        Use manual selection for seeded matchups where higher seed picks first
                                    </p>
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
