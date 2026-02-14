'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { MatchState, VetoStep, VetoActor } from '@/types';

interface VoiceCueOptions {
    /** Current match state from realtime */
    state: MatchState | null;
    /** The veto template steps */
    templateSteps: VetoStep[];
    /** The user's role (team_a, team_b, observer) */
    userRole: 'team_a' | 'team_b' | 'observer' | null;
    /** Map ID to name lookup */
    mapNames: Record<string, string>;
    /** Real team names from the match */
    teamAName: string;
    teamBName: string;
    /** Whether the match is in progress */
    isInProgress: boolean;
    /** Whether voice cues are enabled */
    enabled: boolean;
}

/**
 * Hook that provides voice cue announcements when the opposing team
 * performs a pick/ban action, and when it becomes your turn.
 * Uses the Web Speech Synthesis API (no audio files needed).
 */
export function useVoiceCues({
    state,
    templateSteps,
    userRole,
    mapNames,
    teamAName,
    teamBName,
    isInProgress,
    enabled,
}: VoiceCueOptions) {
    // Track previous state to detect changes
    const prevStateRef = useRef<{
        currentStep: number;
        bannedCount: number;
        pickedCount: number;
        isComplete: boolean;
    } | null>(null);

    // Track if initial load has happened (don't announce on first load)
    const isInitialLoadRef = useRef(true);

    // Volume control
    const [volume, setVolume] = useState(1.0);

    // Speak a message using Web Speech Synthesis API
    const speak = useCallback((message: string) => {
        if (!enabled || typeof window === 'undefined') return;
        if (!('speechSynthesis' in window)) {
            console.warn('Speech Synthesis not supported in this browser.');
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = volume;

        // Try to use a clear English voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
            (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Natural'))
        ) || voices.find((v) => v.lang.startsWith('en'));

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        window.speechSynthesis.speak(utterance);
    }, [enabled, volume]);

    // Get team name from actor
    const getTeamName = useCallback((actor: VetoActor) => {
        if (actor === 'team_a') return teamAName;
        if (actor === 'team_b') return teamBName;
        return 'System';
    }, [teamAName, teamBName]);

    // Detect state changes and announce
    useEffect(() => {
        if (!state || !isInProgress || !enabled) return;

        const currentSnapshot = {
            currentStep: state.current_step,
            bannedCount: state.banned_maps.length,
            pickedCount: state.picked_maps.length,
            isComplete: state.is_complete,
        };

        // Skip first load
        if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
            prevStateRef.current = currentSnapshot;
            return;
        }

        const prev = prevStateRef.current;
        if (!prev) {
            prevStateRef.current = currentSnapshot;
            return;
        }

        // Detect what changed
        const stepChanged = currentSnapshot.currentStep !== prev.currentStep;
        const newBan = currentSnapshot.bannedCount > prev.bannedCount;
        const newPick = currentSnapshot.pickedCount > prev.pickedCount;

        if (stepChanged || newBan || newPick) {
            // Figure out what the PREVIOUS step was (the action that just completed)
            const completedStepIndex = prev.currentStep;
            const completedStep = templateSteps[completedStepIndex];

            if (completedStep) {
                const actor = completedStep.actor;
                const actionVerb =
                    completedStep.action === 'ban'
                        ? 'banned'
                        : completedStep.action === 'pick'
                            ? 'picked'
                            : completedStep.action === 'side'
                                ? 'chose side on'
                                : completedStep.action === 'decider'
                                    ? 'decider map is'
                                    : '';

                // Find the map that was just acted upon
                let mapName = '';
                if (newBan) {
                    const lastBan = state.banned_maps[state.banned_maps.length - 1];
                    if (lastBan) {
                        mapName = mapNames[lastBan.map_id] || 'a map';
                    }
                } else if (newPick) {
                    const lastPick = state.picked_maps[state.picked_maps.length - 1];
                    if (lastPick) {
                        mapName = mapNames[lastPick.map_id] || 'a map';
                    }
                }

                // Build the announcement for the completed action
                const teamName = getTeamName(actor);

                if (completedStep.action === 'decider') {
                    speak(`Decider map is ${mapName}`);
                } else if (completedStep.action === 'side') {
                    // For side selection, find which side was picked
                    const lastPickWithSide = state.picked_maps.find(
                        (pm) => pm.map_number === completedStep.map_number && pm.side
                    );
                    const sideName = lastPickWithSide?.side === 'attack' ? 'Attack' : 'Defense';
                    speak(`${teamName} chose ${sideName} on ${mapName || `map ${completedStep.map_number}`}`);
                } else if (mapName) {
                    speak(`${teamName} ${actionVerb} ${mapName}`);
                }

                // Announce if it's now the user's turn (after a slight delay)
                if (!state.is_complete && state.current_turn === userRole) {
                    const nextStep = templateSteps[state.current_step];
                    if (nextStep) {
                        const nextAction = nextStep.action === 'ban' ? 'ban' : nextStep.action === 'pick' ? 'pick' : nextStep.action === 'side' ? 'choose a side' : '';
                        if (nextAction) {
                            setTimeout(() => {
                                speak(`Your turn to ${nextAction}`);
                            }, 1500);
                        }
                    }
                }
            }

            // Check for completion
            if (currentSnapshot.isComplete && !prev.isComplete) {
                setTimeout(() => {
                    speak('Veto complete');
                }, 1500);
            }
        }

        prevStateRef.current = currentSnapshot;
    }, [state, templateSteps, userRole, mapNames, getTeamName, speak, isInProgress, enabled]);

    // Preload voices on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            // Chrome requires this to load voices
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }
    }, []);

    return {
        volume,
        setVolume,
        speak, // Exposed for manual testing
    };
}
