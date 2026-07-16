let ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0) {
  const c = ac(), t = c.currentTime + delay
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur)
}

export function playCorrect() {
  tone(523, 0.12, 'sine', 0.22)
  tone(659, 0.25, 'sine', 0.22, 0.1)
}

export function playWrong() {
  tone(220, 0.35, 'sawtooth', 0.12)
}

export function playTick() {
  tone(1000, 0.04, 'sine', 0.12)
}

export function playTimeUp() {
  tone(180, 0.4, 'square', 0.18)
}

export function playCountdown() {
  tone(880, 0.08, 'sine', 0.18)
}

export function playGameStart() {
  tone(523, 0.12, 'sine', 0.18)
  tone(659, 0.12, 'sine', 0.18, 0.12)
  tone(784, 0.25, 'sine', 0.22, 0.25)
}

export function playReveal() {
  tone(440, 0.06, 'triangle', 0.1)
}

export function playFinal() {
  tone(392, 0.12, 'sine', 0.18)
  tone(523, 0.12, 'sine', 0.18, 0.15)
  tone(659, 0.35, 'sine', 0.25, 0.3)
}

export function playBuzz() {
  tone(600, 0.05, 'square', 0.15)
}

export function playPageFlip() {
  tone(300, 0.03, 'triangle', 0.06)
}
