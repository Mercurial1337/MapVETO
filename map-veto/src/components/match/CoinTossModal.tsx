'use client';

import { useState, useEffect } from 'react';
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
    const [isFlipping, setIsFlipping] = useState(false);
    const [result, setResult] = useState<VetoActor | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [flipRotation, setFlipRotation] = useState(0);

    // Use custom images or fall back to default coin images
    const sideAImage = coinImageA || COIN_SIDE_A;
    const sideBImage = coinImageB || COIN_SIDE_B;

    // If external winner is passed, show the result
    useEffect(() => {
        if (externalWinner) {
            setResult(externalWinner);
            setShowResult(true);
            // Set the coin to show the correct side (0 = Side A, 180 = Side B)
            setFlipRotation(externalWinner === 'team_a' ? 0 : 180);
        }
    }, [externalWinner]);

    const handleFlip = async (forcedWinner?: VetoActor) => {
        if (isFlipping || !onFlip) return;

        setIsFlipping(true);
        setShowResult(false);
        setError(null);

        // Call the server to get the actual result first
        const winner = await onFlip(forcedWinner);

        if (winner) {
            // Calculate final rotation based on winner
            // Team A = land on 0° (or multiple of 360), Team B = land on 180° (or 180 + multiple of 360)
            // Add extra rotations for dramatic effect
            const baseRotations = forcedWinner ? 3 : 5; // fewer rotations for forced
            const finalRotation = winner === 'team_a'
                ? baseRotations * 360 // Ends at 0° equivalent (Side A visible)
                : baseRotations * 360 + 180; // Ends at 180° equivalent (Side B visible)

            setFlipRotation(finalRotation);

            // Wait for animation to complete
            const animDuration = forcedWinner ? 1000 : 2500;
            await new Promise((resolve) => setTimeout(resolve, animDuration + 300));

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

                        {/* 3D Coin */}
                        <div
                            className="relative mb-10"
                            style={{
                                perspective: '1000px',
                                perspectiveOrigin: 'center center',
                            }}
                        >
                            {/* Coin Container */}
                            <motion.div
                                animate={{
                                    rotateX: flipRotation,
                                    y: isFlipping ? [0, -120, -160, -120, -40, 0] : 0,
                                }}
                                transition={{
                                    rotateX: {
                                        duration: isFlipping ? 2.5 : 0.3,
                                        ease: isFlipping ? [0.25, 0.1, 0.25, 1] : 'easeOut',
                                    },
                                    y: {
                                        duration: isFlipping ? 2.5 : 0,
                                        ease: [0.25, 0.1, 0.25, 1],
                                    },
                                }}
                                className="relative w-52 h-52 md:w-64 md:h-64"
                                style={{
                                    transformStyle: 'preserve-3d',
                                }}
                            >
                                {/* Coin Face A (Front - Cyan) */}
                                <div
                                    className="absolute inset-0 rounded-full overflow-hidden"
                                    style={{
                                        backfaceVisibility: 'hidden',
                                        WebkitBackfaceVisibility: 'hidden',
                                        transform: 'rotateX(0deg)',
                                        // Metallic border that works with both colors
                                        boxShadow: `
                                            inset 0 0 0 6px rgba(100, 116, 139, 0.8),
                                            inset 0 0 0 8px rgba(71, 85, 105, 0.9),
                                            0 0 40px rgba(0, 255, 255, 0.3),
                                            0 10px 30px rgba(0, 0, 0, 0.5)
                                        `,
                                    }}
                                >
                                    {/* Inner border ring */}
                                    <div
                                        className="absolute inset-2 rounded-full"
                                        style={{
                                            background: 'linear-gradient(145deg, #1e293b, #334155)',
                                            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)',
                                        }}
                                    />
                                    {/* Coin design */}
                                    <div className="absolute inset-3 rounded-full overflow-hidden flex items-center justify-center bg-slate-900">
                                        <img
                                            src={sideAImage}
                                            alt="Side A"
                                            className="w-full h-full object-cover"
                                            style={{
                                                transform: 'rotate(45deg) scale(1.3)',
                                            }}
                                        />
                                    </div>
                                    {/* Shine effect */}
                                    <div
                                        className="absolute inset-0 rounded-full pointer-events-none"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
                                        }}
                                    />
                                </div>

                                {/* Coin Edge (for 3D depth) */}
                                <div
                                    className="absolute inset-0 rounded-full"
                                    style={{
                                        transform: 'translateZ(-4px)',
                                        background: 'linear-gradient(to bottom, #475569, #334155, #1e293b)',
                                        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                                    }}
                                />

                                {/* Coin Face B (Back - Yellow/Green) */}
                                <div
                                    className="absolute inset-0 rounded-full overflow-hidden"
                                    style={{
                                        backfaceVisibility: 'hidden',
                                        WebkitBackfaceVisibility: 'hidden',
                                        transform: 'rotateX(180deg)',
                                        // Metallic border that works with both colors
                                        boxShadow: `
                                            inset 0 0 0 6px rgba(100, 116, 139, 0.8),
                                            inset 0 0 0 8px rgba(71, 85, 105, 0.9),
                                            0 0 40px rgba(200, 255, 0, 0.3),
                                            0 10px 30px rgba(0, 0, 0, 0.5)
                                        `,
                                    }}
                                >
                                    {/* Inner border ring */}
                                    <div
                                        className="absolute inset-2 rounded-full"
                                        style={{
                                            background: 'linear-gradient(145deg, #1e293b, #334155)',
                                            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)',
                                        }}
                                    />
                                    {/* Coin design */}
                                    <div className="absolute inset-3 rounded-full overflow-hidden flex items-center justify-center bg-slate-900">
                                        <img
                                            src={sideBImage}
                                            alt="Side B"
                                            className="w-full h-full object-cover"
                                            style={{
                                                transform: 'rotate(45deg) scale(1.3)',
                                            }}
                                        />
                                    </div>
                                    {/* Shine effect */}
                                    <div
                                        className="absolute inset-0 rounded-full pointer-events-none"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
                                        }}
                                    />
                                </div>
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
                                            {teamAName}
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
