'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface MapUpload {
    id: string;
    name: string;
    file: File;
    preview: string;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
}

export default function MapUploadPage() {
    const [maps, setMaps] = useState<MapUpload[]>([]);
    const [selectedGame, setSelectedGame] = useState('valorant');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);

        const newMaps: MapUpload[] = files.map((file, index) => ({
            id: `${Date.now()}-${index}`,
            name: file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '').replace(/-|_/g, ' '),
            file,
            preview: URL.createObjectURL(file),
            status: 'pending' as const,
            progress: 0,
        }));

        setMaps(prev => [...prev, ...newMaps]);
    };

    const handleUpload = async (mapId: string) => {
        setMaps(prev => prev.map(m =>
            m.id === mapId ? { ...m, status: 'uploading' as const, progress: 0 } : m
        ));

        // Simulate upload progress
        for (let progress = 0; progress <= 100; progress += 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setMaps(prev => prev.map(m =>
                m.id === mapId ? { ...m, progress } : m
            ));
        }

        setMaps(prev => prev.map(m =>
            m.id === mapId ? { ...m, status: 'success' as const, progress: 100 } : m
        ));
    };

    const handleUploadAll = async () => {
        const pendingMaps = maps.filter(m => m.status === 'pending');
        for (const map of pendingMaps) {
            await handleUpload(map.id);
        }
    };

    const handleRemove = (mapId: string) => {
        setMaps(prev => prev.filter(m => m.id !== mapId));
    };

    const handleNameChange = (mapId: string, name: string) => {
        setMaps(prev => prev.map(m =>
            m.id === mapId ? { ...m, name } : m
        ));
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white mb-2">Upload Map Images</h1>
                <p className="text-white/60">Upload map images to Supabase Storage for the veto interface</p>
            </div>

            {/* Game Selection */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Select Game</h2>
                <div className="flex gap-4">
                    {['valorant', 'cs2', 'cod'].map((game) => (
                        <button
                            key={game}
                            onClick={() => setSelectedGame(game)}
                            className={`px-6 py-3 rounded-xl text-sm font-medium uppercase transition-colors ${selectedGame === game
                                ? 'bg-purple-500 text-white'
                                : 'bg-white/10 text-white/60 hover:bg-white/20'
                                }`}
                        >
                            {game}
                        </button>
                    ))}
                </div>
            </div>

            {/* Upload Zone */}
            <div
                onClick={() => fileInputRef.current?.click()}
                className="glass rounded-2xl p-12 border-2 border-dashed border-white/20 hover:border-purple-500/50 transition-colors cursor-pointer text-center"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <div className="text-5xl mb-4">📁</div>
                <h3 className="text-xl font-semibold text-white mb-2">Drop map images here</h3>
                <p className="text-white/50">or click to browse</p>
                <p className="text-xs text-white/30 mt-4">Recommended: 1920x1080 WebP or PNG</p>
            </div>

            {/* Upload Queue */}
            {maps.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-2xl p-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Upload Queue ({maps.length})</h2>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setMaps([])}
                                className="px-4 py-2 text-sm border border-white/20 rounded-lg text-white/60 hover:text-white hover:border-white/40 transition-colors"
                            >
                                Clear All
                            </button>
                            <button
                                onClick={handleUploadAll}
                                disabled={maps.every(m => m.status !== 'pending')}
                                className="btn-primary px-4 py-2 text-sm rounded-lg disabled:opacity-50"
                            >
                                Upload All
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {maps.map((map) => (
                            <motion.div
                                key={map.id}
                                layout
                                className={`p-4 rounded-xl border ${map.status === 'success'
                                    ? 'bg-green-500/10 border-green-500/20'
                                    : 'bg-white/5 border-white/10'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    {/* Preview */}
                                    <div className="w-24 h-14 rounded-lg overflow-hidden bg-white/10 relative">
                                        <Image
                                            src={map.preview}
                                            alt={map.name}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>

                                    {/* Name Input */}
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={map.name}
                                            onChange={(e) => handleNameChange(map.id, e.target.value)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500/50"
                                            disabled={map.status !== 'pending'}
                                        />

                                        {/* Progress Bar */}
                                        {map.status === 'uploading' && (
                                            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-purple-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${map.progress}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {map.status === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => handleUpload(map.id)}
                                                    className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-300 text-sm transition-colors"
                                                >
                                                    Upload
                                                </button>
                                                <button
                                                    onClick={() => handleRemove(map.id)}
                                                    className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-sm transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            </>
                                        )}
                                        {map.status === 'uploading' && (
                                            <span className="text-sm text-white/50">{map.progress}%</span>
                                        )}
                                        {map.status === 'success' && (
                                            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                                                ✓ Uploaded
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Current Maps */}
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Current {selectedGame.toUpperCase()} Maps</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['Abyss', 'Bind', 'Breeze', 'Corrode', 'Haven', 'Pearl', 'Split'].map((mapName) => (
                        <div key={mapName} className="aspect-video rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <span className="text-white/40 text-sm">{mapName}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
