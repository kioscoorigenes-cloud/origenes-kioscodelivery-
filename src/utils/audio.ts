/**
 * Web Audio API synthesizer for clean, reliable order alerts
 * to avoid loading fragile external URL audio files.
 */
export function playChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Soft, friendly chime using two sine wave oscillators
    const time = ctx.currentTime;
    
    // Tone 1: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, time);
    
    gain1.gain.setValueAtTime(0.15, time);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    // Tone 2: E5 (659.25 Hz) slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, time + 0.12);
    
    gain2.gain.setValueAtTime(0, time);
    gain2.gain.setValueAtTime(0.15, time + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc1.start(time);
    osc1.stop(time + 0.35);
    
    osc2.start(time + 0.12);
    osc2.stop(time + 0.5);
  } catch (error) {
    console.error("Synthesizer error:", error);
  }
}
