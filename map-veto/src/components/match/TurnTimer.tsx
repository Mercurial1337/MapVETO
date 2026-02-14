'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VetoStep } from '@/types';

interface TurnTimerProps {
    /** The current veto step definition */
    currentStep: VetoStep | null;
    /** Current step number from match state — resets the timer when it changes */
    currentStepNumber: number;
    /** Displayed team A name */
    teamAName: string;
    /** Displayed team B name */
    teamBName: string;
    /** Whether the match is in progress */
    isInProgress: boolean;
    /** Whether the veto is complete */
    isComplete: boolean;
}

function formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getActionLabel(action: string): string {
    switch (action) {
        case 'ban': return 'BANNING';
        case 'pick': return 'PICKING';
        case 'side': return 'CHOOSING SIDE';
        case 'decider': return 'DECIDER';
        default: return action.toUpperCase();
    }
}

function getActionColor(action: string): string {
    switch (action) {
        case 'ban': return '#ef4444';    // red
        case 'pick': return '#22c55e';   // green
        case 'side': return '#eab308';   // yellow
        case 'decider': return '#a855f7'; // purple
        default: return '#ffffff';
    }
}

function getTeamColor(actor: string): string {
    switch (actor) {
        case 'team_a': return '#00FFFF'; // cyan — matches Team A label
        case 'team_b': return '#CCFF00'; // lime — matches Team B label
        default: return '#a855f7';       // purple for system
    }
}

export function TurnTimer({
    currentStep,
    currentStepNumber,
    teamAName,
    teamBName,
    isInProgress,
    isComplete,
}: TurnTimerProps) {
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Reset timer whenever step changes
    useEffect(() => {
        setElapsed(0);
    }, [currentStepNumber]);

    // Run the ascending timer
    useEffect(() => {
        if (!isInProgress || isComplete || !currentStep) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        intervalRef.current = setInterval(() => {
            setElapsed((prev) => prev + 1);
        }, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isInProgress, isComplete, currentStep]);

    if (!currentStep || !isInProgress || isComplete) {
        return null;
    }

    const actorName =
        currentStep.actor === 'team_a'
            ? teamAName
            : currentStep.actor === 'team_b'
                ? teamBName
                : 'System';

    const actionLabel = getActionLabel(currentStep.action);
    const actionColor = getActionColor(currentStep.action);
    const teamColor = getTeamColor(currentStep.actor);

    // Determine urgency level for visual feedback
    const isLong = elapsed >= 60;   // 1+ minute
    const isVeryLong = elapsed >= 120; // 2+ minutes

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 px-5 py-3 rounded-xl"
                style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${isVeryLong ? 'rgba(239, 68, 68, 0.4)' : isLong ? 'rgba(234, 179, 8, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                }}
            >
                {/* Pulsing dot */}
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        opacity: [1, 0.6, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                        backgroundColor: isVeryLong ? '#ef4444' : isLong ? '#eab308' : '#22c55e',
                        boxShadow: `0 0 8px ${isVeryLong ? 'rgba(239, 68, 68, 0.5)' : isLong ? 'rgba(234, 179, 8, 0.5)' : 'rgba(34, 197, 94, 0.5)'}`,
                    }}
                />

                {/* Team + Action */}
                <div className="flex items-center gap-2">
                    <span
                        className="text-sm font-bold"
                        style={{ color: teamColor }}
                    >
                        {actorName}
                    </span>
                    <span className="text-white/40 text-xs">—</span>
                    <span
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: actionColor }}
                    >
                        {actionLabel}
                    </span>
                </div>

                {/* Timer Display */}
                <motion.div
                    className="font-mono text-lg font-bold tabular-nums ml-2"
                    style={{
                        color: isVeryLong ? '#ef4444' : isLong ? '#eab308' : 'rgba(255, 255, 255, 0.9)',
                    }}
                    animate={isVeryLong ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ duration: 0.8, repeat: Infinity }}
                >
                    {formatTime(elapsed)}
                </motion.div>

                {/* Ref label */}
                <div
                    className="text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full ml-1"
                    style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(255, 255, 255, 0.4)',
                    }}
                >
                    REF
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
