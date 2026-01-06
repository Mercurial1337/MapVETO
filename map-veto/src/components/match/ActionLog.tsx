'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { BannedMap, PickedMap, VetoActor, VetoStep } from '@/types';

interface ActionLogProps {
    bannedMaps: BannedMap[];
    pickedMaps: PickedMap[];
    teamAName: string;
    teamBName: string;
    mapNames: Record<string, string>; // map_id -> name
    vetoSteps?: VetoStep[];
    currentStep?: number;
}

export function ActionLog({
    bannedMaps,
    pickedMaps,
    teamAName,
    teamBName,
    mapNames,
    vetoSteps = [],
    currentStep = 0,
}: ActionLogProps) {
    const [copied, setCopied] = useState(false);

    const getTeamName = (actor: VetoActor) => {
        switch (actor) {
            case 'team_a': return teamAName;
            case 'team_b': return teamBName;
            case 'system': return 'System';
            default: return actor;
        }
    };

    const getTeamColor = (actor: VetoActor) => {
        switch (actor) {
            case 'team_a': return 'text-red-400';
            case 'team_b': return 'text-blue-400';
            case 'system': return 'text-purple-400';
            default: return 'text-white';
        }
    };

    // Build log entries in chronological order based on veto steps
    type LogEntry = {
        type: 'ban' | 'pick' | 'side' | 'decider';
        actor: VetoActor;
        mapName: string;
        side?: string;
        mapNumber?: number;
        completed: boolean;
    };

    const entries: LogEntry[] = [];

    // Track which bans/picks we've processed
    let banIndex = 0;
    let pickIndex = 0;

    // Go through completed steps
    for (let i = 0; i < vetoSteps.length && i < currentStep; i++) {
        const step = vetoSteps[i];

        if (step.action === 'ban') {
            const ban = bannedMaps[banIndex];
            if (ban) {
                entries.push({
                    type: 'ban',
                    actor: ban.banned_by,
                    mapName: mapNames[ban.map_id] || 'Unknown',
                    completed: true,
                });
                banIndex++;
            }
        } else if (step.action === 'pick') {
            const pick = pickedMaps.find(p => p.map_number === step.map_number);
            if (pick) {
                entries.push({
                    type: 'pick',
                    actor: pick.picked_by,
                    mapName: mapNames[pick.map_id] || 'Unknown',
                    mapNumber: pick.map_number,
                    completed: true,
                });
                pickIndex++;
            }
        } else if (step.action === 'side') {
            const pick = pickedMaps.find(p => p.map_number === step.map_number);
            if (pick && pick.side) {
                entries.push({
                    type: 'side',
                    actor: pick.side_picked_by || step.actor,
                    mapName: mapNames[pick.map_id] || 'Unknown',
                    side: pick.side,
                    mapNumber: pick.map_number,
                    completed: true,
                });
            }
        } else if (step.action === 'decider') {
            const decider = pickedMaps.find(p => p.map_number === step.map_number);
            if (decider) {
                entries.push({
                    type: 'decider',
                    actor: 'system',
                    mapName: mapNames[decider.map_id] || 'Unknown',
                    mapNumber: decider.map_number,
                    completed: true,
                });
            }
        }
    }

    // Generate copy text in the requested format
    const generateCopyText = () => {
        const lines: string[] = [];

        entries.forEach(entry => {
            const teamName = getTeamName(entry.actor);

            if (entry.type === 'ban') {
                lines.push(`${teamName} bans ${entry.mapName}`);
            } else if (entry.type === 'pick') {
                lines.push(`${teamName} picks ${entry.mapName} (Map ${entry.mapNumber})`);
            } else if (entry.type === 'side') {
                const sideText = entry.side === 'attack' ? 'Attack' : 'Defense';
                lines.push(`${teamName} picks ${sideText} side for Map ${entry.mapNumber}`);
            } else if (entry.type === 'decider') {
                lines.push(`${entry.mapName} is the decider (Map ${entry.mapNumber})`);
            }
        });

        return lines.join('\n');
    };

    const handleCopy = async () => {
        const text = generateCopyText();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (entries.length === 0) {
        return (
            <div className="text-center text-white/40 py-4">
                No actions yet
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Copy Button */}
            <button
                onClick={handleCopy}
                className="mb-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white/70 hover:text-white transition-colors flex items-center gap-1.5 justify-center"
            >
                {copied ? (
                    <>
                        <span>✓</span>
                        <span>Copied!</span>
                    </>
                ) : (
                    <>
                        <span>📋</span>
                        <span>Copy Log</span>
                    </>
                )}
            </button>

            {/* Log Entries */}
            <div className="space-y-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {entries.map((entry, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-start gap-2 text-sm"
                    >
                        {/* Icon */}
                        <span className="w-5 text-center flex-shrink-0 mt-0.5">
                            {entry.type === 'ban' && '🚫'}
                            {entry.type === 'pick' && '✅'}
                            {entry.type === 'side' && (entry.side === 'attack' ? '⚔️' : '🛡️')}
                            {entry.type === 'decider' && '🎲'}
                        </span>

                        {/* Text */}
                        <div className="flex-1 leading-tight">
                            <span className={`font-medium ${getTeamColor(entry.actor)}`}>
                                {getTeamName(entry.actor)}
                            </span>
                            <span className="text-white/60">
                                {entry.type === 'ban' && ' bans '}
                                {entry.type === 'pick' && ' picks '}
                                {entry.type === 'side' && ' picks '}
                                {entry.type === 'decider' && ''}
                            </span>
                            <span className="text-white font-medium">
                                {entry.type === 'side' ? (
                                    <span className={entry.side === 'attack' ? 'text-red-400' : 'text-blue-400'}>
                                        {entry.side === 'attack' ? 'Attack' : 'Defense'}
                                    </span>
                                ) : entry.type === 'decider' ? (
                                    <span className="text-purple-400">{entry.mapName}</span>
                                ) : (
                                    entry.mapName
                                )}
                            </span>
                            {entry.mapNumber && entry.type !== 'side' && (
                                <span className="text-white/40 text-xs ml-1">
                                    (Map {entry.mapNumber})
                                </span>
                            )}
                            {entry.type === 'side' && entry.mapNumber && (
                                <span className="text-white/40 text-xs">
                                    {' '}for Map {entry.mapNumber}
                                </span>
                            )}
                            {entry.type === 'decider' && (
                                <span className="text-white/40 text-xs">
                                    {' '}is decider
                                </span>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
