(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const ROAD_MARGIN = 40;
  const ROAD_LEFT = ROAD_MARGIN;
  const ROAD_RIGHT = W - ROAD_MARGIN;
  const ROAD_WIDTH = ROAD_RIGHT - ROAD_LEFT;
  const LANES = 3;
  const LANE_WIDTH = ROAD_WIDTH / LANES;

  const HIGH_SCORE_KEY = 'corridaturbo.highscore';

  const scoreEl = document.getElementById('score');
  const highscoreEl = document.getElementById('highscore');
  const speedEl = document.getElementById('speed');
  const finalScoreEl = document.getElementById('final-score');
  const newRecordEl = document.getElementById('new-record');

  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const gameoverScreen = document.getElementById('gameover-screen');

  // ---------- Audio (simple WebAudio beeps, no external assets) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
  }
  function beep(freq, duration, type, gain) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = gain != null ? gain : 0.06;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }
  function sfxPickup() { beep(880, 0.12, 'square', 0.05); beep(1320, 0.1, 'square', 0.04); }
  function sfxCrash() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.4;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const g = audioCtx.createGain();
    g.gain.value = 0.3;
    noise.connect(g);
    g.connect(audioCtx.destination);
    noise.start();
  }

  // ---------- Input ----------
  const input = { left: false, right: false, up: false, down: false };

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': input.left = true; break;
      case 'ArrowRight': case 'd': case 'D': input.right = true; break;
      case 'ArrowUp': case 'w': case 'W': input.up = true; break;
      case 'ArrowDown': case 's': case 'S': input.down = true; break;
      case 'p': case 'P': togglePause(); break;
      case 'Enter': if (state === 'start') startGame(); else if (state === 'gameover') startGame(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': input.left = false; break;
      case 'ArrowRight': case 'd': case 'D': input.right = false; break;
      case 'ArrowUp': case 'w': case 'W': input.up = false; break;
      case 'ArrowDown': case 's': case 'S': input.down = false; break;
    }
  });

  function bindHold(id, key) {
    const el = document.getElementById(id);
    const on = (e) => { e.preventDefault(); input[key] = true; };
    const off = (e) => { e.preventDefault(); input[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  }
  bindHold('btn-left', 'left');
  bindHold('btn-right', 'right');
  bindHold('btn-gas', 'up');
  bindHold('btn-brake', 'down');

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', togglePause);

  // ---------- Game state ----------
  let state = 'start'; // start | playing | paused | gameover
  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  highscoreEl.textContent = Math.floor(highScore);

  let baseSpeed = 220;      // px/s, grows with difficulty
  let elapsed = 0;
  let roadOffset = 0;
  let shake = 0;
  let crashTimer = 0;

  const player = {
    w: 34, h: 56,
    x: W / 2 - 17,
    y: H - 130,
    speedMod: 1,
  };

  let traffic = [];
  let pickups = [];
  let particles = [];
  let spawnTimer = 0;
  let pickupTimer = 0;

  const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#8338ec', '#ffbe0b'];

  function laneX(lane, w) {
    return ROAD_LEFT + lane * LANE_WIDTH + (LANE_WIDTH - w) / 2;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function startGame() {
    ensureAudio();
    state = 'playing';
    score = 0;
    baseSpeed = 220;
    elapsed = 0;
    roadOffset = 0;
    shake = 0;
    crashTimer = 0;
    player.x = W / 2 - player.w / 2;
    player.speedMod = 1;
    traffic = [];
    pickups = [];
    particles = [];
    spawnTimer = 0;
    pickupTimer = 0.5;

    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    newRecordEl.classList.add('hidden');
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      pauseScreen.classList.remove('hidden');
    } else if (state === 'paused') {
      state = 'playing';
      pauseScreen.classList.add('hidden');
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function endGame() {
    state = 'gameover';
    sfxCrash();
    const rounded = Math.floor(score);
    finalScoreEl.textContent = rounded;
    if (rounded > highScore) {
      highScore = rounded;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      newRecordEl.classList.remove('hidden');
      highscoreEl.textContent = highScore;
    }
    gameoverScreen.classList.remove('hidden');
  }

  function spawnTraffic() {
    const lane = Math.floor(Math.random() * LANES);
    const w = 32 + Math.random() * 6;
    const h = 52 + Math.random() * 8;
    traffic.push({
      x: laneX(lane, w),
      y: -h - 10,
      w, h,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speedOffset: -30 + Math.random() * 60, // relative speed variance
    });
  }

  function spawnPickup() {
    const lane = Math.floor(Math.random() * LANES);
    const s = 20;
    pickups.push({ x: laneX(lane, s), y: -s - 10, w: s, h: s, spin: 0 });
  }

  function explode(cx, cy, color) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 180;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.4 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? color : '#ffcc00',
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ---------- Update ----------
  let lastTime = performance.now();

  function update(dt) {
    elapsed += dt;

    // Difficulty ramps up over time, caps to keep it playable
    baseSpeed = Math.min(220 + elapsed * 6, 620);

    // Player speed modifier from input
    const targetMod = input.up && !input.down ? 1.5 : (input.down && !input.up ? 0.6 : 1);
    player.speedMod += (targetMod - player.speedMod) * Math.min(1, dt * 4);

    const scrollSpeed = baseSpeed * player.speedMod;
    roadOffset = (roadOffset + scrollSpeed * dt) % 40;

    // Horizontal movement
    const moveSpeed = 320;
    if (input.left) player.x -= moveSpeed * dt;
    if (input.right) player.x += moveSpeed * dt;
    player.x = Math.max(ROAD_LEFT + 4, Math.min(ROAD_RIGHT - player.w - 4, player.x));

    // Score from distance
    score += scrollSpeed * dt * 0.05;

    // Spawn traffic with difficulty-scaled frequency
    spawnTimer -= dt;
    const spawnInterval = Math.max(0.45, 1.3 - elapsed * 0.01);
    if (spawnTimer <= 0) {
      spawnTraffic();
      spawnTimer = spawnInterval + Math.random() * 0.3;
    }

    pickupTimer -= dt;
    if (pickupTimer <= 0) {
      spawnPickup();
      pickupTimer = 2.2 + Math.random() * 2;
    }

    // Move traffic
    const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (let i = traffic.length - 1; i >= 0; i--) {
      const t = traffic[i];
      t.y += (scrollSpeed + t.speedOffset) * dt;
      if (t.y > H + 60) { traffic.splice(i, 1); continue; }
      if (rectsOverlap(playerRect, t)) {
        explode(player.x + player.w / 2, player.y + player.h / 2, '#ff3b3b');
        shake = 18;
        traffic.splice(i, 1);
        crashTimer = 0.9;
        state = 'crashing';
      }
    }

    // Move pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.y += scrollSpeed * dt;
      p.spin += dt * 6;
      if (p.y > H + 30) { pickups.splice(i, 1); continue; }
      if (rectsOverlap(playerRect, p)) {
        score += 40;
        explode(p.x + p.w / 2, p.y + p.h / 2, '#ffd60a');
        sfxPickup();
        pickups.splice(i, 1);
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 40);

    scoreEl.textContent = Math.floor(score);
    speedEl.textContent = Math.floor(scrollSpeed * 0.6);
  }

  function updateCrashing(dt) {
    crashTimer -= dt;
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    if (crashTimer <= 0) endGame();
  }

  // ---------- Draw ----------
  function drawRoad() {
    ctx.fillStyle = '#3a5a2c';
    ctx.fillRect(0, 0, W, H);

    // grass texture stripes
    ctx.fillStyle = '#345527';
    for (let y = -40; y < H + 40; y += 40) {
      const yy = (y + roadOffset) % (H + 40) - 40;
      ctx.fillRect(0, yy, ROAD_LEFT, 20);
      ctx.fillRect(ROAD_RIGHT, yy, ROAD_LEFT, 20);
    }

    // road surface
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, H);

    // rumble strips
    const stripeH = 20;
    ctx.fillStyle = '#e63946';
    for (let y = -stripeH; y < H + stripeH; y += stripeH * 2) {
      const yy = (y + roadOffset) % (H + stripeH * 2) - stripeH;
      ctx.fillRect(ROAD_LEFT - 8, yy, 8, stripeH);
      ctx.fillRect(ROAD_RIGHT, yy, 8, stripeH);
    }
    ctx.fillStyle = '#f1faee';
    for (let y = -stripeH; y < H + stripeH; y += stripeH * 2) {
      const yy = (y + roadOffset + stripeH) % (H + stripeH * 2) - stripeH;
      ctx.fillRect(ROAD_LEFT - 8, yy, 8, stripeH);
      ctx.fillRect(ROAD_RIGHT, yy, 8, stripeH);
    }

    // lane dashes
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 24]);
    for (let lane = 1; lane < LANES; lane++) {
      const x = ROAD_LEFT + lane * LANE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, -40 + roadOffset);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawCar(x, y, w, h, body, windowColor) {
    ctx.save();
    ctx.translate(x, y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h + 4, w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = body;
    roundRect(ctx, 0, 0, w, h, 8);
    ctx.fill();

    // windshield / window
    ctx.fillStyle = windowColor;
    roundRect(ctx, w * 0.15, h * 0.12, w * 0.7, h * 0.28, 4);
    ctx.fill();
    roundRect(ctx, w * 0.15, h * 0.6, w * 0.7, h * 0.22, 4);
    ctx.fill();

    // wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-3, h * 0.12, 5, h * 0.22);
    ctx.fillRect(w - 2, h * 0.12, 5, h * 0.22);
    ctx.fillRect(-3, h * 0.62, 5, h * 0.22);
    ctx.fillRect(w - 2, h * 0.62, 5, h * 0.22);

    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawPickup(p) {
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(Math.sin(p.spin) * 0.3);
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.moveTo(0, -p.h / 2);
    ctx.lineTo(p.w / 2, 0);
    ctx.lineTo(0, p.h / 2);
    ctx.lineTo(-p.w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a5c00';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) {
      const dx = (Math.random() - 0.5) * shake;
      const dy = (Math.random() - 0.5) * shake;
      ctx.translate(dx, dy);
    }

    drawRoad();

    for (const p of pickups) drawPickup(p);
    for (const t of traffic) drawCar(t.x, t.y, t.w, t.h, t.color, '#cfeaff');

    if (state !== 'crashing' || crashTimer > 0.75) {
      drawCar(player.x, player.y, player.w, player.h, '#ffcc00', '#1b2735');
    }

    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ---------- Loop ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (state === 'playing') {
      update(dt);
      draw();
      requestAnimationFrame(loop);
    } else if (state === 'crashing') {
      updateCrashing(dt);
      draw();
      requestAnimationFrame(loop);
    } else if (state === 'paused') {
      draw();
      // no further frames requested until resumed
    } else {
      draw();
    }
  }

  // initial static draw
  draw();
})();
