'use client';

import { motion } from 'framer-motion';
import type { BannedMap, PickedMap, VetoActor } from '@/types';

interface ActionLogProps {
    bannedMaps: BannedMap[];
    pickedMaps: PickedMap[];
    teamAName: string;
    teamBName: string;
    mapNames: Record<string, string>; // map_id -> name
}

export function ActionLog({
    bannedMaps,
    pickedMaps,
    teamAName,
    teamBName,
    mapNames,
}: ActionLogProps) {
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

    // Build log entries in chronological order
    const entries: { type: 'ban' | 'pick' | 'side'; actor: VetoActor; mapName: string; side?: string; mapNumber?: number }[] = [];

    bannedMaps.forEach(ban => {
        entries.push({
            type: 'ban',
            actor: ban.banned_by,
            mapName: mapNames[ban.map_id] || 'Unknown',
        });
    });

    pickedMaps.forEach(pick => {
        entries.push({
            type: 'pick',
            actor: pick.picked_by,
            mapName: mapNames[pick.map_id] || 'Unknown',
            mapNumber: pick.map_number,
        });
        if (pick.side && pick.side_picked_by) {
            entries.push({
                type: 'side',
                actor: pick.side_picked_by,
                mapName: mapNames[pick.map_id] || 'Unknown',
                side: pick.side,
            });
        }
    });

    if (entries.length === 0) {
        return (
            <div className="text-center text-white/40 py-4">
                No actions yet
            </div>
        );
    }

    return (
        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
            {entries.map((entry, index) => (
                <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-2 text-sm"
                >
                    {/* Icon */}
                    <span className="w-5 text-center">
                        {entry.type === 'ban' && '🚫'}
                        {entry.type === 'pick' && '✅'}
                        {entry.type === 'side' && (entry.side === 'attack' ? '⚔️' : '🛡️')}
                    </span>

                    {/* Team Name */}
                    <span className={`font-medium ${getTeamColor(entry.actor)}`}>
                        {getTeamName(entry.actor)}
                    </span>

                    {/* Action */}
                    <span className="text-white/60">
                        {entry.type === 'ban' && 'banned'}
                        {entry.type === 'pick' && 'picked'}
                        {entry.type === 'side' && 'chose'}
                    </span>

                    {/* Map/Side */}
                    <span className="text-white font-medium">
                        {entry.type === 'side' ? (
                            <span className={entry.side === 'attack' ? 'text-red-400' : 'text-blue-400'}>
                                {entry.side === 'attack' ? 'Attack' : 'Defense'}
                            </span>
                        ) : (
                            entry.mapName
                        )}
                    </span>

                    {/* Map number for picks */}
                    {entry.type === 'pick' && entry.mapNumber && (
                        <span className="text-white/40 text-xs">
                            (Map {entry.mapNumber})
                        </span>
                    )}
                </motion.div>
            ))}
        </div>
    );
}
