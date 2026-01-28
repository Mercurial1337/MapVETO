'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileSpreadsheet, Calendar, Image as ImageIcon, Check, AlertCircle } from 'lucide-react';

interface Event {
    id: string;
    name: string;
    google_sheet_id: string | null;
}

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
    const [events, setEvents] = useState<Event[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const [formData, setFormData] = useState({
        date_from: '',
        date_to: '',
        event_id: 'all',
        sheet_id: '',
    });

    useEffect(() => {
        if (isOpen) {
            fetchEvents();
            // Try to load last used sheet ID from localStorage
            const savedSheetId = localStorage.getItem('last_google_sheet_id');
            if (savedSheetId) {
                setFormData(prev => ({ ...prev, sheet_id: savedSheetId }));
            }
        }
    }, [isOpen]);

    const fetchEvents = async () => {
        setIsLoadingEvents(true);
        try {
            const response = await fetch('/api/events');
            if (response.ok) {
                const data = await response.json();
                setEvents(data.events || []);
            }
        } catch (err) {
            console.error('Error fetching events:', err);
        }
        setIsLoadingEvents(false);
    };

    const handleExport = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsExporting(true);
        setExportStatus(null);

        try {
            const response = await fetch('/api/admin/export/google-sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (response.ok) {
                setExportStatus({ type: 'success', message: `Successfully exported ${data.count || 0} matches!` });
                localStorage.setItem('last_google_sheet_id', formData.sheet_id);
            } else {
                setExportStatus({ type: 'error', message: data.error || 'Export failed' });
            }
        } catch (err) {
            setExportStatus({ type: 'error', message: 'Network error. Please try again.' });
        }
        setIsExporting(false);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-lg glass rounded-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between p-6 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                                <FileSpreadsheet className="text-green-400" size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Export to Google Sheets</h2>
                                <p className="text-xs text-white/40 uppercase tracking-wider">Reports & Analytics</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleExport} className="p-6 space-y-6">
                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm text-white/60">From Date</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={formData.date_from}
                                        onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500/50 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm text-white/60">To Date</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={formData.date_to}
                                        onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500/50 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Event Selection */}
                        <div className="space-y-2">
                            <label className="text-sm text-white/60">Event Filter</label>
                            <select
                                value={formData.event_id}
                                onChange={(e) => {
                                    const selectedEventId = e.target.value;
                                    const selectedEvent = events.find(ev => ev.id === selectedEventId);
                                    setFormData(prev => ({
                                        ...prev,
                                        event_id: selectedEventId,
                                        // Auto-populate sheet_id from event if available
                                        sheet_id: selectedEvent?.google_sheet_id || prev.sheet_id,
                                    }));
                                }}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500/50 text-sm"
                            >
                                <option value="all">All Events</option>
                                {events.map(event => (
                                    <option key={event.id} value={event.id}>{event.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Google Sheet ID */}
                        <div className="space-y-2">
                            <label className="text-sm text-white/60 flex items-center justify-between">
                                <span>Google Sheet ID</span>
                                <a
                                    href="https://support.google.com/docs/answer/44660?hl=en"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-green-400 hover:underline"
                                >
                                    How to find?
                                </a>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Paste spreadsheet ID here..."
                                value={formData.sheet_id}
                                onChange={(e) => setFormData({ ...formData, sheet_id: e.target.value })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-green-500/50 text-sm"
                            />
                            <p className="text-[10px] text-white/30">
                                Tip: Make sure the sheet is shared with the service account email.
                            </p>
                        </div>

                        {exportStatus && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`p-4 rounded-xl flex items-start gap-3 ${exportStatus.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                    }`}
                            >
                                {exportStatus.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                                <p className="text-sm">{exportStatus.message}</p>
                            </motion.div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isExporting || !formData.sheet_id}
                                className="flex-[2] px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isExporting ? (
                                    <>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                                        />
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <FileSpreadsheet size={18} />
                                        Export Data
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
