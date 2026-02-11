'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, Type, Check, ArrowLeft, X, UserPlus, Trash2, Crown, Shield } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

interface EventFormData {
    name: string;
    logo_url: string;
    coin_image_url: string;
    custom_font_url: string;
    custom_font_name: string;
    google_sheet_id: string;
}

interface EventAdmin {
    id: string;
    user_id: string;
    email: string;
    role: string;
    created_at: string;
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function EditEventPage({ params }: PageProps) {
    const { id } = use(params);
    const router = useRouter();
    const [formData, setFormData] = useState<EventFormData>({
        name: '',
        logo_url: '',
        coin_image_url: '',
        custom_font_url: '',
        custom_font_name: '',
        google_sheet_id: '',
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | null>(null);

    // Admin management state
    const [admins, setAdmins] = useState<EventAdmin[]>([]);
    const [adminEmail, setAdminEmail] = useState('');
    const [adminError, setAdminError] = useState('');
    const [adminSuccess, setAdminSuccess] = useState('');
    const [isAddingAdmin, setIsAddingAdmin] = useState(false);
    const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

    // Fetch existing event data
    useEffect(() => {
        const fetchEvent = async () => {
            try {
                const response = await fetch(`/api/events/${id}`);
                if (response.ok) {
                    const data = await response.json();
                    setUserRole(data.role || 'owner');
                    setFormData({
                        name: data.event.name || '',
                        logo_url: data.event.logo_url || '',
                        coin_image_url: data.event.coin_image_url || '',
                        custom_font_url: data.event.custom_font_url || '',
                        custom_font_name: data.event.custom_font_name || '',
                        google_sheet_id: data.event.google_sheet_id || '',
                    });
                } else {
                    setError('Event not found');
                }
            } catch {
                setError('Failed to load event');
            }
            setIsLoading(false);
        };
        fetchEvent();
    }, [id]);

    // Fetch admins (owner only)
    const fetchAdmins = useCallback(async () => {
        try {
            const response = await fetch(`/api/events/${id}/admins`);
            if (response.ok) {
                const data = await response.json();
                setAdmins(data.admins || []);
            }
        } catch (err) {
            console.error('Error fetching admins:', err);
        }
    }, [id]);

    useEffect(() => {
        if (userRole === 'owner') {
            fetchAdmins();
        }
    }, [userRole, fetchAdmins]);

    const handleAddAdmin = async () => {
        if (!adminEmail.trim()) return;

        setIsAddingAdmin(true);
        setAdminError('');
        setAdminSuccess('');

        try {
            const response = await fetch(`/api/events/${id}/admins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: adminEmail.trim() }),
            });

            const data = await response.json();

            if (!response.ok) {
                setAdminError(data.error || 'Failed to add admin');
            } else {
                setAdminSuccess(`${adminEmail.trim()} has been added as an admin`);
                setAdminEmail('');
                fetchAdmins();
                // Clear success message after 3s
                setTimeout(() => setAdminSuccess(''), 3000);
            }
        } catch {
            setAdminError('Failed to add admin');
        }

        setIsAddingAdmin(false);
    };

    const handleRemoveAdmin = async (adminId: string) => {
        try {
            const response = await fetch(`/api/events/${id}/admins?adminId=${adminId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setAdmins(admins.filter(a => a.id !== adminId));
                setRemoveConfirm(null);
            }
        } catch (err) {
            console.error('Error removing admin:', err);
        }
    };

    const handleFileUpload = async (file: File, type: 'logo' | 'coin' | 'font') => {
        setUploading(type);
        setError('');

        try {
            const supabase = createClient();
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

    const handleRemoveAsset = (type: 'logo' | 'coin' | 'font') => {
        if (type === 'logo') {
            setFormData(prev => ({ ...prev, logo_url: '' }));
        } else if (type === 'coin') {
            setFormData(prev => ({ ...prev, coin_image_url: '' }));
        } else if (type === 'font') {
            setFormData(prev => ({ ...prev, custom_font_url: '', custom_font_name: '' }));
        }
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
            const response = await fetch(`/api/events/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    logo_url: formData.logo_url || null,
                    coin_image_url: formData.coin_image_url || null,
                    custom_font_url: formData.custom_font_url || null,
                    custom_font_name: formData.custom_font_name || null,
                    google_sheet_id: formData.google_sheet_id || null,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update event');
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
                            <button
                                type="button"
                                onClick={() => handleRemoveAsset(type)}
                                className="ml-2 p-1 hover:bg-red-500/20 rounded text-red-400"
                                title="Remove"
                            >
                                <X size={14} />
                            </button>
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 border-4 border-white/20 border-t-purple-500 rounded-full"
                />
            </div>
        );
    }

    // If user is an admin (not owner), they shouldn't be on this page
    if (userRole === 'admin') {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/admin/events" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ArrowLeft size={20} className="text-white/70" />
                    </Link>
                    <h1 className="text-2xl font-bold text-white">Event Details</h1>
                </div>
                <div className="glass rounded-xl p-6 text-center">
                    <Shield size={48} className="text-blue-400 mx-auto mb-4" />
                    <h2 className="text-lg font-semibold text-white mb-2">Admin Access Only</h2>
                    <p className="text-white/50 mb-4">
                        You are an admin for this event. You can manage matches and export data, but only the event owner can edit branding settings.
                    </p>
                    <Link href="/admin/events" className="btn-primary px-6 py-3 rounded-xl inline-block">
                        Back to Events
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/events" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <ArrowLeft size={20} className="text-white/70" />
                </Link>
                <h1 className="text-2xl font-bold text-white">Edit Event</h1>
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

                {/* Google Sheets Integration */}
                <div className="glass rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Google Sheets Export (Optional)</h2>
                    <label className="block text-sm text-white/60 mb-2">Default Google Sheet ID</label>
                    <input
                        type="text"
                        value={formData.google_sheet_id}
                        onChange={(e) => setFormData({ ...formData, google_sheet_id: e.target.value })}
                        placeholder="e.g. 1BxiMVs0XRA5nFMdKvBqfYH5_4z7qoR8s8..."
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                    />
                    <p className="text-xs text-white/30 mt-2">
                        When exporting matches from this event, this Sheet ID will be used by default.
                    </p>
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
                                Saving...
                            </span>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </form>

            {/* Manage Admins Section (Owner Only) */}
            {userRole === 'owner' && (
                <div className="mt-8 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Shield size={20} className="text-blue-400" />
                        Manage Event Admins
                    </h2>
                    <p className="text-sm text-white/50">
                        Event admins can view this event, manage matches, and export data. They cannot edit branding or delete the event.
                    </p>

                    {/* Add Admin Form */}
                    <div className="glass rounded-xl p-4">
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={adminEmail}
                                onChange={(e) => {
                                    setAdminEmail(e.target.value);
                                    setAdminError('');
                                }}
                                placeholder="Enter user's email address"
                                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddAdmin();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleAddAdmin}
                                disabled={isAddingAdmin || !adminEmail.trim()}
                                className="px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-400 text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAddingAdmin ? (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                        className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full"
                                    />
                                ) : (
                                    <UserPlus size={16} />
                                )}
                                Add
                            </button>
                        </div>

                        {adminError && (
                            <p className="mt-2 text-sm text-red-400">{adminError}</p>
                        )}
                        {adminSuccess && (
                            <p className="mt-2 text-sm text-green-400">{adminSuccess}</p>
                        )}
                    </div>

                    {/* Admin List */}
                    {admins.length > 0 && (
                        <div className="glass rounded-xl divide-y divide-white/10">
                            {admins.map((admin) => (
                                <div key={admin.id} className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                                            <Shield size={14} className="text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-white">{admin.email}</p>
                                            <p className="text-xs text-white/40">
                                                Added {new Date(admin.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    {removeConfirm === admin.id ? (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleRemoveAdmin(admin.id)}
                                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-xs text-white transition-colors"
                                            >
                                                Confirm
                                            </button>
                                            <button
                                                onClick={() => setRemoveConfirm(null)}
                                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setRemoveConfirm(admin.id)}
                                            className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                                            title="Remove admin"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {admins.length === 0 && (
                        <div className="glass rounded-xl p-6 text-center">
                            <p className="text-white/40 text-sm">No admins added yet. Add admins by their email address above.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
