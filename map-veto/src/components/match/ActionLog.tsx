'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { MatchLog, VetoActor } from '@/types';
import { Ban, Check, Swords, Shield, Dices, Copy, Play, UserCheck, Settings, Coins } from 'lucide-react';

interface ActionLogProps {
    logs: MatchLog[];
    dbTeamAName: string;
    dbTeamBName: string;
    displayTeam1Name: string;
    displayTeam2Name: string;
    mapNames: Record<string, string>; // map_id -> name
}

export function ActionLog({
    logs,
    dbTeamAName,
    dbTeamBName,
    displayTeam1Name,
    displayTeam2Name,
    mapNames,
}: ActionLogProps) {
    const [copied, setCopied] = useState(false);

    // Get the actual team name from database team identifier
    const getTeamName = (actor: VetoActor | string) => {
        switch (actor) {
            case 'team_a': return dbTeamAName;
            case 'team_b': return dbTeamBName;
            case 'system': return 'System';
            case 'admin': return 'Admin';
            default: return String(actor);
        }
    };

    // Get color based on displayed position (Team 1 = red, Team 2 = blue)
    const getTeamColor = (actor: VetoActor | string) => {
        if (actor === 'admin') return 'text-yellow-400';
        const teamName = getTeamName(actor);
        if (teamName === displayTeam1Name) return 'text-red-400';
        if (teamName === displayTeam2Name) return 'text-blue-400';
        if (actor === 'system') return 'text-purple-400';
        return 'text-white';
    };

    const getIcon = (type: string, side?: string) => {
        switch (type) {
            case 'ban': return <Ban size={16} className="text-red-400" />;
            case 'pick': return <Check size={16} className="text-green-400" />;
            case 'side': return side === 'attack' ? <Swords size={16} className="text-red-400" /> : <Shield size={16} className="text-blue-400" />;
            case 'decider': return <Dices size={16} className="text-purple-400" />;
            case 'ready_check': return <UserCheck size={16} className="text-green-300" />;
            case 'coin_toss': return <Coins size={16} className="text-yellow-400" />;
            case 'position_choice': return <UserCheck size={16} className="text-blue-300" />;
            case 'admin_action': return <Settings size={16} className="text-yellow-400" />;
            default: return <Play size={16} className="text-white/40" />;
        }
    };

    // Generate copy text in the requested format
    const generateCopyText = () => {
        const lines: string[] = [];

        logs.forEach(entry => {
            const teamName = getTeamName(entry.actor);
            const isAuto = entry.metadata?.is_auto;
            const autoText = isAuto ? ' [Auto-assigned]' : '';
            const mapName = entry.map_id ? mapNames[entry.map_id] || 'Unknown Map' : '';

            if (entry.action_type === 'ready_check') {
                lines.push(`${teamName} is ready`);
            } else if (entry.action_type === 'coin_toss') {
                lines.push(`Coin toss won by ${teamName}${entry.metadata?.is_seeded ? ' (Seeded)' : ''}`);
            } else if (entry.action_type === 'position_choice') {
                const choiceText = entry.metadata?.pick_first ? 'Team A (First)' : 'Team B (Second)';
                lines.push(`${teamName} chooses ${choiceText}`);
            } else if (entry.action_type === 'ban') {
                lines.push(`${teamName} bans ${mapName}${autoText}`);
            } else if (entry.action_type === 'pick') {
                const mapNumText = entry.metadata?.map_number ? ` (Map ${entry.metadata.map_number})` : '';
                lines.push(`${teamName} picks ${mapName}${mapNumText}${autoText}`);
            } else if (entry.action_type === 'side') {
                const sideText = entry.side_choice === 'attack' ? 'Attack' : 'Defense';
                const mapNumText = entry.metadata?.map_number ? ` (Map ${entry.metadata.map_number})` : '';
                lines.push(`${teamName} picks ${sideText} side for ${mapName}${mapNumText}${autoText}`);
            } else if (entry.action_type === 'decider') {
                const mapNumText = entry.metadata?.map_number ? ` (Map ${entry.metadata.map_number})` : '';
                lines.push(`${mapName} is the decider${mapNumText}`);
            } else if (entry.action_type === 'admin_action') {
                lines.push(`[ADMIN] ${entry.metadata?.action_details || 'Action taken'}`);
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

    if (!logs || logs.length === 0) {
        return (
            <div className="text-center text-white/40 py-4">
                No actions yet
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full max-h-[400px]">
            {/* Copy Button */}
            <button
                onClick={handleCopy}
                className="mb-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white/70 hover:text-white transition-colors flex items-center gap-1.5 justify-center flex-shrink-0"
            >
                {copied ? (
                    <>
                        <Check size={14} />
                        <span>Copied!</span>
                    </>
                ) : (
                    <>
                        <Copy size={14} />
                        <span>Copy Log</span>
                    </>
                )}
            </button>

            {/* Log Entries */}
            <div className="space-y-3 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-2">
                {logs.map((entry, index) => {
                    const mapName = entry.map_id ? mapNames[entry.map_id] || 'Unknown' : '';
                    const isAuto = entry.metadata?.is_auto;
                    const mapNumber = entry.metadata?.map_number;

                    return (
                        <motion.div
                            key={entry.id || index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex items-start gap-2 text-sm"
                        >
                            {/* Icon */}
                            <span className="w-5 text-center flex-shrink-0 mt-0.5">
                                {getIcon(entry.action_type, entry.side_choice || undefined)}
                            </span>

                            {/* Text */}
                            <div className="flex-1 leading-tight break-words">
                                <span className={`font-medium ${getTeamColor(entry.actor)} mr-1`}>
                                    {getTeamName(entry.actor)}
                                </span>
                                
                                {entry.action_type === 'ready_check' && (
                                    <span className="text-white/60">is ready</span>
                                )}
                                
                                {entry.action_type === 'coin_toss' && (
                                    <span className="text-white/60">won the coin toss {entry.metadata?.is_seeded ? '(seeded)' : ''}</span>
                                )}

                                {entry.action_type === 'position_choice' && (
                                    <>
                                        <span className="text-white/60">chooses </span>
                                        <span className="text-white font-medium">{entry.metadata?.pick_first ? 'Team A (First)' : 'Team B (Second)'}</span>
                                    </>
                                )}
                                
                                {entry.action_type === 'ban' && (
                                    <>
                                        <span className="text-white/60">bans </span>
                                        <span className="text-white font-medium">{mapName}</span>
                                    </>
                                )}
                                
                                {entry.action_type === 'pick' && (
                                    <>
                                        <span className="text-white/60">picks </span>
                                        <span className="text-white font-medium">{mapName}</span>
                                        {mapNumber && <span className="text-white/40 text-xs ml-1">(Map {mapNumber})</span>}
                                    </>
                                )}
                                
                                {entry.action_type === 'side' && (
                                    <>
                                        <span className="text-white/60">picks </span>
                                        <span className={entry.side_choice === 'attack' ? 'text-red-400 font-medium' : 'text-blue-400 font-medium'}>
                                            {entry.side_choice === 'attack' ? 'Attack' : 'Defense'}
                                        </span>
                                        <span className="text-white/60"> for {mapName}</span>
                                        {mapNumber && <span className="text-white/40 text-xs ml-1">(Map {mapNumber})</span>}
                                    </>
                                )}
                                
                                {entry.action_type === 'decider' && (
                                    <>
                                        <span className="text-white/60">leaves </span>
                                        <span className="text-purple-400 font-medium">{mapName}</span>
                                        <span className="text-white/60"> as decider</span>
                                        {mapNumber && <span className="text-white/40 text-xs ml-1">(Map {mapNumber})</span>}
                                    </>
                                )}
                                
                                {entry.action_type === 'admin_action' && (
                                    <span className="text-yellow-400/80">{entry.metadata?.action_details || 'Admin action'}</span>
                                )}

                                {isAuto && (
                                    <span className="text-yellow-400/80 text-xs font-semibold uppercase tracking-wider ml-1">
                                        (Random)
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
