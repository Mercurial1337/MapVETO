'use client';
import { useCallback, useEffect, useRef } from 'react';
import { CountdownSound } from '@/lib/veto/countdownSound';

export function useCountdownSound(enabled = true) {
    const sound = useRef<CountdownSound | null>(null);
    useEffect(() => {
        if (!enabled) return;
        const controller = new CountdownSound(() => new AudioContext());
        sound.current = controller;
        const unlock = () => controller.unlock();
        if (navigator.userActivation?.hasBeenActive) unlock();
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
        return () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            controller.dispose();
            sound.current = null;
        };
    }, [enabled]);
    const tick = useCallback((clock: string, seconds: number) => sound.current?.tick(clock, seconds), []);
    const stop = useCallback(() => sound.current?.stop(), []);
    return { tick, stop };
}
