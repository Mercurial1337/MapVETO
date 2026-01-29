'use client';

import { motion } from 'framer-motion';
import type { VetoStep } from '@/types';

interface TimelineStep extends VetoStep {
    completed?: boolean;
    map_name?: string;
    side_choice?: string;
}

interface VetoTimelineProps {
    steps: TimelineStep[];
    currentStep: number;
    teamAName: string;
    teamBName: string;
}

function cn(...classes: (string | boolean | undefined)[]) {
    return classes.filter(Boolean).join(' ');
}

function getStepIcon(action: string): string {
    switch (action) {
        case 'ban':
            return '🚫';
        case 'pick':
            return '✅';
        case 'side':
            return '⚔️';
        case 'decider':
            return '🎲';
        default:
            return '•';
    }
}

function getActorLabel(actor: string, teamAName: string, teamBName: string): string {
    switch (actor) {
        case 'team_a':
            return teamAName;
        case 'team_b':
            return teamBName;
        case 'system':
            return 'Auto';
        default:
            return actor;
    }
}

export function VetoTimeline({ steps, currentStep, teamAName, teamBName }: VetoTimelineProps) {
    return (
        <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-3 min-w-max px-6 py-8">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep;
                    const isCurrent = index === currentStep;
                    const isPending = index > currentStep;

                    return (
                        <div key={step.step} className="flex items-center">
                            {/* Step Node */}
                            <motion.div
                                initial={false}
                                animate={{
                                    scale: isCurrent ? 1.15 : 1,
                                }}
                                className="relative flex flex-col items-center w-20 md:w-24"
                            >
                                {/* Icon Circle */}
                                <motion.div
                                    initial={false}
                                    animate={{
                                        backgroundColor: isCompleted
                                            ? 'rgb(34 197 94)'
                                            : isCurrent
                                                ? 'rgb(234 179 8)'
                                                : 'rgb(55 65 81)',
                                    }}
                                    className={cn(
                                        'w-12 h-12 rounded-full flex items-center justify-center text-xl',
                                        'relative z-10',
                                        isCurrent && 'border-2 border-yellow-400'
                                    )}
                                >
                                    <span className="relative z-10">{getStepIcon(step.action)}</span>
                                </motion.div>

                                {/* Step Action Label */}
                                <motion.span
                                    className={cn(
                                        'mt-2 text-xs font-bold uppercase tracking-wider text-center',
                                        isCompleted && 'text-green-400',
                                        isCurrent && 'text-yellow-400',
                                        isPending && 'text-gray-500'
                                    )}
                                >
                                    {step.action}
                                </motion.span>

                                {/* Actor Label */}
                                <span
                                    className={cn(
                                        'text-[10px] text-center mt-1 max-w-full truncate',
                                        isCompleted && 'text-green-300/70',
                                        isCurrent && 'text-yellow-300/70',
                                        isPending && 'text-gray-500/70'
                                    )}
                                >
                                    {getActorLabel(step.actor, teamAName, teamBName)}
                                </span>

                                {/* Result (if completed) */}
                                {isCompleted && step.map_name && (
                                    <motion.span
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-1 text-[10px] text-white/60 font-medium max-w-full truncate"
                                    >
                                        {step.map_name}
                                    </motion.span>
                                )}

                                {/* Side choice result */}
                                {isCompleted && step.side_choice && (
                                    <motion.span
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            'mt-1 text-[10px] font-medium uppercase',
                                            step.side_choice === 'attack' ? 'text-red-400' : 'text-cyan-400'
                                        )}
                                    >
                                        {step.side_choice}
                                    </motion.span>
                                )}
                            </motion.div>

                            {/* Connector Line */}
                            {index < steps.length - 1 && (
                                <div className="relative h-1 w-8 md:w-12 mx-1">
                                    {/* Background line */}
                                    <div className="absolute inset-0 bg-gray-700 rounded-full" />
                                    {/* Progress line */}
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: isCompleted ? '100%' : '0%',
                                        }}
                                        transition={{ duration: 0.3, delay: 0.1 }}
                                        className="absolute inset-y-0 left-0 bg-green-500 rounded-full"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface TurnIndicatorProps {
    currentStep: VetoStep | null;
    teamAName: string;
    teamBName: string;
    isMyTurn: boolean;
    timeRemaining?: number;
}

export function TurnIndicator({
    currentStep,
    teamAName,
    teamBName,
    isMyTurn,
    timeRemaining,
}: TurnIndicatorProps) {
    if (!currentStep) return null;

    const actorName = getActorLabel(currentStep.actor, teamAName, teamBName);
    const actionVerb =
        currentStep.action === 'ban'
            ? 'BANNING'
            : currentStep.action === 'pick'
                ? 'PICKING'
                : currentStep.action === 'side'
                    ? 'CHOOSING SIDE'
                    : 'DECIDING';

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'flex items-center gap-4 px-8 py-4 rounded-2xl',
                'bg-black/80 backdrop-blur-xl border-2',
                isMyTurn ? 'border-yellow-400' : 'border-white/20'
            )}
        >
            {/* Indicator dot */}
            <motion.div
                animate={
                    isMyTurn
                        ? {
                            scale: [1, 1.2, 1],
                            opacity: [1, 0.7, 1],
                        }
                        : {}
                }
                transition={{ duration: 1, repeat: Infinity }}
                className={cn(
                    'w-3 h-3 rounded-full',
                    isMyTurn ? 'bg-yellow-400' : 'bg-white/50'
                )}
            />

            {/* Turn info */}
            <div className="flex flex-col">
                <span className="text-sm text-white/60 uppercase tracking-wider">
                    {isMyTurn ? 'Your Turn' : 'Waiting for'}
                </span>
                <span className="text-xl font-bold text-white">
                    {actorName} <span className="text-yellow-400">{actionVerb}</span>
                </span>
            </div>

            {/* Timer */}
            {timeRemaining !== undefined && (
                <motion.div
                    animate={timeRemaining <= 10 ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className={cn(
                        'ml-4 px-4 py-2 rounded-xl font-mono text-2xl font-bold',
                        timeRemaining <= 10 ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'
                    )}
                >
                    {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </motion.div>
            )}
        </motion.div>
    );
}
