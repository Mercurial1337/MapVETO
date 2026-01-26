'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, Type, Check, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface EventFormData {
    name: string;
    logo_url: string;
    coin_image_url: string;
    custom_font_url: string;
    custom_font_name: string;
}

export default function NewEventPage() {
    const router = useRouter();
    const [formData, setFormData] = useState<EventFormData>({
        name: '',
        logo_url: '',
        coin_image_url: '',
        custom_font_url: '',
        custom_font_name: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState<string | null>(null);

    const supabase = createClient();

    const handleFileUpload = async (file: File, type: 'logo' | 'coin' | 'font') => {
        setUploading(type);
        setError('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const fileExt = file.name.split('.').pop();
            const fileName = `${type}_${Date.now()}.${fileExt}`;
            const filePath = `events/${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('event-assets')
                .upload(filePath, file, { upsert: true });

            if (uploadError) {
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('event-assets')
                .getPublicUrl(filePath);

            if (type === 'logo') {
                setFormData(prev => ({ ...prev, logo_url: publicUrl }));
            } else if (type === 'coin') {
                setFormData(prev => ({ ...prev, coin_image_url: publicUrl }));
            } else if (type === 'font') {
                setFormData(prev => ({
                    ...prev,
                    custom_font_url: publicUrl,
                    custom_font_name: file.name.replace(/\.[^/.]+$/, ''),
                }));
            }
        } catch (err) {
            console.error('Upload error:', err);
            setError(`Failed to upload ${type}. Make sure the 'event-assets' storage bucket exists in Supabase.`);
        }

        setUploading(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setError('Event name is required');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    logo_url: formData.logo_url || null,
                    coin_image_url: formData.coin_image_url || null,
                    custom_font_url: formData.custom_font_url || null,
                    custom_font_name: formData.custom_font_name || null,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to create event');
            }

            router.push('/admin/events');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }

        setIsSubmitting(false);
    };

    const FileUploadBox = ({
        label,
        description,
        type,
        accept,
        currentUrl,
        icon: Icon,
    }: {
        label: string;
        description: string;
        type: 'logo' | 'coin' | 'font';
        accept: string;
        currentUrl: string;
        icon: typeof ImageIcon;
    }) => (
        <div className="glass rounded-xl p-4">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon size={24} className="text-purple-400" />
                </div>
                <div className="flex-1">
                    <h3 className="font-medium text-white mb-1">{label}</h3>
                    <p className="text-sm text-white/50 mb-3">{description}</p>

                    {currentUrl ? (
                        <div className="flex items-center gap-2">
                            <Check size={16} className="text-green-400" />
                            <span className="text-sm text-green-400">Uploaded</span>
                            {type !== 'font' && (
                                <img src={currentUrl} alt="" className="h-8 ml-2 rounded" />
                            )}
                        </div>
                    ) : (
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept={accept}
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, type);
                                }}
                                disabled={uploading !== null}
                            />
                            <div className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors">
                                {uploading === type ? (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                        className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full"
                                    />
                                ) : (
                                    <Upload size={16} />
                                )}
                                {uploading === type ? 'Uploading...' : 'Choose file'}
                            </div>
                        </label>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/events" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <ArrowLeft size={20} className="text-white/70" />
                </Link>
                <h1 className="text-2xl font-bold text-white">Create New Event</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Event Name */}
                <div className="glass rounded-xl p-6">
                    <label className="block text-sm text-white/60 mb-2">Event Name *</label>
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. VCT 2024 Playoffs"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                    />
                </div>

                {/* Branding Assets */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-white">Branding (Optional)</h2>

                    <FileUploadBox
                        label="Event Logo"
                        description="Replaces 'MAP VETO' text in header. Recommended: 200×50px, PNG with transparency"
                        type="logo"
                        accept="image/png,image/jpeg,image/webp"
                        currentUrl={formData.logo_url}
                        icon={ImageIcon}
                    />

                    <FileUploadBox
                        label="Coin Design"
                        description="Custom coin for coin toss animation. Recommended: 200×200px, PNG circular"
                        type="coin"
                        accept="image/png,image/jpeg,image/webp"
                        currentUrl={formData.coin_image_url}
                        icon={ImageIcon}
                    />

                    <FileUploadBox
                        label="Custom Font"
                        description="Font file for all text on match pages. Supports .woff2 or .ttf"
                        type="font"
                        accept=".woff2,.ttf,.woff"
                        currentUrl={formData.custom_font_url}
                        icon={Type}
                    />
                </div>

                {/* Submit */}
                <div className="flex gap-4">
                    <Link
                        href="/admin/events"
                        className="flex-1 px-6 py-4 border border-white/20 rounded-xl text-white text-center hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={isSubmitting || !formData.name.trim()}
                        className="flex-1 btn-primary py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <motion.span
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block"
                                />
                                Creating...
                            </span>
                        ) : (
                            'Create Event'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
