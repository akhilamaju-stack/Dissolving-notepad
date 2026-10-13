// Dissolving Notepad Engine
// Vanishes content when user is inactive for 3.0 seconds

const TIMEOUT_DURATION_MS = 3000;
let lastTypingTimestamp = null;
let animationFrameId = null;
let isDissolving = false;
let soundEnabled = true;
let peakWordCount = 0;

// DOM Elements
const editor = document.getElementById('editor');
const countdownVal = document.getElementById('countdownVal');
const progressBar = document.getElementById('progressBar');
const wordCountEl = document.getElementById('wordCount');
const charCountEl = document.getElementById('charCount');
const sessionPeakEl = document.getElementById('sessionPeak');
const statusMessage = document.getElementById('statusMessage');
const timerBadge = document.getElementById('timerBadge');
const dissolveOverlay = document.getElementById('dissolveOverlay');
const copyBtn = document.getElementById('copyBtn');
const soundToggle = document.getElementById('soundToggle');
const soundIcon = document.getElementById('soundIcon');
const particleCanvas = document.getElementById('particleCanvas');
const ctx = particleCanvas.getContext('2d');

// Sound synthesis using Web Audio API (zero external assets needed)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Gentle audio cues: subtle tick warning and swoosh/dissolve vaporize
function playWarningTick() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.04, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

function playDissolveSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Noise generator for ash/dissolve wind effect
  const bufferSize = ctx.sampleRate * 0.45;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.45);
  filter.Q.value = 3.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start();
  noise.stop(ctx.currentTime + 0.45);
}

// Canvas & Particle system for ember / smoke dissolution effect
let particles = [];

function resizeCanvas() {
  const rect = particleCanvas.getBoundingClientRect();
  particleCanvas.width = rect.width;
  particleCanvas.height = rect.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
  constructor(x, y, colorType = 'ash') {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 3.5 + 1.5;
    this.speedX = (Math.random() - 0.5) * 4.5;
    this.speedY = -(Math.random() * 4 + 1.5); // Float upward
    this.colorType = colorType;
    this.opacity = 1;
    this.decay = Math.random() * 0.02 + 0.015;
    this.rotation = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.2;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.speedY *= 0.98;
    this.opacity -= this.decay;
    this.rotation += this.spin;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = Math.max(0, this.opacity);

    if (this.colorType === 'ember') {
      ctx.fillStyle = `rgb(244, ${Math.floor(63 + Math.random() * 100)}, 94)`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#f43f5e';
    } else {
      ctx.fillStyle = `rgba(180, 190, 205, ${this.opacity})`;
      ctx.shadowBlur = 2;
      ctx.shadowColor = '#64748b';
    }

    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

function spawnDissolveBurst() {
  const rect = particleCanvas.getBoundingClientRect();
  const count = 90;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * rect.width;
    const y = Math.random() * (rect.height * 0.7) + (rect.height * 0.15);
    const type = Math.random() > 0.4 ? 'ember' : 'ash';
    particles.push(new Particle(x, y, type));
  }
}

function renderParticles() {
  ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw();
    if (p.opacity <= 0) {
      particles.splice(i, 1);
    }
  }
  requestAnimationFrame(renderParticles);
}
renderParticles();

// Stats calculation
function updateStats() {
  const text = editor.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = editor.value.length;

  wordCountEl.textContent = words;
  charCountEl.textContent = chars;

  if (words > peakWordCount) {
    peakWordCount = words;
    sessionPeakEl.textContent = peakWordCount;
  }
}

// Reset the entire countdown to 3.0 seconds
function resetCountdown() {
  if (isDissolving) return;

  const content = editor.value.trim();
  if (content.length === 0) {
    // If empty, stay idle and neutral
    lastTypingTimestamp = null;
    countdownVal.textContent = '3.0s';
    progressBar.style.width = '100%';
    document.body.className = '';
    statusMessage.querySelector('.status-text').textContent = 'Ready. Start typing whenever you are prepared.';
    editor.style.opacity = '1';
    editor.style.filter = 'none';
    editor.classList.remove('text-shaking', 'text-dissolving');
    return;
  }

  lastTypingTimestamp = performance.now();
  editor.classList.remove('text-shaking', 'text-dissolving');
  editor.style.opacity = '1';
  editor.style.filter = 'none';
}

