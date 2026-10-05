/** Short, synthesized tick/tock: no audio download or additional network requests. */
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
        const pitch = seconds % 2 ? 1850 : 1450;
        for (const harmonic of [1, 1.8]) {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(pitch * harmonic, now);
            oscillator.frequency.exponentialRampToValueAtTime(pitch * harmonic * 0.6, now + 0.045);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime((seconds <= 5 ? 0.09 : 0.06) / harmonic, now + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            this.voices.add(oscillator);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
                this.voices.delete(oscillator);
            };
            oscillator.start(now);
            oscillator.stop(now + 0.06);
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
