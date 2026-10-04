'use client';
import { Fragment } from 'react';

import { useState } from 'react';
import type { VetoActor } from '@/types';

interface ReadyCheckModalProps {
    isOpen: boolean;
    teamAName: string;
    teamBName: string;
    teamAReady: boolean;
    teamBReady: boolean;
    userRole?: VetoActor | 'observer' | 'admin' | null;
    onReady: () => Promise<boolean | void>;
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
        <Fragment>
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/90 "
                    />

                    {/* Modal Content */}
                    <div
                        className="relative z-10 flex flex-col items-center p-8 md:p-12 w-full max-w-lg glass rounded border border-white/10"
                    >
                        {/* Title */}
                        <h2
                            className="text-3xl font-bold text-white mb-2 tracking-wider"
                        >
                            READY CHECK
                        </h2>
                        <p className="text-white/50 mb-10 text-center">
                            Both teams must check in before the coin toss begins.
                        </p>

                        {/* Teams Status */}
                        <div className="flex flex-col gap-6 w-full mb-10">
                            {/* Team A */}
                            <div className={cn(
                                "flex items-center justify-between p-4 rounded border transition-colors duration-300",
                                teamAReady
                                    ? "bg-cyan-500/10 border-cyan-500/30"
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
                                            <span className="text-sm uppercase ">Waiting...</span>
                                            <svg className="w-6 h-6 " fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Team B */}
                            <div className={cn(
                                "flex items-center justify-between p-4 rounded border transition-colors duration-300",
                                teamBReady
                                    ? "bg-lime-500/10 border-lime-500/30"
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
                                            <span className="text-sm uppercase ">Waiting...</span>
                                            <svg className="w-6 h-6 " fill="none" viewBox="0 0 24 24">
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
                                <button
                                    onClick={handleReady}
                                    disabled={isSubmitting}
                                    className={cn(
                                        'w-full py-4 rounded font-bold text-lg uppercase tracking-wider transition-colors duration-300',
                                        isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                                        userRole === 'team_a'
                                            ? 'bg-[#25252a]       text-white'
                                            : 'bg-[#25252a]       text-white'
                                    )}
                                >
                                    {isSubmitting ? 'Confirming...' : 'Check In'}
                                </button>
                            )
                        ) : (
                            <div className="text-center text-white/50">
                                Waiting for teams to check in...
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Fragment>
    );
}
