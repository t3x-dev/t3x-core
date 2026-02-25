/**
 * SoundManager — Web Audio API synthesized sound effects.
 *
 * Off by default. Togglable via settings.
 * Pure oscillator synthesis, zero audio file downloads.
 */

const STORAGE_KEY = 't3x-sound-enabled';

class SoundManager {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  get enabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  set enabled(v: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(v));
  }

  /** Short low "thud" — sine sweep A3→A2, 80ms */
  playCommit(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.08); // A2

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  /** Ascending C major chord — C4, E4, G4, staggered 60ms */
  playMerge(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [262, 330, 392]; // C4, E4, G4
    const stagger = 0.06; // 60ms apart

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], ctx.currentTime + i * stagger);

      const start = ctx.currentTime + i * stagger;
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.2);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
}

export const sound = new SoundManager();
