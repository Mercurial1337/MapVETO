/** Short, lower-pitched click selected from the audio previews; no downloads. */
export class CountdownSound {
    private context: AudioContext | null = null;
    private lastTick = '';
    private voices = new Set<OscillatorNode>();
    private disposed = false;
    private createContext: () => AudioContext;

    constructor(createContext: () => AudioContext) {
        this.createContext = createContext;
    }

    // Called from a pointer/key gesture so browser autoplay rules are respected.
    unlock() {
        if (this.disposed) return;
        try {
            this.context ??= this.createContext();
            if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
        } catch { /* Audio may be unavailable; the visual countdown remains. */ }
    }

    tick(clock: string, seconds: number) {
        if (this.disposed || !clock || !Number.isInteger(seconds) || seconds < 1 || seconds > 15) return;
        const key = `${clock}:${seconds}`;
        if (key === this.lastTick || this.context?.state !== 'running') return;
        this.lastTick = key;
        const ctx = this.context;
        const now = ctx.currentTime;
        const pitch = seconds % 2 ? 650 : 520;
        for (const harmonic of [1, 1.48]) {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(pitch * harmonic, now);
            oscillator.frequency.exponentialRampToValueAtTime(pitch * harmonic * 0.75, now + 0.06);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime((seconds <= 5 ? 0.1125 : 0.09) / harmonic, now + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            this.voices.add(oscillator);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
                this.voices.delete(oscillator);
            };
            oscillator.start(now);
            oscillator.stop(now + 0.1);
        }
    }

    stop() {
        for (const voice of this.voices) {
            try { voice.stop(); } catch { /* Already finished. */ }
        }
        this.voices.clear();
    }

    dispose() {
        this.disposed = true;
        this.stop();
        if (this.context) void this.context.close().catch(() => {});
        this.context = null;
    }
}
