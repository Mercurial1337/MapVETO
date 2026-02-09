'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

// GIF paths for each side
const COIN_FLIP_A_GIF = '/coin/coin-flip-a.gif';
const COIN_FLIP_B_GIF = '/coin/coin-flip-b.gif';

// Static coin images (shown after GIF finishes)
const COIN_SIDE_A = '/coin/side-a.png';
const COIN_SIDE_B = '/coin/side-b.png';

// How long to display the GIF before showing result (in ms)
const GIF_DURATION = 2600;

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

// Phase of the coin toss UI
type CoinPhase = 'idle' | 'flipping' | 'result';

export function CoinTossModal({
    isOpen,
    teamAName,
    teamBName,
    isAdmin = false,
    winner: externalWinner,
    onFlip,
}: CoinTossModalProps) {
    const [phase, setPhase] = useState<CoinPhase>('idle');
    const [winner, setWinner] = useState<VetoActor | null>(null);
    const [gifSrc, setGifSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Track whether this component initiated the flip
    // This prevents the external winner effect from overriding mid-animation
    const isFlipInProgress = useRef(false);

    // If external winner arrives (e.g. page reload, non-admin viewer),
    // show result directly — but only if we're not mid-flip
    useEffect(() => {
        if (externalWinner && !isFlipInProgress.current) {
            setWinner(externalWinner);
            setPhase('result');
        }
    }, [externalWinner]);

    const handleFlip = useCallback(async (forcedWinner?: VetoActor) => {
        if (isFlipInProgress.current || !onFlip) return;

        // Lock
        isFlipInProgress.current = true;
        setPhase('flipping');
        setError(null);
        setGifSrc(null);
        setWinner(null);

        try {
            // 1. Call the API to determine the winner
            const result = await onFlip(forcedWinner);

            if (!result) {
                setError('Failed to complete coin toss. Only admins can flip the coin.');
                setPhase('idle');
                isFlipInProgress.current = false;
                return;
            }

            // 2. We have a winner — show the corresponding GIF
            setWinner(result);
            const gif = result === 'team_a' ? COIN_FLIP_A_GIF : COIN_FLIP_B_GIF;
            // Append cache-buster so the browser re-fetches and replays from frame 0
            setGifSrc(`${gif}?t=${Date.now()}`);

            // 3. Wait for the GIF to finish playing
            await new Promise(resolve => setTimeout(resolve, GIF_DURATION));

            // 4. Transition to result phase
            setPhase('result');
        } catch {
            setError('An unexpected error occurred.');
            setPhase('idle');
        } finally {
            isFlipInProgress.current = false;
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
                                /* Playing the flip GIF */
                                <img
                                    src={gifSrc}
                                    alt="Coin flipping"
                                    className="w-full h-full object-contain"
                                />
                            ) : phase === 'result' && winner ? (
                                /* Show the winning side as static image */
                                <img
                                    src={winner === 'team_a' ? COIN_SIDE_A : COIN_SIDE_B}
                                    alt="Winner Side"
                                    className="w-48 h-48 object-contain"
                                />
                            ) : (
                                /* Idle: greyed out coin */
                                <img
                                    src={COIN_SIDE_A}
                                    alt="Coin"
                                    className="w-48 h-48 object-contain opacity-50 grayscale"
                                />
                            )}
                        </div>

                        {/* Bottom Section: error / result text / flipping text / controls */}
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
