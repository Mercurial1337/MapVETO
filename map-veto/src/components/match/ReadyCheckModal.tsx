'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoActor } from '@/types';

interface ReadyCheckModalProps {
    isOpen: boolean;
    teamAName: string;
    teamBName: string;
    teamAReady: boolean;
    teamBReady: boolean;
    userRole?: VetoActor | 'observer' | null;
    onReady: () => Promise<void>;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

export function ReadyCheckModal({
    isOpen,
    teamAName,
    teamBName,
    teamAReady,
    teamBReady,
    userRole,
    onReady,
}: ReadyCheckModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleReady = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onReady();
        } finally {
            setIsSubmitting(false);
        }
    };

    const isMyTeamReady = userRole === 'team_a' ? teamAReady : userRole === 'team_b' ? teamBReady : false;

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
                        className="absolute inset-0 bg-black/90 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: 50 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative z-10 flex flex-col items-center p-8 md:p-12 w-full max-w-lg glass rounded-3xl border border-white/10"
                    >
                        {/* Title */}
                        <motion.h2
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-3xl font-bold text-white mb-2 tracking-wider"
                        >
                            READY CHECK
                        </motion.h2>
                        <p className="text-white/50 mb-10 text-center">
                            Both teams must check in before the coin toss begins.
                        </p>

                        {/* Teams Status */}
                        <div className="flex flex-col gap-6 w-full mb-10">
                            {/* Team A */}
                            <div className={cn(
                                "flex items-center justify-between p-4 rounded-xl border transition-all duration-300",
                                teamAReady 
                                    ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]" 
                                    : "bg-white/5 border-white/10"
                            )}>
                                <div>
                                    <h3 className={cn("text-xl font-bold", teamAReady ? "text-cyan-400" : "text-white/70")}>
                                        {teamAName}
                                    </h3>
                                    <span className="text-xs text-white/40 uppercase tracking-wider">Team A</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {teamAReady ? (
                                        <div className="flex items-center gap-2 text-cyan-400">
                                            <span className="text-sm font-semibold uppercase">Ready</span>
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-yellow-500/70">
                                            <span className="text-sm uppercase animate-pulse">Waiting...</span>
                                            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Team B */}
                            <div className={cn(
                                "flex items-center justify-between p-4 rounded-xl border transition-all duration-300",
                                teamBReady 
                                    ? "bg-lime-500/10 border-lime-500/30 shadow-[0_0_15px_rgba(163,230,53,0.15)]" 
                                    : "bg-white/5 border-white/10"
                            )}>
                                <div>
                                    <h3 className={cn("text-xl font-bold", teamBReady ? "text-lime-400" : "text-white/70")}>
                                        {teamBName}
                                    </h3>
                                    <span className="text-xs text-white/40 uppercase tracking-wider">Team B</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {teamBReady ? (
                                        <div className="flex items-center gap-2 text-lime-400">
                                            <span className="text-sm font-semibold uppercase">Ready</span>
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-yellow-500/70">
                                            <span className="text-sm uppercase animate-pulse">Waiting...</span>
                                            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        {userRole === 'team_a' || userRole === 'team_b' ? (
                            isMyTeamReady ? (
                                <div className="text-center text-white/50">
                                    Waiting for opponent...
                                </div>
                            ) : (
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleReady}
                                    disabled={isSubmitting}
                                    className={cn(
                                        'w-full py-4 rounded-xl font-bold text-lg uppercase tracking-wider transition-all duration-300',
                                        isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                                        userRole === 'team_a'
                                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/25 text-white'
                                            : 'bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-500 hover:to-green-500 shadow-lg shadow-lime-500/25 text-white'
                                    )}
                                >
                                    {isSubmitting ? 'Confirming...' : 'Check In'}
                                </motion.button>
                            )
                        ) : (
                            <div className="text-center text-white/50">
                                Waiting for teams to check in...
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