// Main countdown loop (smooth 60fps ticker)
function tick(timestamp) {
  if (lastTypingTimestamp && !isDissolving) {
    const elapsed = timestamp - lastTypingTimestamp;
    const remainingMs = Math.max(0, TIMEOUT_DURATION_MS - elapsed);
    const progress = remainingMs / TIMEOUT_DURATION_MS;

    countdownVal.textContent = (remainingMs / 1000).toFixed(1) + 's';
    progressBar.style.width = `${(progress * 100).toFixed(1)}%`;

    // Visual Stage management
    if (remainingMs > 1600) {
      document.body.className = 'stage-calm';
      statusMessage.querySelector('.status-text').textContent = 'Flowing smoothly... keep writing!';
      editor.style.opacity = '1';
      editor.style.filter = 'none';
      editor.classList.remove('text-shaking');
    } else if (remainingMs > 900) {
      document.body.className = 'stage-warning';
      statusMessage.querySelector('.status-text').textContent = 'Warning: You are slowing down!';
      const calmOpacity = 0.65 + (remainingMs - 900) / 700 * 0.35;
      editor.style.opacity = calmOpacity.toString();
      editor.style.filter = 'none';
      editor.classList.remove('text-shaking');
    } else if (remainingMs > 0) {
      document.body.className = 'stage-critical';
      statusMessage.querySelector('.status-text').textContent = 'Critical! Text is burning away!';
      const critOpacity = 0.25 + (remainingMs / 900) * 0.4;
      const blurAmount = (1 - (remainingMs / 900)) * 4;
      editor.style.opacity = critOpacity.toString();
      editor.style.filter = `blur(${blurAmount}px)`;
      editor.classList.add('text-shaking');
    } else {
      // Timeout triggered: Dissolve content!
      dissolveContent();
    }
  }

  animationFrameId = requestAnimationFrame(tick);
}

// Dissolve function
function dissolveContent() {
  if (isDissolving) return;
  isDissolving = true;
  lastTypingTimestamp = null;

  // Sound and particle trigger
  playDissolveSound();
  spawnDissolveBurst();

  countdownVal.textContent = '0.0s';
  progressBar.style.width = '0%';
  editor.classList.remove('text-shaking');
  editor.classList.add('text-dissolving');

  dissolveOverlay.classList.add('active');

  statusMessage.querySelector('.status-text').textContent = 'Content dissolved into thin air! Start fresh.';

  setTimeout(() => {
    editor.value = '';
    updateStats();
    dissolveOverlay.classList.remove('active');

    setTimeout(() => {
      editor.classList.remove('text-dissolving');
      editor.style.opacity = '1';
      editor.style.filter = 'none';
      document.body.className = '';
      countdownVal.textContent = '3.0s';
      progressBar.style.width = '100%';
      isDissolving = false;
      editor.focus();
    }, 250);
  }, 450);
}

// Event Listeners
editor.addEventListener('input', () => {
  updateStats();
  resetCountdown();
});

editor.addEventListener('keydown', (e) => {
  // Reset countdown immediately on key activity
  resetCountdown();
});

// Sound Toggle
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
  soundToggle.title = soundEnabled ? 'Mute sound effects' : 'Unmute sound effects';
});

// Copy to clipboard
copyBtn.addEventListener('click', async () => {
  if (!editor.value.trim()) return;
  try {
    await navigator.clipboard.writeText(editor.value);
    const originalText = copyBtn.querySelector('span').textContent;
    copyBtn.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.querySelector('span').textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy', err);
  }
});

// Start loop
animationFrameId = requestAnimationFrame(tick);
