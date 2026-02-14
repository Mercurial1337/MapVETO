'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { MatchState, VetoActor } from '@/types';

interface UseActionSoundOptions {
    /** Current match state from realtime */
    state: MatchState | null;
    /** The current user's role */
    userRole: 'team_a' | 'team_b' | 'observer' | null;
    /** Whether the match is actively in progress */
    isInProgress: boolean;
}

/**
 * Plays a short notification sound when it becomes the user's turn,
 * signaling that the opponent has made their move.
 *
 * Uses Web Audio API to synthesize sounds — no external files needed.
 */
export function useActionSound({ state, userRole, isInProgress }: UseActionSoundOptions) {
    const prevStepRef = useRef<number | null>(null);
    const prevCompleteRef = useRef<boolean>(false);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const isInitialLoadRef = useRef(true);

    // Lazily create AudioContext (must be created after user gesture)
    const getAudioContext = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }
        return audioCtxRef.current;
    }, []);

    // Play "Alert Ping" notification sound — sharp, attention-grabbing ping
    const playNotificationSound = useCallback(() => {
        try {
            const ctx = getAudioContext();

            // Resume context if suspended (browser autoplay policy)
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;

            // Primary tone — sustained 1500Hz sine with sharp attack
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1500, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.35, now + 0.005);
            gain.gain.setValueAtTime(0.35, now + 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.45);

            // Upper harmonic — 2000Hz shimmer for brightness
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(2000, now);

            const gain2 = ctx.createGain();
            gain2.gain.setValueAtTime(0, now);
            gain2.gain.linearRampToValueAtTime(0.1, now + 0.005);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now);
            osc2.stop(now + 0.35);
        } catch {
            // Silently fail if audio isn't available
        }
    }, [getAudioContext]);

    // Play a completion sound (two ascending tones)
    const playCompletionSound = useCallback(() => {
        try {
            const ctx = getAudioContext();

            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;

            // First note
            const osc1 = ctx.createOscillator();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, now);

            const gain1 = ctx.createGain();
            gain1.gain.setValueAtTime(0, now);
            gain1.gain.linearRampToValueAtTime(0.25, now + 0.02);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.25);

            // Second note (higher, delayed)
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1320, now + 0.15);

            const gain2 = ctx.createGain();
            gain2.gain.setValueAtTime(0, now + 0.15);
            gain2.gain.linearRampToValueAtTime(0.25, now + 0.17);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);

            // Third note (even higher, delayed more)
            const osc3 = ctx.createOscillator();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(1760, now + 0.3);

            const gain3 = ctx.createGain();
            gain3.gain.setValueAtTime(0, now + 0.3);
            gain3.gain.linearRampToValueAtTime(0.3, now + 0.32);
            gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

            osc3.connect(gain3);
            gain3.connect(ctx.destination);
            osc3.start(now + 0.3);
            osc3.stop(now + 0.75);
        } catch {
            // Silently fail if audio isn't available
        }
    }, [getAudioContext]);

    useEffect(() => {
        if (!state || !isInProgress) return;

        const currentStep = state.current_step;
        const isComplete = state.is_complete;

        // Skip sound on initial load — we only want to play on actual state changes
        if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
            prevStepRef.current = currentStep;
            prevCompleteRef.current = isComplete;
            return;
        }

        // Check if veto just completed
        if (isComplete && !prevCompleteRef.current) {
            playCompletionSound();
            prevCompleteRef.current = isComplete;
            prevStepRef.current = currentStep;
            return;
        }

        // Check if step advanced
        if (prevStepRef.current !== null && currentStep !== prevStepRef.current) {
            // Determine if we should play the sound:
            // - For team users: play when it's now THEIR turn (opponent just moved)
            // - For observers: play on every step change
            const shouldPlay =
                userRole === 'observer' ||
                userRole === null ||
                state.current_turn === userRole;

            if (shouldPlay) {
                playNotificationSound();
            }
        }

        prevStepRef.current = currentStep;
        prevCompleteRef.current = isComplete;
    }, [state, state?.current_step, state?.is_complete, userRole, isInProgress, playNotificationSound, playCompletionSound]);

    // Cleanup AudioContext on unmount
    useEffect(() => {
        return () => {
            if (audioCtxRef.current) {
                audioCtxRef.current.close();
            }
        };
    }, []);
}
