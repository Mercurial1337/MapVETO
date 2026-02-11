'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

// GIF paths for each side
const COIN_FLIP_A_GIF = '/coin/coin-flip-a.gif';
const COIN_FLIP_B_GIF = '/coin/coin-flip-b.gif';

// Static coin images
const COIN_SIDE_A = '/coin/side-a.png';
const COIN_SIDE_B = '/coin/side-b.png';

// How long to display the GIF before showing result (ms)
// The actual GIFs are 358 frames × 20ms = 7160ms
const GIF_PLAY_DURATION = 7200;
// How long to show the winner text before calling onComplete (ms)
const RESULT_DISPLAY_DURATION = 1500;

interface CoinTossModalProps {
    isOpen: boolean;
    teamAName: string;
    teamBName: string;
    isAdmin?: boolean;
    winner?: VetoActor | null;
    /**
     * If true, the winner was forced by admin (seeded match).
     * Skip animation and show the result immediately.
     */
    isSeeded?: boolean;
    /**
     * Called when admin clicks flip. Should call the API and return the winner.
     * Must return quickly (no artificial delays).
     */
    onFlip?: (forcedWinner?: VetoActor) => Promise<VetoActor | null>;
    /**
     * Called when the entire animation sequence has finished.
     * The parent should close the modal in response.
     */
    onAnimationComplete?: () => void;
    coinImageA?: string | null;
    coinImageB?: string | null;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

type CoinPhase = 'idle' | 'flipping' | 'result';

export function CoinTossModal({
    isOpen,
    teamAName,
    teamBName,
    isAdmin = false,
    winner: externalWinner,
    isSeeded = false,
    onFlip,
    onAnimationComplete,
}: CoinTossModalProps) {
    const [phase, setPhase] = useState<CoinPhase>('idle');
    const [winner, setWinner] = useState<VetoActor | null>(null);
    const [gifSrc, setGifSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const flipLock = useRef(false);

    // When a non-admin viewer receives the coin toss result via real-time,
    // play the GIF animation first before showing the result (same as admin).
    // If the match is seeded (forced winner), skip animation and show result immediately.
    useEffect(() => {
        if (externalWinner && !flipLock.current) {
            flipLock.current = true;
            setWinner(externalWinner);

            if (isSeeded) {
                // Seeded match: skip animation, show result immediately
                setPhase('result');
                flipLock.current = false;
                return;
            }

            setPhase('flipping');
            const gif = externalWinner === 'team_a' ? COIN_FLIP_A_GIF : COIN_FLIP_B_GIF;
            setGifSrc(`${gif}?t=${Date.now()}`);

            // Wait for GIF to finish playing, then show the result
            const timer = setTimeout(() => {
                setPhase('result');
                flipLock.current = false;
            }, GIF_PLAY_DURATION);

            return () => clearTimeout(timer);
        }
    }, [externalWinner, isSeeded]);

    // Auto-close: whenever we enter 'result' phase, close the modal after a delay.
    // This works for ALL viewers (admin who clicked flip + non-admin observers).
    useEffect(() => {
        if (phase === 'result') {
            const timer = setTimeout(() => {
                onAnimationComplete?.();
            }, RESULT_DISPLAY_DURATION);
            return () => clearTimeout(timer);
        }
    }, [phase, onAnimationComplete]);

    // Reset states when modal closes
    useEffect(() => {
        if (!isOpen) {
            setPhase('idle');
            setWinner(null);
            setGifSrc(null);
            setError(null);
            flipLock.current = false;
        }
    }, [isOpen]);

    const handleFlip = useCallback(async (forcedWinner?: VetoActor) => {
        if (flipLock.current || !onFlip) return;

        flipLock.current = true;
        setError(null);
        setWinner(null);
        setGifSrc(null);

        try {
            // Step 1: Call API — this returns the winner immediately
            const result = await onFlip(forcedWinner);

            if (!result) {
                setError('Failed to complete coin toss. Only admins can flip the coin.');
                setPhase('idle');
                flipLock.current = false;
                return;
            }

            setWinner(result);

            if (forcedWinner) {
                // Forced/seeded winner: skip animation, show result immediately
                setPhase('result');
            } else {
                // Random coin toss: play the full GIF animation
                setPhase('flipping');
                const gif = result === 'team_a' ? COIN_FLIP_A_GIF : COIN_FLIP_B_GIF;
                setGifSrc(`${gif}?t=${Date.now()}`);

                // Wait for GIF to finish playing
                await new Promise(resolve => setTimeout(resolve, GIF_PLAY_DURATION));

                // Show the winner text (auto-close is handled by the useEffect)
                setPhase('result');
            }
        } catch {
            setError('An unexpected error occurred.');
            setPhase('idle');
        } finally {
            flipLock.current = false;
        }
    }, [onFlip]);

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
                                animate={winner === 'team_a' && phase === 'result' ? { scale: 1.1 } : { scale: 1 }}
                                className={cn(
                                    'text-center transition-all duration-300',
                                    winner === 'team_a' && phase === 'result' ? 'text-cyan-400' : 'text-white/70'
                                )}
                            >
                                <div className="text-xl md:text-2xl font-bold truncate max-w-[150px]">{teamAName}</div>
                                <div className="text-sm mt-1 font-semibold uppercase tracking-widest text-cyan-500/80">Team A</div>
                            </motion.div>

                            <div className="text-3xl text-white/30 font-light">vs</div>

                            <motion.div
                                animate={winner === 'team_b' && phase === 'result' ? { scale: 1.1 } : { scale: 1 }}
                                className={cn(
                                    'text-center transition-all duration-300',
                                    winner === 'team_b' && phase === 'result' ? 'text-lime-400' : 'text-white/70'
                                )}
                            >
                                <div className="text-xl md:text-2xl font-bold truncate max-w-[150px]">{teamBName}</div>
                                <div className="text-sm mt-1 font-semibold uppercase tracking-widest text-lime-500/80">Team B</div>
                            </motion.div>
                        </div>

                        {/* Coin Display */}
                        <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
                            {phase === 'flipping' && gifSrc ? (
                                <img
                                    src={gifSrc}
                                    alt="Coin flipping"
                                    className="w-full h-full object-contain"
                                />
                            ) : phase === 'result' && winner ? (
                                <img
                                    src={winner === 'team_a' ? COIN_SIDE_A : COIN_SIDE_B}
                                    alt="Winner Side"
                                    className="w-48 h-48 object-contain"
                                />
                            ) : (
                                <img
                                    src={COIN_SIDE_A}
                                    alt="Coin"
                                    className="w-48 h-48 object-contain opacity-50 grayscale"
                                />
                            )}
                        </div>

                        {/* Bottom Section */}
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
                            ) : phase === 'result' && winner ? (
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
                                            winner === 'team_a' ? "text-cyan-400" : "text-lime-400"
                                        )}
                                    >
                                        {winner === 'team_a' ? teamAName : teamBName}
                                    </motion.div>
                                    <div className="text-lg text-green-400 font-semibold">
                                        🎉 Wins the Coin Toss!
                                    </div>
                                </motion.div>
                            ) : phase === 'flipping' ? (
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

                                    <div className="flex items-center gap-3 w-full max-w-xs">
                                        <div className="flex-1 h-px bg-white/20" />
                                        <span className="text-white/40 text-sm">or select winner</span>
                                        <div className="flex-1 h-px bg-white/20" />
                                    </div>

                                    <div className="flex gap-3">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleFlip('team_a')}
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
                                            onClick={() => handleFlip('team_b')}
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
