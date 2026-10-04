'use client';

import { useState } from 'react';
import type { SideChoice } from '@/types';

interface SideSelectionModalProps {
    isOpen: boolean;
    mapName: string;
    teamName: string;
    onSelect: (side: SideChoice) => void;
    isSubmitting?: boolean;
}

export function SideSelectionModal({
    isOpen,
    mapName,
    teamName,
    onSelect,
    isSubmitting = false,
}: SideSelectionModalProps) {
    const [selectedSide, setSelectedSide] = useState<SideChoice | null>(null);

    const handleSelect = (side: SideChoice) => {
        setSelectedSide(prev => prev === side ? null : side);
    };

    const handleConfirm = () => {
        if (!selectedSide || isSubmitting) return;
        onSelect(selectedSide);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
            <div className="bg-[#111111] border border-white/10 rounded p-6  w-full max-w-sm text-center">
                <h2 className="text-xl font-bold text-white mb-1">Side Selection</h2>
                <p className="text-sm text-white/70 mb-4">
                    <span className="text-yellow-400 font-semibold">{teamName}</span> is choosing side for <span className="font-bold text-white">{mapName}</span>
                </p>

                <div className="flex gap-3 justify-center mb-4">
                    <button
                        onClick={() => handleSelect('attack')}
                        disabled={isSubmitting}
                        className={`flex-1 p-4 rounded border-2 transition-colors flex flex-col items-center ${
                            selectedSide === 'attack'
                                ? 'bg-red-500/20 border-red-500'
                                : 'bg-black/50 border-white/10 hover:border-red-400/50'
                        }`}
                    >
                        <span className="text-2xl mb-1">⚔️</span>
                        <span className={`font-bold ${selectedSide === 'attack' ? 'text-red-400' : 'text-white/80'}`}>ATTACK</span>
                    </button>

                    <button
                        onClick={() => handleSelect('defense')}
                        disabled={isSubmitting}
                        className={`flex-1 p-4 rounded border-2 transition-colors flex flex-col items-center ${
                            selectedSide === 'defense'
                                ? 'bg-blue-500/20 border-blue-500'
                                : 'bg-black/50 border-white/10 hover:border-blue-400/50'
                        }`}
                    >
                        <span className="text-2xl mb-1">🛡️</span>
                        <span className={`font-bold ${selectedSide === 'defense' ? 'text-blue-400' : 'text-white/80'}`}>DEFENSE</span>
                    </button>
                </div>

                {selectedSide && (
                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        className="w-full py-3 rounded font-bold text-black bg-white hover:bg-gray-200 transition-colors uppercase tracking-wider text-sm disabled:opacity-50"
                    >
                        {isSubmitting ? 'Confirming...' : 'Confirm Pick'}
                    </button>
                )}
            </div>
        </div>
    );
}
