'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

// Default coin images (custom design with A and B sides)
const COIN_SIDE_A = '/coin/side-a.png';
const COIN_SIDE_B = '/coin/side-b.png';

// Inject CSS keyframes globally
const coinStyles = `
@keyframes coinFlipRotate {
    0% { transform: rotateX(0deg); }
    100% { transform: rotateX(1800deg); }
}

@keyframes coinBounce {
    0%, 100% { transform: translateY(0px); }
    25% { transform: translateY(-100px); }
    50% { transform: translateY(-140px); }
    75% { transform: translateY(-60px); }
}
`;

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
    const [animationKey, setAnimationKey] = useState(0);
    const [finalRotation, setFinalRotation] = useState(0);

    // Use custom images or fall back to default coin images
    const sideAImage = coinImageA || COIN_SIDE_A;
    const sideBImage = coinImageB || COIN_SIDE_B;

    // Inject styles on mount
    useEffect(() => {
        const styleId = 'coin-flip-styles';
        if (!document.getElementById(styleId)) {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = coinStyles;
            document.head.appendChild(styleEl);
        }
        return () => {
            const el = document.getElementById(styleId);
            if (el) el.remove();
        };
    }, []);

    // If external winner is passed, show the result
    useEffect(() => {
        if (externalWinner) {
            setResult(externalWinner);
            setShowResult(true);
            setFinalRotation(externalWinner === 'team_a' ? 0 : 180);
        }
    }, [externalWinner]);

    const handleFlip = useCallback(async (forcedWinner?: VetoActor) => {
        if (isFlipping || !onFlip) return;

        // 1. Start animation FIRST
        setIsFlipping(true);
        setShowResult(false);
        setError(null);
        setAnimationKey(prev => prev + 1);

        // 2. Call API in background (don't await yet)
        const apiPromise = onFlip(forcedWinner);

        // 3. Fixed animation duration - MUST wait this long
        const ANIMATION_DURATION = forcedWinner ? 1500 : 2500;

        // 4. Wait for BOTH animation time and API response
        const startTime = Date.now();
        const winner = await apiPromise;

        // Calculate remaining time to wait
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, ANIMATION_DURATION - elapsed);

        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        // 5. Animation done, now show result
        setIsFlipping(false);

        if (winner) {
            // Set final rotation based on winner
            setFinalRotation(winner === 'team_a' ? 0 : 180);
            setResult(winner);

            // Brief pause before showing winner text
            await new Promise(resolve => setTimeout(resolve, 200));
            setShowResult(true);
        } else {
            setError('Failed to complete coin toss. Only admins can flip the coin.');
        }
    }, [isFlipping, onFlip]);

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
                                perspective: '800px',
                                perspectiveOrigin: 'center center',
                            }}
                        >
                            {/* Bounce container */}
                            <div
                                key={`bounce-${animationKey}`}
                                style={{
                                    animation: isFlipping ? 'coinBounce 2.5s ease-in-out' : 'none',
                                }}
                            >
                                {/* Rotation container */}
                                <div
                                    key={`rotate-${animationKey}`}
                                    className="relative w-48 h-48 md:w-56 md:h-56"
                                    style={{
                                        transformStyle: 'preserve-3d',
                                        animation: isFlipping ? 'coinFlipRotate 2.5s ease-in-out' : 'none',
                                        transform: !isFlipping ? `rotateX(${finalRotation}deg)` : undefined,
                                    }}
                                >
                                    {/* Coin Face A (Front - Cyan) */}
                                    <div
                                        className="absolute inset-0 rounded-full flex items-center justify-center"
                                        style={{
                                            backfaceVisibility: 'hidden',
                                            WebkitBackfaceVisibility: 'hidden',
                                            background: 'linear-gradient(145deg, #374151, #1f2937)',
                                            padding: '8px',
                                            boxShadow: `
                                                0 0 30px rgba(0, 255, 255, 0.25),
                                                0 8px 32px rgba(0, 0, 0, 0.4),
                                                inset 0 1px 0 rgba(255,255,255,0.1)
                                            `,
                                        }}
                                    >
                                        <div
                                            className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                                            style={{ background: '#0f172a' }}
                                        >
                                            <img
                                                src={sideAImage}
                                                alt="Side A"
                                                className="w-[85%] h-[85%] object-contain"
                                            />
                                        </div>
                                    </div>

                                    {/* Coin Face B (Back - Yellow/Green) */}
                                    <div
                                        className="absolute inset-0 rounded-full flex items-center justify-center"
                                        style={{
                                            backfaceVisibility: 'hidden',
                                            WebkitBackfaceVisibility: 'hidden',
                                            transform: 'rotateX(180deg)',
                                            background: 'linear-gradient(145deg, #374151, #1f2937)',
                                            padding: '8px',
                                            boxShadow: `
                                                0 0 30px rgba(200, 255, 0, 0.25),
                                                0 8px 32px rgba(0, 0, 0, 0.4),
                                                inset 0 1px 0 rgba(255,255,255,0.1)
                                            `,
                                        }}
                                    >
                                        <div
                                            className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                                            style={{ background: '#0f172a' }}
                                        >
                                            <img
                                                src={sideBImage}
                                                alt="Side B"
                                                className="w-[85%] h-[85%] object-contain"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
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
