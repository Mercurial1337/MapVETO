'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface SheetMatch {
    id: string;
    teamA: string;
    teamB: string;
    scheduledAt: string;
    format: string;
    status: 'pending' | 'imported' | 'error';
}

export default function GoogleSheetsSyncPage() {
    const [sheetUrl, setSheetUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [matches, setMatches] = useState<SheetMatch[]>([]);
    const [importedCount, setImportedCount] = useState(0);

    const handleSync = async () => {
        if (!sheetUrl) return;

        setIsLoading(true);

        // Simulate API call to parse Google Sheet
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Mock parsed data from Google Sheet
        const mockMatches: SheetMatch[] = [
            { id: '1', teamA: 'Cloud9', teamB: 'NRG', scheduledAt: '2026-01-06T18:00', format: 'bo3', status: 'pending' },
            { id: '2', teamA: 'Fnatic', teamB: 'Team Liquid', scheduledAt: '2026-01-06T20:00', format: 'bo3', status: 'pending' },
            { id: '3', teamA: 'Sentinels', teamB: 'DRX', scheduledAt: '2026-01-06T22:00', format: 'bo5', status: 'pending' },
            { id: '4', teamA: '100 Thieves', teamB: 'LOUD', scheduledAt: '2026-01-07T16:00', format: 'bo3', status: 'pending' },
            { id: '5', teamA: 'G2', teamB: 'Heretics', scheduledAt: '2026-01-07T18:00', format: 'bo3', status: 'pending' },
        ];

        setMatches(mockMatches);
        setIsLoading(false);
    };

    const handleImport = async (matchId: string) => {
        setMatches(prev => prev.map(m =>
            m.id === matchId ? { ...m, status: 'imported' as const } : m
        ));
        setImportedCount(prev => prev + 1);
    };

    const handleImportAll = async () => {
        setMatches(prev => prev.map(m => ({ ...m, status: 'imported' as const })));
        setImportedCount(matches.length);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white mb-2">Google Sheets Sync</h1>
                <p className="text-white/60">Import match schedules directly from Google Sheets</p>
            </div>

            {/* Sheet URL Input */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Connect Sheet</h2>

                <div className="flex gap-4">
                    <input
                        type="url"
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                    />
                    <button
                        onClick={handleSync}
                        disabled={isLoading || !sheetUrl}
                        className="btn-primary px-6 py-3 rounded-xl disabled:opacity-50"
                    >
                        {isLoading ? 'Syncing...' : 'Sync'}
                    </button>
                </div>

                <div className="mt-4 p-4 bg-white/5 rounded-xl">
                    <h3 className="text-sm font-medium text-white/80 mb-2">Expected Sheet Format</h3>
                    <div className="overflow-x-auto">
                        <table className="text-xs text-white/50">
                            <thead>
                                <tr className="text-left">
                                    <th className="pr-4">Column A</th>
                                    <th className="pr-4">Column B</th>
                                    <th className="pr-4">Column C</th>
                                    <th className="pr-4">Column D</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="pr-4 text-white/70">Team A</td>
                                    <td className="pr-4 text-white/70">Team B</td>
                                    <td className="pr-4 text-white/70">Date/Time</td>
                                    <td className="pr-4 text-white/70">Format (bo1/bo3/bo5)</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Parsed Matches */}
            {matches.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-white">Parsed Matches</h2>
                            <p className="text-sm text-white/50">
                                {importedCount} of {matches.length} imported
                            </p>
                        </div>
                        <button
                            onClick={handleImportAll}
                            disabled={importedCount === matches.length}
                            className="btn-primary px-4 py-2 text-sm rounded-lg disabled:opacity-50"
                        >
                            Import All
                        </button>
                    </div>

                    <div className="space-y-3">
                        {matches.map((match) => (
                            <motion.div
                                key={match.id}
                                layout
                                className={`p-4 rounded-xl border ${match.status === 'imported'
                                        ? 'bg-green-500/10 border-green-500/20'
                                        : 'bg-white/5 border-white/10'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div>
                                            <span className="text-white font-medium">{match.teamA}</span>
                                            <span className="text-white/40 mx-2">vs</span>
                                            <span className="text-white font-medium">{match.teamB}</span>
                                        </div>
                                        <span className="text-white/50 text-sm uppercase">{match.format}</span>
                                        <span className="text-white/40 text-sm">
                                            {new Date(match.scheduledAt).toLocaleString()}
                                        </span>
                                    </div>

                                    {match.status === 'imported' ? (
                                        <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                                            ✓ Imported
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleImport(match.id)}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
                                        >
                                            Import
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Help Section */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Setup Instructions</h2>
                <ol className="space-y-3 text-sm text-white/60">
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">1</span>
                        <span>Create a Google Sheet with columns: Team A, Team B, Date/Time, Format</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">2</span>
                        <span>Share the sheet with &ldquo;Anyone with the link can view&rdquo;</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">3</span>
                        <span>Paste the share link above and click Sync</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">4</span>
                        <span>Review and import matches one by one or all at once</span>
                    </li>
                </ol>
            </div>
        </div>
    );
}
