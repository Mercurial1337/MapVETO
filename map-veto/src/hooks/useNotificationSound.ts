'use client';
import {useCallback,useEffect,useRef} from 'react';
import {NotificationSound,type SoundCue} from '@/lib/veto/notificationSound';

export function useNotificationSound(enabled:boolean) {
    const sound = useRef<NotificationSound|null>(null);
    useEffect(() => {
        if (!enabled) return;
        const controller = new NotificationSound(() => new AudioContext());
        sound.current = controller;
        const unlock = () => controller.unlock();
        if (navigator.userActivation?.hasBeenActive) unlock();
        window.addEventListener('pointerdown',unlock,true);
        window.addEventListener('keydown',unlock,true);
        return () => {
            window.removeEventListener('pointerdown',unlock,true);
            window.removeEventListener('keydown',unlock,true);
            controller.dispose(); sound.current = null;
        };
    },[enabled]);
    return useCallback((cue:SoundCue) => sound.current?.play(cue),[]);
}
