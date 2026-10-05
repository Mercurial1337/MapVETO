export type SoundCue = 'ready' | 'turn' | 'complete' | 'attention';

/** Small synthesized cues; one gesture-unlocked context and no audio downloads. */
export class NotificationSound {
    private context: AudioContext | null = null;
    private voices = new Set<OscillatorNode>();
    private disposed = false;
    private createContext: () => AudioContext;
    constructor(createContext: () => AudioContext) {this.createContext=createContext;}
    unlock() {
        if (this.disposed) return;
        try {
            this.context ??= this.createContext();
            if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
        } catch { /* Audio is optional on unsupported browsers. */ }
    }
    play(cue: SoundCue) {
        if (this.disposed || this.context?.state !== 'running') return;
        const ctx = this.context;
        const tones = cue === 'complete' ? [880,1320,1760] : cue === 'ready' ? [660,880] : cue === 'turn' ? [1500,2000] : [740];
        const now = ctx.currentTime;
        tones.forEach((pitch,index) => {
            const start = now + (cue === 'turn' ? 0 : index * 0.12);
            const oscillator = ctx.createOscillator(), gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(pitch,start);
            gain.gain.setValueAtTime(0,start);
            gain.gain.linearRampToValueAtTime(cue === 'turn' && index ? 0.06 : 0.16,start + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001,start + 0.25);
            oscillator.connect(gain); gain.connect(ctx.destination);
            this.voices.add(oscillator);
            oscillator.onended = () => {oscillator.disconnect();gain.disconnect();this.voices.delete(oscillator);};
            oscillator.start(start); oscillator.stop(start + 0.26);
        });
    }
    dispose() {
        this.disposed = true;
        for (const voice of this.voices) { try {voice.stop();} catch { /* Already ended. */ } }
        this.voices.clear();
        if (this.context) void this.context.close().catch(() => {});
        this.context = null;
    }
}
