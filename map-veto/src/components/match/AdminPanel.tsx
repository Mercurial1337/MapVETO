'use client';

import { useState } from 'react';
import { Settings, RefreshCw, Dices } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminPanelProps {
    matchId: string;
    matchStatus: string;
    isPaused?: boolean;
    token: string;
}

export function AdminPanel({ matchId, matchStatus, isPaused, token }: AdminPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isForcing, setIsForcing] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const handleForceAction = async () => {
        if (!confirm('Force a random action for the current turn?')) return;
        setIsForcing(true);
        try {
            const res = await fetch('/api/veto/admin/force-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ match_id: matchId, token })
            });
            if (!res.ok) {
                const data = await res.json();
                alert('Error forcing action: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to force action');
        }
        setIsForcing(false);
        setIsOpen(false);
    };

    const handleResetVeto = async () => {
        if (!confirm('Are you sure you want to completely restart this veto? All progress will be lost.')) return;
        setIsResetting(true);
        try {
            const res = await fetch('/api/veto/admin/reset-veto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ match_id: matchId, token })
            });
            if (!res.ok) {
                const data = await res.json();
                alert('Error resetting veto: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            console.error(e);
            alert('Failed to reset veto');
        }
        setIsResetting(false);
        setIsOpen(false);
    };

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="absolute bottom-16 right-0 w-64 glass-dark border border-yellow-500/30 rounded-xl p-4 shadow-2xl flex flex-col gap-3"
                    >
                        <h3 className="text-yellow-400 font-bold text-sm uppercase tracking-wider mb-2 border-b border-yellow-500/20 pb-2">
                            Admin Controls
                        </h3>
                        
                        <button
                            onClick={handleForceAction}
                            disabled={isForcing || matchStatus !== 'in_progress'}
                            className="flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 p-2 rounded transition-colors disabled:opacity-50"
                        >
                            <Dices size={16} className="text-purple-400" />
                            {isForcing ? 'Forcing...' : 'Force Random Action'}
                        </button>

                        <button
                            onClick={async () => {
                                setIsForcing(true);
                                await fetch('/api/veto/admin/pause-veto', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ match_id: matchId, is_paused: !isPaused, token })
                                });
                                setIsForcing(false);
                            }}
                            className="flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 p-2 rounded transition-colors disabled:opacity-50 text-orange-300"
                        >
                            <Settings size={16} />
                            {isPaused ? 'Resume Veto' : 'Pause Veto'}
                        </button>

                        <button
                            onClick={handleResetVeto}
                            disabled={isResetting}
                            className="flex items-center gap-2 text-sm bg-red-500/10 hover:bg-red-500/20 p-2 rounded transition-colors text-red-400 disabled:opacity-50"
                        >
                            <RefreshCw size={16} />
                            {isResetting ? 'Resetting...' : 'Restart Veto entirely'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
            
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-3 rounded-full shadow-lg transition-colors flex items-center justify-center ${
                    isOpen ? 'bg-yellow-500 text-black' : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 backdrop-blur-md'
                }`}
            >
                <Settings size={24} />
            </button>
        </div>
    );
}
