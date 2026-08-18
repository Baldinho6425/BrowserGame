import { loadJSON, saveJSON } from './storage.js';
import { CARS, THEMES, ACHIEVEMENTS, UPGRADE_MAX_LEVEL, UPGRADE_STAT_STEP, UPGRADE_TANK_STEP, upgradeCost, carById, themeById } from './data.js';
import { seedFromString, mulberry32, todayStr } from './rng.js';
import { shadeColor, lerpColor } from './colors.js';
import { rectsOverlap } from './collision.js';
import { createAudioSystem } from './audio.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // The game logic always works in the fixed 480x720 W/H coordinate space above.
  // What changes here is only the canvas's backing pixel buffer, so it matches the
  // device's actual pixel density — otherwise the CSS-driven display size (which now
  // scales up further on desktop, see #game-wrap in style.css) stretches a 480x720
  // bitmap and comes out visibly soft/blurry on larger or high-DPI screens.
  let dprMediaQuery = null;
  function watchDprChange() {
    if (!window.matchMedia) return;
    if (dprMediaQuery) dprMediaQuery.removeEventListener('change', syncCanvasResolution);
    dprMediaQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprMediaQuery.addEventListener('change', syncCanvasResolution, { once: true });
  }
  function syncCanvasResolution() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    watchDprChange();
  }
  syncCanvasResolution();
  window.addEventListener('resize', syncCanvasResolution);

  const ROAD_MARGIN = 66;
  const ROAD_LEFT = ROAD_MARGIN;
  const ROAD_RIGHT = W - ROAD_MARGIN;
  const ROAD_WIDTH = ROAD_RIGHT - ROAD_LEFT;
  const LANES = 3;
  const LANE_WIDTH = ROAD_WIDTH / LANES;
  const DAY_CYCLE = 100; // seconds for a full day/night loop
  const MIN_LANE_GAP = 150; // min world-distance between obstacles spawned in the same lane

  const POLICE_GAP_MAX = 900;
  const POLICE_TRIGGER_SPEED = 110; // scrollSpeed below this lets the police close in
  const POLICE_CLOSE_RATE = 70;
  const POLICE_RECOVER_RATE = 170;
  const POLICE_VISIBLE_RANGE = 240;
  const POLICE_CLOSE_CALL_GAP = 60;

  // ---------- Persistent storage (js/storage.js) ----------
  let coins = loadJSON('coins', 0);
  let unlockedCars = loadJSON('unlockedCars', ['yellow']);
  let selectedCarId = loadJSON('selectedCar', 'yellow');
  let unlockedThemes = loadJSON('unlockedThemes', ['city']);
  let selectedThemeId = loadJSON('selectedTheme', 'city');
  let unlockedAchievements = loadJSON('achievements', []);
  let leaderboard = loadJSON('leaderboard', []);
  let dailyBest = loadJSON('dailyBest', { date: '', score: 0 });
  let muted = loadJSON('muted', false);
  let carUpgrades = loadJSON('upgrades', {});

  function getUpgrade(carId) {
    return carUpgrades[carId] || { speed: 0, handling: 0, tank: 0 };
  }
  function upgradeCost(level) {
    return 120 * (level + 1);
  }

  // ---------- Static data (js/data.js) ----------
  let activeTheme = themeById(selectedThemeId);

  // ---------- DOM refs ----------
  const scoreEl = document.getElementById('score');
  const highscoreEl = document.getElementById('highscore');
  const speedEl = document.getElementById('speed');
  const finalScoreEl = document.getElementById('final-score');
  const finalCoinsEl = document.getElementById('final-coins');
  const newRecordEl = document.getElementById('new-record');
  const newDailyRecordEl = document.getElementById('new-daily-record');
  const nitroBarInner = document.getElementById('nitro-bar-inner');
  const fuelBarInner = document.getElementById('fuel-bar-inner');
  const dailyBadgeEl = document.getElementById('daily-badge');
  const policeAlertEl = document.getElementById('police-alert');
  const gameoverTitleEl = document.getElementById('gameover-title');
  const effectBadges = {
    shield: document.getElementById('effect-shield'),
    magnet: document.getElementById('effect-magnet'),
    multiplier: document.getElementById('effect-multiplier'),
    slowmo: document.getElementById('effect-slowmo'),
  };

  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const achievementsScreen = document.getElementById('achievements-screen');
  const upgradesScreen = document.getElementById('upgrades-screen');
  const legendScreen = document.getElementById('legend-screen');

  const comboEl = document.getElementById('combo-indicator');
  const toastEl = document.getElementById('achievement-toast');
  const toastNameEl = document.getElementById('toast-name');
  const countdownEl = document.getElementById('countdown');

  // ---------- Audio (js/audio.js) ----------
  const audio = createAudioSystem({
    isMuted: () => muted,
    isActive: () => state === 'playing' || state === 'start',
  });

  const muteBtn = document.getElementById('mute-btn');
  function applyMuteIcon() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
  applyMuteIcon();
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    saveJSON('muted', muted);
    applyMuteIcon();
    audio.ensureAudio();
    audio.setMuted(muted);
  });

  // ---------- Input ----------
  const input = { left: false, right: false, up: false, down: false, nitro: false };

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': input.left = true; break;
      case 'ArrowRight': case 'd': case 'D': input.right = true; break;
      case 'ArrowUp': case 'w': case 'W': input.up = true; break;
      case 'ArrowDown': case 's': case 'S': input.down = true; break;
      case 'Shift': input.nitro = true; break;
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
      case 'Shift': input.nitro = false; break;
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
  bindHold('btn-nitro', 'nitro');

  let dailyMode = false;
  document.getElementById('start-btn').addEventListener('click', () => { dailyMode = false; startGame(); });
  document.getElementById('daily-btn').addEventListener('click', () => { dailyMode = true; startGame(); });
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', togglePause);
  document.getElementById('pause-menu-btn').addEventListener('click', goToMenu);
  document.getElementById('gameover-menu-btn').addEventListener('click', goToMenu);
  document.getElementById('achievements-btn').addEventListener('click', () => {
    renderAchievements();
    startScreen.classList.add('hidden');
    achievementsScreen.classList.remove('hidden');
  });
  document.getElementById('achievements-close').addEventListener('click', () => {
    achievementsScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });
  document.getElementById('upgrades-btn').addEventListener('click', () => {
    upgradeCarIndex = carIndex;
    renderUpgrades();
    startScreen.classList.add('hidden');
    upgradesScreen.classList.remove('hidden');
  });
  document.getElementById('upgrades-close').addEventListener('click', () => {
    upgradesScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });
  document.getElementById('legend-btn').addEventListener('click', () => {
    renderLegend();
    startScreen.classList.add('hidden');
    legendScreen.classList.remove('hidden');
  });
  document.getElementById('legend-close').addEventListener('click', () => {
    legendScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });

  // ---------- Seeded RNG (js/rng.js) ----------
  let rng = Math.random;
  function rand() { return rng(); }

  // ---------- Color helpers (js/colors.js) ----------

  // ---------- Day/night cycle (darkness curve is theme-independent; themes supply the colors) ----------
  const DARK_KEYFRAMES = [
    { t: 0.00, dark: 0 },
    { t: 0.32, dark: 0.15 },
    { t: 0.44, dark: 0.55 },
    { t: 0.55, dark: 1 },
    { t: 0.85, dark: 1 },
    { t: 0.93, dark: 0.4 },
    { t: 1.00, dark: 0 },
  ];
  function getDarkness(tNorm) {
    for (let i = 0; i < DARK_KEYFRAMES.length - 1; i++) {
      const a = DARK_KEYFRAMES[i];
      const b = DARK_KEYFRAMES[i + 1];
      if (tNorm >= a.t && tNorm <= b.t) {
        const f = (tNorm - a.t) / (b.t - a.t || 1);
        return a.dark + (b.dark - a.dark) * f;
      }
    }
    return 0;
  }
  function getDayPhase(tNorm, theme) {
    const dark = getDarkness(tNorm);
    return {
      grass: lerpColor(theme.grassDay, theme.grassNight, dark),
      road: lerpColor(theme.roadDay, theme.roadNight, dark),
      dark,
    };
  }

  // ---------- Game state ----------
  let state = 'start'; // start | playing | crashing | paused | gameover
  let score = 0;
  let baseSpeed = 220;
  let elapsed = 0;
  let roadOffset = 0;
  let shake = 0;
  let crashTimer = 0;
  let crashFlash = 0;
  let distanceTraveled = 0;

  const player = {
    w: 34, h: 56,
    x: W / 2 - 17,
    y: H - 130,
    speedMod: 1,
    nitro: 100,
    nitroActive: false,
    nitroStreak: 0,
    slipTimer: 0,
    slipDir: 1,
    spinTimer: 0,
    car: carById(selectedCarId),
    effSpeed: 0.55,
    effHandling: 0.60,
    fuel: 100,
    maxFuel: 100,
    shieldCharges: 0,
    magnetTimer: 0,
    multiplierTimer: 0,
    slowmoTimer: 0,
    hadCloseCall: false,
  };

  const police = { gap: POLICE_GAP_MAX, x: player.x };
  let gameOverReason = 'crash';

  let runCoins = 0;
  let combo = 0;
  let comboMax = 0;
  let comboTimer = 0;

  let traffic = [];
  let hazards = [];
  let roadblocks = [];
  let powerups = [];
  let pickups = [];
  let particles = [];
  let scenery = [];
  let weatherParticles = [];
  let spawnTimer = 0;
  let hazardTimer = 0;
  let pickupTimer = 0;
  let fuelTimer = 0;
  let roadblockTimer = 0;
  let powerupTimer = 0;
  let sceneryTimer = 0;
  let motoTimer = 0;
  let laneLastSpawnDist = [-9999, -9999, -9999];

  const CAR_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#8338ec', '#adb5bd'];
  const TRUCK_CAB_COLORS = ['#c62828', '#1d5fa8', '#2f7a4e', '#d68a1a', '#5a5a5a'];
  const MOTO_COLORS = ['#ff3b3b', '#3399ff', '#ffcc00', '#ffffff', '#ff8c00'];
  const TRUCK_CHANCE = 0.22;
  const LANE_CHANGE_MARGIN = 90; // vertical clearance required in the target lane to attempt a change
  const POWERUP_TYPES = ['shield', 'magnet', 'multiplier', 'slowmo'];
  const POWERUP_META = {
    shield: { icon: '🛡️', color: '#4dd0ff' },
    magnet: { icon: '🧲', color: '#ff6bd6' },
    multiplier: { icon: '✨', color: '#c58bff' },
    slowmo: { icon: '⏱️', color: '#7bffb8' },
  };

  function laneX(lane, w) {
    return ROAD_LEFT + lane * LANE_WIDTH + (LANE_WIDTH - w) / 2;
  }
  function pickObstacleLane() {
    const order = [0, 1, 2];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (const lane of order) {
      if (distanceTraveled - laneLastSpawnDist[lane] >= MIN_LANE_GAP) {
        laneLastSpawnDist[lane] = distanceTraveled;
        return lane;
      }
    }
    let best = 0;
    for (let l = 1; l < LANES; l++) if (laneLastSpawnDist[l] < laneLastSpawnDist[best]) best = l;
    laneLastSpawnDist[best] = distanceTraveled;
    return best;
  }
  // Checks whether `lane` has room around world-y `y` for `self` (width w) to merge into,
  // so a lane change never teleports a vehicle straight into another one.
  function laneIsClearNear(lane, y, self, margin) {
    const targetCenterX = laneX(lane, self.w) + self.w / 2;
    for (const t2 of traffic) {
      if (t2 === self) continue;
      if (Math.abs(t2.y - y) < margin && Math.abs((t2.x + t2.w / 2) - targetCenterX) < (t2.w + self.w) / 2 + 20) return false;
    }
    for (const hz of hazards) {
      if (Math.abs(hz.y - y) < margin && Math.abs((hz.x + hz.w / 2) - targetCenterX) < (hz.w + self.w) / 2 + 10) return false;
    }
    for (const rb of roadblocks) {
      if (rb.blockedLanes.includes(lane) && Math.abs(rb.y - y) < margin + 40) return false;
    }
    return true;
  }

  // ---------- Garage UI ----------
  const carCanvas = document.getElementById('car-canvas');
  const carCtx = carCanvas.getContext('2d');
  let carIndex = Math.max(0, CARS.findIndex((c) => c.id === selectedCarId));
  let upgradeCarIndex = carIndex;

  function renderGarage() {
    const car = CARS[carIndex];
    const isUnlocked = unlockedCars.includes(car.id);

    carCtx.clearRect(0, 0, carCanvas.width, carCanvas.height);
    drawCar(carCtx, carCanvas.width / 2 - 20, carCanvas.height / 2 - 30, 40, 62, car.body, car.window, { night: 0, isPlayer: true });

    const upg = getUpgrade(car.id);
    const speedBasePct = Math.round(car.speed * 100);
    const handlingBasePct = Math.round(car.handling * 100);
    const speedBonusPct = Math.round(upg.speed * UPGRADE_STAT_STEP * 100);
    const handlingBonusPct = Math.round(upg.handling * UPGRADE_STAT_STEP * 100);

    document.getElementById('car-name').textContent = car.name;
    document.getElementById('stat-speed').style.width = speedBasePct + '%';
    document.getElementById('stat-speed-bonus').style.left = speedBasePct + '%';
    document.getElementById('stat-speed-bonus').style.width = Math.min(speedBonusPct, 100 - speedBasePct) + '%';
    document.getElementById('stat-handling').style.width = handlingBasePct + '%';
    document.getElementById('stat-handling-bonus').style.left = handlingBasePct + '%';
    document.getElementById('stat-handling-bonus').style.width = Math.min(handlingBonusPct, 100 - handlingBasePct) + '%';
    document.getElementById('stat-nitro').style.width = Math.round(car.nitro * 100) + '%';
    document.getElementById('coin-balance').textContent = coins;

    const lockOverlay = document.getElementById('car-lock-overlay');
    const unlockBtn = document.getElementById('car-unlock-btn');
    if (isUnlocked) {
      lockOverlay.classList.add('hidden');
      unlockBtn.classList.add('hidden');
      selectedCarId = car.id;
      saveJSON('selectedCar', selectedCarId);
      player.car = car;
    } else {
      lockOverlay.classList.remove('hidden');
      unlockBtn.classList.remove('hidden');
      document.getElementById('car-cost').textContent = car.cost;
      unlockBtn.disabled = coins < car.cost;
    }

    document.getElementById('ach-count').textContent = unlockedAchievements.length;
    document.getElementById('ach-total').textContent = ACHIEVEMENTS.length;
    highscoreEl.textContent = leaderboard.length ? leaderboard[0].score : 0;
    renderLeaderboard();
  }

  document.getElementById('car-prev').addEventListener('click', () => {
    carIndex = (carIndex - 1 + CARS.length) % CARS.length;
    renderGarage();
  });
  document.getElementById('car-next').addEventListener('click', () => {
    carIndex = (carIndex + 1) % CARS.length;
    renderGarage();
  });
  document.getElementById('car-unlock-btn').addEventListener('click', () => {
    const car = CARS[carIndex];
    if (coins < car.cost) return;
    coins -= car.cost;
    saveJSON('coins', coins);
    unlockedCars.push(car.id);
    saveJSON('unlockedCars', unlockedCars);
    audio.ensureAudio();
    audio.sfxUnlock();
    if (unlockedCars.length === CARS.length) unlockAchievement('garage');
    renderGarage();
  });

  // ---------- Upgrades UI ----------
  const upgradeCarCanvas = document.getElementById('upgrade-car-canvas');
  const upgradeCarCtx = upgradeCarCanvas.getContext('2d');

  function renderPips(containerId, level) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    for (let i = 0; i < UPGRADE_MAX_LEVEL; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < level ? ' filled' : '');
      el.appendChild(pip);
    }
  }

  function renderUpgrades() {
    const car = CARS[upgradeCarIndex];
    const isUnlocked = unlockedCars.includes(car.id);
    const upg = getUpgrade(car.id);

    upgradeCarCtx.clearRect(0, 0, upgradeCarCanvas.width, upgradeCarCanvas.height);
    drawCar(upgradeCarCtx, upgradeCarCanvas.width / 2 - 20, upgradeCarCanvas.height / 2 - 30, 40, 62, car.body, car.window, { night: 0, isPlayer: true });

    document.getElementById('upgrade-car-name').textContent = car.name;
    document.getElementById('upgrade-coin-balance').textContent = coins;
    document.getElementById('upgrade-car-lock-overlay').classList.toggle('hidden', isUnlocked);
    document.getElementById('upgrade-locked-hint').classList.toggle('hidden', isUnlocked);

    renderPips('pips-speed', upg.speed);
    renderPips('pips-handling', upg.handling);
    renderPips('pips-tank', upg.tank);

    [
      ['speed', 'upg-speed-btn', 'upg-speed-label', 'upg-speed-level'],
      ['handling', 'upg-handling-btn', 'upg-handling-label', 'upg-handling-level'],
      ['tank', 'upg-tank-btn', 'upg-tank-label', 'upg-tank-level'],
    ].forEach(([stat, btnId, labelId, levelId]) => {
      const level = upg[stat];
      const btn = document.getElementById(btnId);
      const maxed = level >= UPGRADE_MAX_LEVEL;
      document.getElementById(levelId).textContent = level;
      document.getElementById(labelId).textContent = maxed ? 'MAX' : `${upgradeCost(level)} 🪙`;
      btn.disabled = !isUnlocked || maxed || coins < upgradeCost(level);
    });

    if (upg.speed >= UPGRADE_MAX_LEVEL && upg.handling >= UPGRADE_MAX_LEVEL && upg.tank >= UPGRADE_MAX_LEVEL) {
      unlockAchievement('mechanic');
    }
  }

  function buyUpgrade(stat) {
    const car = CARS[upgradeCarIndex];
    if (!unlockedCars.includes(car.id)) return;
    const upg = getUpgrade(car.id);
    if (upg[stat] >= UPGRADE_MAX_LEVEL) return;
    const cost = upgradeCost(upg[stat]);
    if (coins < cost) return;
    coins -= cost;
    saveJSON('coins', coins);
    upg[stat] += 1;
    carUpgrades[car.id] = upg;
    saveJSON('upgrades', carUpgrades);
    audio.ensureAudio();
    audio.sfxUnlock();
    if (upg.speed >= UPGRADE_MAX_LEVEL && upg.handling >= UPGRADE_MAX_LEVEL && upg.tank >= UPGRADE_MAX_LEVEL) {
      unlockAchievement('mechanic');
    }
    renderUpgrades();
    renderGarage();
  }

  document.getElementById('upg-car-prev').addEventListener('click', () => {
    upgradeCarIndex = (upgradeCarIndex - 1 + CARS.length) % CARS.length;
    renderUpgrades();
  });
  document.getElementById('upg-car-next').addEventListener('click', () => {
    upgradeCarIndex = (upgradeCarIndex + 1) % CARS.length;
    renderUpgrades();
  });
  document.getElementById('upg-speed-btn').addEventListener('click', () => buyUpgrade('speed'));
  document.getElementById('upg-handling-btn').addEventListener('click', () => buyUpgrade('handling'));
  document.getElementById('upg-tank-btn').addEventListener('click', () => buyUpgrade('tank'));

  // ---------- Scenario (theme) UI ----------
  const themeCanvas = document.getElementById('theme-canvas');
  const themeCtx = themeCanvas.getContext('2d');
  let themeIndex = Math.max(0, THEMES.findIndex((t) => t.id === selectedThemeId));

  function renderScenario() {
    const theme = THEMES[themeIndex];
    const isUnlocked = unlockedThemes.includes(theme.id);

    themeCtx.clearRect(0, 0, themeCanvas.width, themeCanvas.height);
    themeCtx.fillStyle = theme.grassDay;
    themeCtx.fillRect(0, 0, themeCanvas.width, themeCanvas.height);
    themeCtx.fillStyle = theme.roadDay;
    themeCtx.fillRect(themeCanvas.width * 0.3, 0, themeCanvas.width * 0.4, themeCanvas.height);
    themeCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    themeCtx.lineWidth = 2;
    themeCtx.setLineDash([6, 6]);
    themeCtx.beginPath();
    themeCtx.moveTo(themeCanvas.width / 2, 0);
    themeCtx.lineTo(themeCanvas.width / 2, themeCanvas.height);
    themeCtx.stroke();
    themeCtx.setLineDash([]);

    document.getElementById('theme-name').textContent = theme.name;
    document.getElementById('coin-balance').textContent = coins;

    const lockOverlay = document.getElementById('theme-lock-overlay');
    const unlockBtn = document.getElementById('theme-unlock-btn');
    if (isUnlocked) {
      lockOverlay.classList.add('hidden');
      unlockBtn.classList.add('hidden');
      selectedThemeId = theme.id;
      saveJSON('selectedTheme', selectedThemeId);
      activeTheme = theme;
    } else {
      lockOverlay.classList.remove('hidden');
      unlockBtn.classList.remove('hidden');
      document.getElementById('theme-cost').textContent = theme.cost;
      unlockBtn.disabled = coins < theme.cost;
    }
  }

  document.getElementById('theme-prev').addEventListener('click', () => {
    themeIndex = (themeIndex - 1 + THEMES.length) % THEMES.length;
    renderScenario();
  });
  document.getElementById('theme-next').addEventListener('click', () => {
    themeIndex = (themeIndex + 1) % THEMES.length;
    renderScenario();
  });
  document.getElementById('theme-unlock-btn').addEventListener('click', () => {
    const theme = THEMES[themeIndex];
    if (coins < theme.cost) return;
    coins -= theme.cost;
    saveJSON('coins', coins);
    unlockedThemes.push(theme.id);
    saveJSON('unlockedThemes', unlockedThemes);
    audio.ensureAudio();
    audio.sfxUnlock();
    if (unlockedThemes.length === THEMES.length) unlockAchievement('themes');
    renderScenario();
    renderGarage();
  });

  function renderDailyBest() {
    const val = dailyBest.date === todayStr() ? dailyBest.score : 0;
    document.getElementById('daily-best').textContent = val;
  }

  function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    if (!leaderboard.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nenhuma corrida registrada ainda.';
      list.appendChild(li);
      return;
    }
    leaderboard.forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = `${entry.score} pontos — ${entry.date}`;
      list.appendChild(li);
    });
  }

  function renderAchievements() {
    document.getElementById('ach-header-count').textContent = unlockedAchievements.length;
    document.getElementById('ach-header-total').textContent = ACHIEVEMENTS.length;
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const unlocked = unlockedAchievements.includes(a.id);
      const li = document.createElement('li');
      li.className = unlocked ? 'unlocked' : '';
      li.innerHTML = `<span class="ach-icon">${unlocked ? a.icon : '❔'}</span>
        <div class="ach-text">
          <span class="ach-name">${a.name}</span>
          <span class="ach-desc">${unlocked ? a.desc : '???'}</span>
        </div>`;
      list.appendChild(li);
    });
  }

  function legendEmojiRow(icon, name, desc) {
    return `<li><span class="legend-icon"><span class="legend-icon-emoji">${icon}</span></span><div class="legend-text"><span class="legend-name">${name}</span><span class="legend-desc">${desc}</span></div></li>`;
  }

  function renderLegendVehicles(listId, entries) {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    entries.forEach((entry) => {
      const li = document.createElement('li');
      const iconWrap = document.createElement('span');
      iconWrap.className = 'legend-icon';
      const iconCanvas = document.createElement('canvas');
      iconCanvas.width = 36;
      iconCanvas.height = 36;
      iconWrap.appendChild(iconCanvas);
      const textWrap = document.createElement('div');
      textWrap.className = 'legend-text';
      textWrap.innerHTML = `<span class="legend-name">${entry.name}</span><span class="legend-desc">${entry.desc}</span>`;
      li.appendChild(iconWrap);
      li.appendChild(textWrap);
      list.appendChild(li);
      entry.draw(iconCanvas.getContext('2d'));
    });
  }

  function renderLegend() {
    renderLegendVehicles('legend-vehicles', [
      {
        name: 'Jogador', desc: 'Seu carro — o que você controla.',
        draw: (c) => drawCar(c, 7, 1, 22, 34, player.car.body, player.car.window, { night: 0, isPlayer: true }),
      },
      {
        name: 'Trânsito', desc: 'Carros comuns; de vez em quando trocam de faixa.',
        draw: (c) => drawCar(c, 7, 1, 22, 34, '#457b9d', '#cfeaff', { night: 0 }),
      },
      {
        name: 'Caminhão', desc: 'Maior e mais lento; nunca troca de faixa.',
        draw: (c) => drawTruck({ x: 5, y: 1, w: 26, h: 34, color: '#c62828' }, 0, c),
      },
      {
        name: 'Moto', desc: 'Pequena e ágil; troca de faixa o tempo todo.',
        draw: (c) => drawMotorcycle({ x: 11, y: 5, w: 14, h: 26, color: '#ff3b3b' }, 0, c),
      },
    ]);
    document.getElementById('legend-vehicles').insertAdjacentHTML(
      'beforeend',
      legendEmojiRow('🚨', 'Polícia', 'Aparece se você andar devagar demais; se te alcançar, é prisão.')
    );

    document.getElementById('legend-hazards').innerHTML = [
      ['🚧', 'Cone', 'Colisão fatal.'],
      ['🛢️', 'Poça de óleo', 'Causa derrapagem temporária.'],
      ['🍌', 'Casca de banana', 'Faz o carro girar.'],
      ['🕳️', 'Buraco', 'Solavanco — perde combustível.'],
      ['⛔', 'Barreira', 'Bloqueia 1 ou 2 faixas; colisão fatal.'],
    ].map(([icon, name, desc]) => legendEmojiRow(icon, name, desc)).join('');

    document.getElementById('legend-items').innerHTML = [
      ['🪙', 'Moeda', 'Pontos + recarrega um pouco de nitro.'],
      ['⛽', 'Combustível', 'Recarrega o tanque.'],
      ['🛡️', 'Escudo', 'Absorve uma batida.'],
      ['🧲', 'Ímã', 'Atrai moedas próximas.'],
      ['✨', 'Multiplicador', 'Pontos em dobro por um tempo.'],
      ['⏱️', 'Câmera lenta', 'Reduz a velocidade da pista.'],
      ['🔥', 'Barra de nitro', 'Impulso de velocidade (Shift).'],
    ].map(([icon, name, desc]) => legendEmojiRow(icon, name, desc)).join('');
  }

  // ---------- Achievement toast queue ----------
  let toastQueue = [];
  let toastShowing = false;
  function enqueueToast(name) {
    toastQueue.push(name);
    if (!toastShowing) showNextToast();
  }
  function showNextToast() {
    if (!toastQueue.length) { toastShowing = false; return; }
    toastShowing = true;
    toastNameEl.textContent = toastQueue.shift();
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(showNextToast, 350);
    }, 2600);
  }
  function unlockAchievement(id) {
    if (unlockedAchievements.includes(id)) return;
    unlockedAchievements.push(id);
    saveJSON('achievements', unlockedAchievements);
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (def) enqueueToast(def.name);
  }
  function checkRunAchievements() {
    if (elapsed >= 60) unlockAchievement('survive60');
    if (score >= 1000) unlockAchievement('score1000');
    if (runCoins >= 10) unlockAchievement('coins10');
    if (comboMax >= 5) unlockAchievement('combo5');
    if (player.nitroStreak >= 5) unlockAchievement('nitro5');
  }

  // ---------- Combo indicator ----------
  let comboHideTimeout = null;
  function showCombo(text) {
    comboEl.textContent = text;
    comboEl.classList.add('show');
    if (comboHideTimeout) clearTimeout(comboHideTimeout);
    comboHideTimeout = setTimeout(() => comboEl.classList.remove('show'), 900);
  }

  // ---------- Power-up effects HUD ----------
  function updateEffectsHud() {
    effectBadges.shield.classList.toggle('show', player.shieldCharges > 0);
    effectBadges.shield.textContent = `🛡️ ×${player.shieldCharges}`;
    effectBadges.magnet.classList.toggle('show', player.magnetTimer > 0);
    effectBadges.magnet.textContent = `🧲 ${Math.ceil(player.magnetTimer)}s`;
    effectBadges.multiplier.classList.toggle('show', player.multiplierTimer > 0);
    effectBadges.multiplier.textContent = `✨ 2x ${Math.ceil(player.multiplierTimer)}s`;
    effectBadges.slowmo.classList.toggle('show', player.slowmoTimer > 0);
    effectBadges.slowmo.textContent = `⏱️ ${Math.ceil(player.slowmoTimer)}s`;
  }

  function applyPowerup(type) {
    audio.ensureAudio();
    audio.sfxUnlock();
    if (type === 'shield') {
      player.shieldCharges = Math.min(2, player.shieldCharges + 1);
      showCombo('🛡️ Escudo adquirido!');
    } else if (type === 'magnet') {
      player.magnetTimer = 7;
      showCombo('🧲 Ímã ativado!');
    } else if (type === 'multiplier') {
      player.multiplierTimer = 8;
      showCombo('✨ Pontos em dobro!');
    } else if (type === 'slowmo') {
      player.slowmoTimer = 5;
      showCombo('⏱️ Câmera lenta!');
    }
    updateEffectsHud();
  }

  // ---------- Start / pause / end ----------
  function startGame() {
    audio.ensureAudio();
    rng = dailyMode ? mulberry32(seedFromString('daily-' + todayStr())) : Math.random;
    state = 'countdown';
    score = 0;
    baseSpeed = 220;
    elapsed = 0;
    roadOffset = 0;
    shake = 0;
    crashTimer = 0;
    crashFlash = 0;
    distanceTraveled = 0;
    player.x = W / 2 - player.w / 2;
    player.speedMod = 1;
    player.nitro = 100;
    player.nitroActive = false;
    player.nitroStreak = 0;
    player.slipTimer = 0;
    player.spinTimer = 0;
    player.car = carById(selectedCarId);
    activeTheme = themeById(selectedThemeId);

    const upg = getUpgrade(player.car.id);
    player.effSpeed = player.car.speed + upg.speed * UPGRADE_STAT_STEP;
    player.effHandling = player.car.handling + upg.handling * UPGRADE_STAT_STEP;
    player.maxFuel = 100 + upg.tank * UPGRADE_TANK_STEP;
    player.fuel = player.maxFuel;
    player.shieldCharges = 0;
    player.magnetTimer = 0;
    player.multiplierTimer = 0;
    player.slowmoTimer = 0;
    player.hadCloseCall = false;

    police.gap = POLICE_GAP_MAX;
    police.x = player.x;
    gameOverReason = 'crash';
    policeAlertEl.classList.remove('show');
    updateEffectsHud();

    runCoins = 0;
    combo = 0;
    comboMax = 0;
    comboTimer = 0;
    traffic = [];
    hazards = [];
    roadblocks = [];
    powerups = [];
    pickups = [];
    particles = [];
    scenery = [];
    weatherParticles = [];
    spawnTimer = 1.4;
    hazardTimer = 2.4;
    pickupTimer = 0.8;
    fuelTimer = 3;
    roadblockTimer = 8;
    powerupTimer = 10;
    sceneryTimer = 0;
    motoTimer = 2.5;
    laneLastSpawnDist = [-9999, -9999, -9999];

    dailyBadgeEl.classList.toggle('hidden', !dailyMode);
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    achievementsScreen.classList.add('hidden');
    upgradesScreen.classList.add('hidden');
    newRecordEl.classList.add('hidden');
    newDailyRecordEl.classList.add('hidden');
    lastTime = performance.now();
    draw();
    runCountdown();
  }

  function runCountdown() {
    const steps = ['3', '2', '1', 'Valendo!'];
    let i = 0;
    countdownEl.classList.remove('hidden');
    const tick = () => {
      countdownEl.textContent = steps[i];
      countdownEl.classList.remove('pulse');
      void countdownEl.offsetWidth; // restart the CSS animation
      countdownEl.classList.add('pulse');
      audio.beep(i < 3 ? 440 : 880, i < 3 ? 0.12 : 0.22, 'square', 0.06);
      i++;
      if (i < steps.length) {
        setTimeout(tick, 650);
      } else {
        setTimeout(() => {
          countdownEl.classList.add('hidden');
          state = 'playing';
          lastTime = performance.now();
          requestAnimationFrame(loop);
        }, 500);
      }
    };
    tick();
  }

  function goToMenu() {
    state = 'start';
    audio.setEngineGain(0);
    policeAlertEl.classList.remove('show');
    pauseScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    renderGarage();
    renderScenario();
    renderDailyBest();
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      audio.setEngineGain(0);
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
    audio.setEngineGain(0);
    audio.sfxCrash();
    policeAlertEl.classList.remove('show');
    gameoverTitleEl.textContent = gameOverReason === 'busted' ? '🚨 Você foi preso!' : '💥 Batida!';
    if (gameOverReason !== 'busted' && player.hadCloseCall) unlockAchievement('police_evade');
    const rounded = Math.floor(score);
    finalScoreEl.textContent = rounded;
    finalCoinsEl.textContent = runCoins;

    if (dailyMode) {
      const today = todayStr();
      if (dailyBest.date !== today) dailyBest = { date: today, score: 0 };
      if (rounded > dailyBest.score) {
        dailyBest.score = rounded;
        saveJSON('dailyBest', dailyBest);
        newDailyRecordEl.classList.remove('hidden');
      }
    } else {
      leaderboard.push({ score: rounded, date: new Date().toLocaleDateString('pt-BR') });
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard = leaderboard.slice(0, 5);
      saveJSON('leaderboard', leaderboard);
      if (leaderboard[0] && leaderboard[0].score === rounded && rounded > 0) {
        newRecordEl.classList.remove('hidden');
      }
    }

    highscoreEl.textContent = leaderboard.length ? leaderboard[0].score : 0;
    renderGarage();
    renderScenario();
    renderDailyBest();
    gameoverScreen.classList.remove('hidden');
  }

  // ---------- Spawning ----------
  function spawnTraffic() {
    const lane = pickObstacleLane();
    const isTruck = rand() < TRUCK_CHANCE;
    const w = isTruck ? 40 + rand() * 8 : 32 + rand() * 6;
    const h = isTruck ? 82 + rand() * 16 : 52 + rand() * 8;
    traffic.push({
      type: isTruck ? 'truck' : 'car',
      lane,
      x: laneX(lane, w), y: -h - 10, w, h,
      color: isTruck
        ? TRUCK_CAB_COLORS[Math.floor(rand() * TRUCK_CAB_COLORS.length)]
        : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)],
      speedOffset: isTruck ? -70 + rand() * 30 : -30 + rand() * 60,
      passed: false,
      changingLane: false,
      targetX: 0,
      laneChangeTimer: 2 + rand() * 3,
      // Regular cars merge occasionally; trucks never do (too big/slow — see the update loop's type check).
      laneChangeCooldownMin: 3,
      laneChangeCooldownMax: 7,
      laneChangeChance: 0.4,
      laneChangeSpeed: 150,
    });
  }
  // Motorcycles: small, weave constantly, can appear anywhere on screen (not just off the top edge).
  function spawnMotorcycle() {
    // Enters from off-screen like cars/trucks — never pops into existence mid-road — but being
    // small and fast it quickly weaves its way anywhere along the pack, near the player or far.
    const lane = Math.floor(rand() * LANES);
    const w = 16 + rand() * 3;
    const h = 30 + rand() * 6;
    const y = -h - 10;
    if (!laneIsClearNear(lane, y, { w }, 70)) return;
    traffic.push({
      type: 'moto',
      lane,
      x: laneX(lane, w), y, w, h,
      color: MOTO_COLORS[Math.floor(rand() * MOTO_COLORS.length)],
      speedOffset: -20 + rand() * 100,
      passed: false,
      changingLane: false,
      targetX: 0,
      laneChangeTimer: 0.3 + rand() * 0.8,
      laneChangeCooldownMin: 0.7,
      laneChangeCooldownMax: 1.8,
      laneChangeChance: 0.9,
      laneChangeSpeed: 260,
    });
  }
  function spawnHazard() {
    const lane = pickObstacleLane();
    const roll = rand();
    const type = roll < 0.32 ? 'cone' : roll < 0.56 ? 'oil' : roll < 0.78 ? 'banana' : 'pothole';
    const s = type === 'cone' ? 22 : type === 'oil' ? 30 : type === 'banana' ? 22 : 26;
    hazards.push({
      type,
      x: laneX(lane, s), y: -s - 10, w: s, h: s,
      passed: false,
    });
  }
  function spawnRoadblock() {
    // Block 1 lane most of the time, 2 lanes occasionally — always leaves at least one lane open.
    const numBlocked = rand() < 0.65 ? 1 : 2;
    const laneOrder = [0, 1, 2];
    for (let i = laneOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = laneOrder[i]; laneOrder[i] = laneOrder[j]; laneOrder[j] = tmp;
    }
    const blockedLanes = laneOrder.slice(0, numBlocked);
    const w = LANE_WIDTH - 18;
    const h = 22;
    // Keep every lane clear of traffic/hazards around the roadblock so the open lane(s) are never
    // secretly blocked by something else arriving at the same time.
    laneLastSpawnDist = [distanceTraveled, distanceTraveled, distanceTraveled];
    roadblocks.push({ blockedLanes, x: 0, y: -h - 10, w, h });
  }
  function spawnCoin() {
    const lane = Math.floor(rand() * LANES);
    const s = 20;
    pickups.push({ kind: 'coin', x: laneX(lane, s), y: -s - 10, w: s, h: s, spin: 0 });
  }
  function spawnFuelCanister() {
    const lane = Math.floor(rand() * LANES);
    const s = 22;
    pickups.push({ kind: 'fuel', x: laneX(lane, s), y: -s - 10, w: s, h: s, spin: 0 });
  }
  function spawnPowerup() {
    const lane = Math.floor(rand() * LANES);
    const s = 22;
    const type = POWERUP_TYPES[Math.floor(rand() * POWERUP_TYPES.length)];
    powerups.push({ type, x: laneX(lane, s), y: -s - 10, w: s, h: s, spin: 0 });
  }
  function spawnScenery() {
    const side = rand() < 0.5 ? 'L' : 'R';
    const types = activeTheme.scenery;
    const type = rand() < 0.78 ? types[0] : types[1];
    scenery.push({
      side, type,
      y: -80,
      seed: rand(),
      windows: Array.from({ length: 6 }, () => rand() < 0.5),
    });
  }
  function spawnWeather() {
    if (activeTheme.weather === 'rain') {
      const dark = getDarkness((elapsed % DAY_CYCLE) / DAY_CYCLE);
      const intensity = Math.max(0, (dark - 0.4) / 0.6);
      if (intensity > 0 && Math.random() < intensity * 0.9) {
        weatherParticles.push({ x: Math.random() * W, y: -10, vy: 520 + Math.random() * 160, vx: -40, type: 'rain' });
      }
    } else if (activeTheme.weather === 'snow') {
      if (Math.random() < 0.55) {
        weatherParticles.push({ x: Math.random() * W, y: -10, vy: 50 + Math.random() * 40, vx: (Math.random() - 0.5) * 20, drift: Math.random() * Math.PI * 2, type: 'snow' });
      }
    }
  }

  function explode(cx, cy, color, count) {
    for (let i = 0; i < (count || 24); i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 180;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        life: 0.4 + Math.random() * 0.4, maxLife: 0.4 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? color : '#ffcc00',
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ---------- Update ----------
  let lastTime = performance.now();

  function update(dt) {
    elapsed += dt;
    const rampedElapsed = Math.max(0, elapsed - 3); // 3s grace period before difficulty ramps

    baseSpeed = Math.min(220 + rampedElapsed * 6, 620);
    const carSpeedMult = 0.9 + player.effSpeed * 0.35;
    const carHandlingMult = 0.8 + player.effHandling * 0.5;
    const carNitroMult = 0.6 + player.car.nitro * 0.8;
    const mult = player.multiplierTimer > 0 ? 2 : 1;

    // Fuel drain — running out caps top speed and invites the police
    const fuelDrain = (1.4 + (player.nitroActive ? 2.6 : 0)) * dt;
    player.fuel = Math.max(0, player.fuel - fuelDrain);
    const outOfFuel = player.fuel <= 0;
    fuelBarInner.style.width = (player.fuel / player.maxFuel * 100) + '%';
    fuelBarInner.classList.toggle('low', player.fuel / player.maxFuel < 0.25);

    // Nitro
    const wantNitro = input.nitro && player.nitro > 2 && !outOfFuel;
    if (wantNitro) {
      player.nitro = Math.max(0, player.nitro - 30 * dt);
      player.nitroActive = true;
      player.nitroStreak += dt;
    } else {
      player.nitro = Math.min(100, player.nitro + 9 * carNitroMult * dt);
      player.nitroActive = false;
      player.nitroStreak = 0;
    }
    nitroBarInner.style.width = player.nitro + '%';
    nitroBarInner.classList.toggle('active', player.nitroActive);

    // Speed modifier
    let targetMod;
    if (player.nitroActive) {
      targetMod = 2.2 * carSpeedMult;
    } else {
      targetMod = (input.up && !input.down ? 1.5 : (input.down && !input.up ? 0.6 : 1)) * carSpeedMult;
    }
    if (outOfFuel) targetMod = Math.min(targetMod, 0.35 * carSpeedMult);
    player.speedMod += (targetMod - player.speedMod) * Math.min(1, dt * 4);

    let scrollSpeed = baseSpeed * player.speedMod;
    if (player.slowmoTimer > 0) scrollSpeed *= 0.6;
    roadOffset = (roadOffset + scrollSpeed * dt) % 40;
    distanceTraveled += scrollSpeed * dt;

    // Engine sound reacts to speed/nitro
    {
      const speedFrac = Math.min(1, baseSpeed / 620);
      const freq = 55 + speedFrac * 90 + (player.nitroActive ? 40 : 0);
      audio.setEngineFrequency(freq, 300 + speedFrac * 1200 + (player.nitroActive ? 800 : 0));
      audio.setEngineGain(0.05 + speedFrac * 0.05 + (player.nitroActive ? 0.05 : 0));
    }

    // Horizontal movement
    let moveSpeed = 320 * carHandlingMult;
    if (player.slipTimer > 0) {
      player.slipTimer -= dt;
      moveSpeed *= 0.4;
      player.x += player.slipDir * 130 * dt * (player.slipTimer / 1.1);
    }
    if (player.spinTimer > 0) {
      player.spinTimer -= dt;
      moveSpeed *= 0.5;
    }
    if (input.left) player.x -= moveSpeed * dt;
    if (input.right) player.x += moveSpeed * dt;
    player.x = Math.max(ROAD_LEFT + 4, Math.min(ROAD_RIGHT - player.w - 4, player.x));

    // Score from distance
    score += scrollSpeed * dt * 0.05 * mult;

    // Combo timer decay
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }

    // Power-up effect timers
    if (player.magnetTimer > 0) player.magnetTimer = Math.max(0, player.magnetTimer - dt);
    if (player.multiplierTimer > 0) player.multiplierTimer = Math.max(0, player.multiplierTimer - dt);
    if (player.slowmoTimer > 0) player.slowmoTimer = Math.max(0, player.slowmoTimer - dt);
    updateEffectsHud();

    // Police pursuit — falls back at speed, closes in when the player crawls
    if (scrollSpeed < POLICE_TRIGGER_SPEED) {
      police.gap = Math.max(0, police.gap - POLICE_CLOSE_RATE * dt);
      if (police.gap < POLICE_CLOSE_CALL_GAP) player.hadCloseCall = true;
    } else {
      police.gap = Math.min(POLICE_GAP_MAX, police.gap + POLICE_RECOVER_RATE * dt);
    }
    police.x += (player.x - police.x) * Math.min(1, dt * 2);
    policeAlertEl.classList.toggle('show', police.gap < POLICE_VISIBLE_RANGE);
    if (police.gap <= 0) {
      if (player.shieldCharges > 0) {
        player.shieldCharges -= 1;
        police.gap = 420;
        showCombo('🛡️ Escudo usado! Fugiu da polícia!');
        updateEffectsHud();
      } else {
        explode(player.x + player.w / 2, player.y + player.h / 2, '#3399ff', 20);
        shake = 20;
        crashTimer = 0.9; crashFlash = 1;
        state = 'crashing';
        gameOverReason = 'busted';
        audio.setEngineGain(0);
      }
    }

    // Spawn timers
    spawnTimer -= dt;
    const spawnInterval = Math.max(0.45, 1.3 - rampedElapsed * 0.01);
    if (spawnTimer <= 0) { spawnTraffic(); spawnTimer = spawnInterval + rand() * 0.3; }

    hazardTimer -= dt;
    const hazardInterval = Math.max(0.9, 1.8 - rampedElapsed * 0.006);
    if (hazardTimer <= 0) { spawnHazard(); hazardTimer = hazardInterval + rand() * 0.5; }

    roadblockTimer -= dt;
    if (roadblockTimer <= 0) { spawnRoadblock(); roadblockTimer = 9 + rand() * 6; }

    pickupTimer -= dt;
    if (pickupTimer <= 0) { spawnCoin(); pickupTimer = 2.2 + rand() * 2; }

    fuelTimer -= dt;
    if (fuelTimer <= 0) { spawnFuelCanister(); fuelTimer = 4.5 + rand() * 3; }

    powerupTimer -= dt;
    if (powerupTimer <= 0) { spawnPowerup(); powerupTimer = 12 + rand() * 8; }

    sceneryTimer -= dt;
    if (sceneryTimer <= 0) { spawnScenery(); sceneryTimer = 0.45; }

    motoTimer -= dt;
    if (motoTimer <= 0) { spawnMotorcycle(); motoTimer = 1.3 + rand() * 1.5; }

    spawnWeather();

    const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    const NEAR_MISS_MARGIN = 16;

    // Traffic: lane changes, movement, collide, near-miss
    for (let i = traffic.length - 1; i >= 0; i--) {
      const t = traffic[i];

      // Cars weave between lanes occasionally; motorcycles do it constantly, anywhere on screen;
      // trucks stay put (too big, too slow to merge).
      if (t.type === 'car' || t.type === 'moto') {
        t.laneChangeTimer -= dt;
        if (!t.changingLane && t.laneChangeTimer <= 0) {
          t.laneChangeTimer = t.laneChangeCooldownMin + rand() * (t.laneChangeCooldownMax - t.laneChangeCooldownMin);
          const inRange = t.type === 'moto' ? t.y > -50 : (t.y > 30 && t.y < H * 0.55);
          if (inRange && rand() < t.laneChangeChance) {
            const dir = rand() < 0.5 ? -1 : 1;
            const newLane = Math.max(0, Math.min(LANES - 1, t.lane + dir));
            if (newLane !== t.lane && laneIsClearNear(newLane, t.y, t, LANE_CHANGE_MARGIN)) {
              t.lane = newLane;
              t.targetX = laneX(newLane, t.w);
              t.changingLane = true;
            }
          }
        }
        if (t.changingLane) {
          const dx = t.targetX - t.x;
          const step = t.laneChangeSpeed * dt;
          if (Math.abs(dx) <= step) { t.x = t.targetX; t.changingLane = false; }
          else t.x += Math.sign(dx) * step;
        }
      }

      t.y += (scrollSpeed + t.speedOffset) * dt;
      if (t.y > H + 60) { traffic.splice(i, 1); continue; }

      if (rectsOverlap(playerRect, t)) {
        if (player.shieldCharges > 0) {
          player.shieldCharges -= 1;
          updateEffectsHud();
          showCombo('🛡️ Escudo absorveu a batida!');
          explode(t.x + t.w / 2, t.y + t.h / 2, '#4dd0ff', 14);
          traffic.splice(i, 1);
          continue;
        }
        explode(player.x + player.w / 2, player.y + player.h / 2, '#ff3b3b');
        shake = 18;
        traffic.splice(i, 1);
        crashTimer = 0.9; crashFlash = 1;
        state = 'crashing';
        gameOverReason = 'crash';
        audio.setEngineGain(0);
        continue;
      }
      if (!t.passed && t.y > player.y + player.h) {
        t.passed = true;
        registerNearMiss(t, playerRect, NEAR_MISS_MARGIN, mult);
      }
    }

    // Hazards: move, collide (cone/pothole/banana/oil each behave differently), near-miss on cones
    for (let i = hazards.length - 1; i >= 0; i--) {
      const hz = hazards[i];
      hz.y += scrollSpeed * dt;
      if (hz.y > H + 40) { hazards.splice(i, 1); continue; }

      if (rectsOverlap(playerRect, hz)) {
        if (hz.type === 'cone') {
          if (player.shieldCharges > 0) {
            player.shieldCharges -= 1;
            updateEffectsHud();
            showCombo('🛡️ Escudo absorveu a batida!');
            hazards.splice(i, 1);
            continue;
          }
          explode(player.x + player.w / 2, player.y + player.h / 2, '#ff8c00');
          shake = 18;
          hazards.splice(i, 1);
          crashTimer = 0.9; crashFlash = 1;
          state = 'crashing';
          gameOverReason = 'crash';
          audio.setEngineGain(0);
          continue;
        } else if (hz.type === 'oil') {
          explode(hz.x + hz.w / 2, hz.y + hz.h / 2, '#4a3b2a', 10);
          player.slipTimer = 1.1;
          player.slipDir = Math.random() < 0.5 ? -1 : 1;
          hazards.splice(i, 1);
          continue;
        } else if (hz.type === 'banana') {
          explode(hz.x + hz.w / 2, hz.y + hz.h / 2, '#ffe135', 10);
          player.spinTimer = 0.8;
          hazards.splice(i, 1);
          showCombo('🍌 Escorregou na casca de banana!');
          continue;
        } else {
          explode(hz.x + hz.w / 2, hz.y + hz.h / 2, '#6b5a4a', 10);
          shake = Math.max(shake, 12);
          player.fuel = Math.max(0, player.fuel - 6);
          hazards.splice(i, 1);
          showCombo('🕳️ Solavanco! -6 combustível');
          continue;
        }
      }
      if (!hz.passed && hz.type === 'cone' && hz.y > player.y + player.h) {
        hz.passed = true;
        registerNearMiss(hz, playerRect, NEAR_MISS_MARGIN, mult);
      }
    }

    // Roadblocks: 1 or 2 lanes closed, the rest open — hit any closed segment and it's a crash
    for (let i = roadblocks.length - 1; i >= 0; i--) {
      const rb = roadblocks[i];
      rb.y += scrollSpeed * dt;
      if (rb.y > H + 60) { roadblocks.splice(i, 1); continue; }

      let hit = false;
      for (const lane of rb.blockedLanes) {
        const bx = laneX(lane, rb.w);
        if (rectsOverlap(playerRect, { x: bx, y: rb.y, w: rb.w, h: rb.h })) hit = true;
      }
      if (hit) {
        if (player.shieldCharges > 0) {
          player.shieldCharges -= 1;
          updateEffectsHud();
          showCombo('🛡️ Escudo absorveu a batida!');
          explode(player.x + player.w / 2, player.y + player.h / 2, '#4dd0ff', 14);
          roadblocks.splice(i, 1);
          continue;
        }
        explode(player.x + player.w / 2, player.y + player.h / 2, '#ff8c00');
        shake = 20;
        roadblocks.splice(i, 1);
        crashTimer = 0.9; crashFlash = 1;
        state = 'crashing';
        gameOverReason = 'crash';
        audio.setEngineGain(0);
      }
    }

    // Pickups (coins + fuel canisters), pulled in by an active magnet
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (player.magnetTimer > 0) {
        const dx = (player.x + player.w / 2) - (p.x + p.w / 2);
        if (Math.abs(dx) < 150) p.x += dx * Math.min(1, dt * 4);
      }
      p.y += scrollSpeed * dt;
      p.spin += dt * 6;
      if (p.y > H + 30) { pickups.splice(i, 1); continue; }
      if (rectsOverlap(playerRect, p)) {
        if (p.kind === 'coin') {
          score += 40 * mult;
          runCoins += 1;
          coins += 1;
          saveJSON('coins', coins);
          player.nitro = Math.min(100, player.nitro + 10);
          explode(p.x + p.w / 2, p.y + p.h / 2, '#ffd60a');
        } else {
          player.fuel = Math.min(player.maxFuel, player.fuel + player.maxFuel * 0.35);
          score += 15 * mult;
          explode(p.x + p.w / 2, p.y + p.h / 2, '#ff8c42');
        }
        audio.sfxPickup();
        pickups.splice(i, 1);
      }
    }

    // Power-ups
    for (let i = powerups.length - 1; i >= 0; i--) {
      const pu = powerups[i];
      pu.y += scrollSpeed * dt;
      pu.spin += dt * 5;
      if (pu.y > H + 30) { powerups.splice(i, 1); continue; }
      if (rectsOverlap(playerRect, pu)) {
        applyPowerup(pu.type);
        powerups.splice(i, 1);
      }
    }

    // Scenery (parallax, slightly slower than road)
    for (let i = scenery.length - 1; i >= 0; i--) {
      const s = scenery[i];
      s.y += scrollSpeed * 0.85 * dt;
      if (s.y > H + 80) scenery.splice(i, 1);
    }

    // Weather particles
    for (let i = weatherParticles.length - 1; i >= 0; i--) {
      const wp = weatherParticles[i];
      wp.y += wp.vy * dt;
      wp.x += wp.vx * dt;
      if (wp.type === 'snow') wp.drift += dt * 2;
      if (wp.y > H + 20) { weatherParticles.splice(i, 1); continue; }
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

    // Nitro exhaust particles
    if (player.nitroActive) {
      for (let n = 0; n < 2; n++) {
        particles.push({
          x: player.x + player.w / 2 + (Math.random() - 0.5) * player.w * 0.6,
          y: player.y + player.h,
          vx: (Math.random() - 0.5) * 30,
          vy: 140 + Math.random() * 80,
          life: 0.3, maxLife: 0.3,
          color: Math.random() < 0.5 ? '#00d4ff' : '#ffffff',
          size: 2 + Math.random() * 2,
        });
      }
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 40);

    checkRunAchievements();

    scoreEl.textContent = Math.floor(score);
    speedEl.textContent = Math.floor(scrollSpeed * 0.6);
  }

  function registerNearMiss(obj, playerRect, margin, mult) {
    const gapCenterX = Math.abs((obj.x + obj.w / 2) - (playerRect.x + playerRect.w / 2));
    const combinedHalf = obj.w / 2 + playerRect.w / 2;
    if (gapCenterX < combinedHalf + margin) {
      combo += 1;
      comboMax = Math.max(comboMax, combo);
      comboTimer = 2.2;
      const bonus = 15 * combo * (mult || 1);
      score += bonus;
      showCombo(`+${bonus} Quase! Combo x${combo}`);
      audio.sfxCombo();
    }
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
    if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - dt * 3.5);
    if (crashTimer <= 0) endGame();
  }

  // ---------- Draw ----------
  function drawScenery(s, dayPhase) {
    const x = s.side === 'L' ? 8 + s.seed * (ROAD_LEFT - 40) : ROAD_RIGHT + 32 + s.seed * (ROAD_LEFT - 40);
    if (s.type === 'tree' || s.type === 'pine') {
      const trunkH = 10 + s.seed * 6;
      ctx.fillStyle = shadeColor('#4a3222', -Math.round(dayPhase.dark * 40));
      ctx.fillRect(x - 2, s.y + 26, 4, trunkH);
      ctx.fillStyle = shadeColor('#2f6b3a', -Math.round(dayPhase.dark * 60));
      ctx.beginPath();
      ctx.moveTo(x, s.y);
      ctx.lineTo(x + 16, s.y + 30);
      ctx.lineTo(x - 16, s.y + 30);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, s.y + 12);
      ctx.lineTo(x + 13, s.y + 38);
      ctx.lineTo(x - 13, s.y + 38);
      ctx.closePath();
      ctx.fill();
      if (s.type === 'pine') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(x, s.y);
        ctx.lineTo(x + 6, s.y + 12);
        ctx.lineTo(x - 6, s.y + 12);
        ctx.closePath();
        ctx.fill();
      }
    } else if (s.type === 'building') {
      const w = 34, h = 60 + s.seed * 30;
      ctx.fillStyle = shadeColor('#333a44', -Math.round(dayPhase.dark * 30));
      ctx.fillRect(x - w / 2, s.y - h + 40, w, h);
      s.windows.forEach((lit, i) => {
        const wx = x - w / 2 + 6 + (i % 2) * (w - 18);
        const wy = s.y - h + 52 + Math.floor(i / 2) * 16;
        ctx.fillStyle = (lit && dayPhase.dark > 0.4) ? '#ffe08a' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(wx, wy, 10, 10);
      });
    } else if (s.type === 'cactus') {
      const green = shadeColor('#4c7a3a', -Math.round(dayPhase.dark * 50));
      ctx.fillStyle = green;
      roundRect(ctx, x - 5, s.y, 10, 40, 5);
      ctx.fill();
      roundRect(ctx, x - 16, s.y + 12, 9, 20, 4);
      ctx.fill();
      roundRect(ctx, x + 7, s.y + 6, 9, 22, 4);
      ctx.fill();
    } else if (s.type === 'rock') {
      const grey = shadeColor('#8a8a86', -Math.round(dayPhase.dark * 55));
      ctx.fillStyle = grey;
      ctx.beginPath();
      ctx.ellipse(x, s.y + 30, 16 + s.seed * 6, 11 + s.seed * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - 8, s.y + 24, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStreetlamps(dayPhase) {
    if (dayPhase.dark < 0.35) return;
    const alpha = (dayPhase.dark - 0.35) / 0.65;
    const spacing = 180;
    for (let y = -spacing; y < H + spacing; y += spacing) {
      const yy = (y + roadOffset * 0.85) % (H + spacing) - spacing;
      [ROAD_LEFT - 14, ROAD_RIGHT + 14].forEach((lx) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        const grad = ctx.createRadialGradient(lx, yy, 0, lx, yy, 46);
        grad.addColorStop(0, 'rgba(255,230,150,0.55)');
        grad.addColorStop(1, 'rgba(255,230,150,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lx, yy, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#222';
        ctx.fillRect(lx - 2, yy - 4, 4, 18);
        ctx.fillStyle = '#ffe696';
        ctx.beginPath();
        ctx.arc(lx, yy - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  }

  function drawRoad(dayPhase) {
    ctx.fillStyle = dayPhase.grass;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = shadeColor(dayPhase.grass, -14);
    for (let y = -40; y < H + 40; y += 40) {
      const yy = (y + roadOffset) % (H + 40) - 40;
      ctx.fillRect(0, yy, ROAD_LEFT, 20);
      ctx.fillRect(ROAD_RIGHT, yy, ROAD_LEFT, 20);
    }

    for (const s of scenery) drawScenery(s, dayPhase);

    ctx.fillStyle = dayPhase.road;
    ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, H);

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

    ctx.strokeStyle = `rgba(255,255,255,${0.75 - dayPhase.dark * 0.25})`;
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

    drawStreetlamps(dayPhase);

    if (dayPhase.dark > 0.05) {
      ctx.fillStyle = `rgba(4,6,16,${dayPhase.dark * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawWeather() {
    for (const wp of weatherParticles) {
      if (wp.type === 'rain') {
        ctx.strokeStyle = 'rgba(180,200,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wp.x, wp.y);
        ctx.lineTo(wp.x + wp.vx * 0.03, wp.y + 14);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(wp.x + Math.sin(wp.drift) * 10, wp.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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

  function drawCar(c, x, y, w, h, body, windowColor, opts) {
    opts = opts || {};
    const night = opts.night || 0;
    c.save();
    c.translate(x, y);

    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(w / 2, h + 4, w / 2, 6, 0, 0, Math.PI * 2);
    c.fill();

    // headlight glow at night (drawn behind body, pointing forward/up)
    if (night > 0.3 && opts.isPlayer) {
      const grad = c.createRadialGradient(w / 2, -6, 2, w / 2, -30, 50);
      grad.addColorStop(0, `rgba(255,250,210,${0.35 * night})`);
      grad.addColorStop(1, 'rgba(255,250,210,0)');
      c.fillStyle = grad;
      c.beginPath();
      c.ellipse(w / 2, -20, 46, 60, 0, 0, Math.PI * 2);
      c.fill();
    }

    // body with gradient shading
    const grad = c.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, shadeColor(body, -25));
    grad.addColorStop(0.5, body);
    grad.addColorStop(1, shadeColor(body, -35));
    c.fillStyle = grad;
    roundRect(c, 0, 0, w, h, 8);
    c.fill();

    // windshield / rear window
    c.fillStyle = windowColor;
    roundRect(c, w * 0.15, h * 0.12, w * 0.7, h * 0.28, 4);
    c.fill();
    roundRect(c, w * 0.15, h * 0.6, w * 0.7, h * 0.22, 4);
    c.fill();

    // spoiler
    c.fillStyle = shadeColor(body, -45);
    c.fillRect(w * 0.1, h - 5, w * 0.8, 4);

    // headlights (front, top)
    c.fillStyle = night > 0.3 ? '#fffbe0' : '#fff7cc';
    c.fillRect(w * 0.08, 1, w * 0.18, 5);
    c.fillRect(w * 0.74, 1, w * 0.18, 5);

    // taillights (rear, bottom)
    c.fillStyle = '#ff4d4d';
    c.fillRect(w * 0.08, h - 6, w * 0.18, 4);
    c.fillRect(w * 0.74, h - 6, w * 0.18, 4);

    // wheels
    c.fillStyle = '#111';
    c.fillRect(-3, h * 0.12, 5, h * 0.22);
    c.fillRect(w - 2, h * 0.12, 5, h * 0.22);
    c.fillRect(-3, h * 0.62, 5, h * 0.22);
    c.fillRect(w - 2, h * 0.62, 5, h * 0.22);

    c.restore();
  }

  function drawPickup(p) {
    if (p.kind === 'fuel') { drawFuelCanister(p); return; }
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

  function drawFuelCanister(p) {
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(Math.sin(p.spin) * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, p.h / 2 - 1, p.w / 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d64545';
    roundRect(ctx, -p.w / 2, -p.h / 2 + 4, p.w, p.h - 6, 3);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(-p.w / 2 + 3, -2, p.w - 6, 4);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-3, -p.h / 2, 6, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-p.w / 2 + 2, -p.h / 2 + 6, p.w - 4, p.h - 11);
    ctx.restore();
  }

  function drawPowerupItem(pu) {
    const meta = POWERUP_META[pu.type];
    ctx.save();
    ctx.translate(pu.x + pu.w / 2, pu.y + pu.h / 2);
    ctx.rotate(pu.spin);
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? pu.w / 2 : pu.w / 3.4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(pu.x + pu.w / 2, pu.y + pu.h / 2);
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.icon, 0, 1);
    ctx.restore();
  }

  function drawBanana(hz) {
    ctx.save();
    ctx.translate(hz.x + hz.w / 2, hz.y + hz.h / 2);
    ctx.rotate(0.4);
    ctx.strokeStyle = '#e6c229';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 2, hz.w / 2, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();
    ctx.strokeStyle = '#7a5c1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 2, hz.w / 2, Math.PI * 0.12, Math.PI * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  function drawPothole(hz) {
    ctx.save();
    ctx.translate(hz.x + hz.w / 2, hz.y + hz.h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, hz.w / 2, hz.h / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, hz.w / 2 - 2, hz.h / 2.4 - 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoadblock(rb) {
    // Level-crossing-gate style: a low striped arm on two short legs, with a blinking warning light.
    for (const lane of rb.blockedLanes) {
      const bx = laneX(lane, rb.w);
      const armH = rb.h * 0.5;
      ctx.save();
      ctx.translate(bx, rb.y);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(6, rb.h - 3, rb.w - 12, 4);

      ctx.fillStyle = '#26282c';
      ctx.fillRect(6, armH - 2, 5, rb.h - armH + 2);
      ctx.fillRect(rb.w - 11, armH - 2, 5, rb.h - armH + 2);

      roundRect(ctx, 0, 0, rb.w, armH, armH * 0.5);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.save();
      roundRect(ctx, 0, 0, rb.w, armH, armH * 0.5);
      ctx.clip();
      ctx.fillStyle = '#e63946';
      const seg = rb.w / 5;
      ctx.fillRect(seg, 0, seg, armH);
      ctx.fillRect(seg * 3, 0, seg, armH);
      ctx.restore();

      const blink = Math.floor(elapsed * 4) % 2 === 0;
      ctx.fillStyle = blink ? '#ffb703' : 'rgba(255,183,3,0.35)';
      ctx.beginPath();
      ctx.arc(rb.w / 2, armH / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    for (let lane = 0; lane < LANES; lane++) {
      if (rb.blockedLanes.includes(lane)) continue;
      const ox = laneX(lane, rb.w) + rb.w / 2;
      ctx.save();
      ctx.translate(ox, rb.y - 16);
      ctx.fillStyle = 'rgba(60,220,120,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(-10, -6);
      ctx.lineTo(10, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTruck(t, night, c) {
    c = c || ctx;
    const { x, y, w, h, color } = t;
    c.save();
    c.translate(x, y);

    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(w / 2, h + 3, w / 2, 6, 0, 0, Math.PI * 2);
    c.fill();

    const cabH = h * 0.28;
    const boxH = h - cabH - 2;

    // cargo box / trailer (rear)
    const boxGrad = c.createLinearGradient(0, 0, w, 0);
    boxGrad.addColorStop(0, shadeColor('#d8dde3', -25 - night * 20));
    boxGrad.addColorStop(0.5, shadeColor('#e9edf1', -night * 15));
    boxGrad.addColorStop(1, shadeColor('#d8dde3', -25 - night * 20));
    c.fillStyle = boxGrad;
    roundRect(c, 0, cabH + 2, w, boxH, 5);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1;
    for (let ly = cabH + 12; ly < h - 6; ly += 14) {
      c.beginPath();
      c.moveTo(3, ly);
      c.lineTo(w - 3, ly);
      c.stroke();
    }

    // cab (front)
    const cabGrad = c.createLinearGradient(0, 0, w, 0);
    cabGrad.addColorStop(0, shadeColor(color, -25));
    cabGrad.addColorStop(0.5, color);
    cabGrad.addColorStop(1, shadeColor(color, -35));
    c.fillStyle = cabGrad;
    roundRect(c, 2, 0, w - 4, cabH + 6, 7);
    c.fill();

    c.fillStyle = '#cfeaff';
    roundRect(c, w * 0.14, cabH * 0.15, w * 0.72, cabH * 0.5, 3);
    c.fill();

    c.fillStyle = night > 0.3 ? '#fffbe0' : '#fff7cc';
    c.fillRect(w * 0.06, 1, w * 0.2, 5);
    c.fillRect(w * 0.74, 1, w * 0.2, 5);

    c.fillStyle = '#ff4d4d';
    c.fillRect(w * 0.06, h - 6, w * 0.18, 4);
    c.fillRect(w * 0.76, h - 6, w * 0.18, 4);

    // wheels: one axle under the cab, two under the box
    c.fillStyle = '#111';
    c.fillRect(-3, cabH - 6, 5, 16);
    c.fillRect(w - 2, cabH - 6, 5, 16);
    c.fillRect(-3, cabH + boxH * 0.35, 5, 16);
    c.fillRect(w - 2, cabH + boxH * 0.35, 5, 16);
    c.fillRect(-3, cabH + boxH * 0.7, 5, 16);
    c.fillRect(w - 2, cabH + boxH * 0.7, 5, 16);

    c.restore();
  }

  function drawMotorcycle(t, night, c) {
    c = c || ctx;
    const { x, y, w, h, color } = t;
    c.save();
    c.translate(x, y);

    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(w / 2, h - 2, w / 2 + 2, 4, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#111';
    c.beginPath();
    c.ellipse(w / 2, 4, w / 2, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(w / 2, h - 4, w / 2, 4, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = color;
    roundRect(c, w * 0.18, h * 0.28, w * 0.64, h * 0.44, w * 0.28);
    c.fill();

    c.fillStyle = night > 0.3 ? '#fffbe0' : '#fff7cc';
    c.beginPath();
    c.arc(w / 2, h * 0.16, w * 0.16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ff4d4d';
    c.beginPath();
    c.arc(w / 2, h * 0.84, w * 0.14, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#1b2735';
    c.beginPath();
    c.arc(w / 2, h * 0.34, w * 0.32, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  function drawPolice(x, y, night, c) {
    c = c || ctx;
    drawCar(c, x, y, player.w, player.h, '#1c1f26', '#cfeaff', { night, isPlayer: false });
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(0, player.h * 0.35, player.w, player.h * 0.18);
    const flash = Math.floor(elapsed * 6) % 2 === 0;
    c.fillStyle = flash ? '#ff3b3b' : '#2a6bff';
    roundRect(c, player.w * 0.2, -6, player.w * 0.6, 6, 2);
    c.fill();
    c.restore();
  }

  function drawCone(hz) {
    ctx.save();
    ctx.translate(hz.x + hz.w / 2, hz.y + hz.h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, hz.h / 2 - 2, hz.w / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7b00';
    ctx.beginPath();
    ctx.moveTo(0, -hz.h / 2);
    ctx.lineTo(hz.w / 2, hz.h / 2);
    ctx.lineTo(-hz.w / 2, hz.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-hz.w / 2, hz.h * 0.12, hz.w, 3);
    ctx.restore();
  }

  function drawOil(hz) {
    ctx.save();
    ctx.translate(hz.x + hz.w / 2, hz.y + hz.h / 2);
    ctx.fillStyle = 'rgba(15,15,20,0.75)';
    ctx.beginPath();
    ctx.ellipse(0, 0, hz.w / 2, hz.h / 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(-hz.w * 0.15, -hz.h * 0.1, hz.w * 0.18, hz.h * 0.1, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const tNorm = (elapsed % DAY_CYCLE) / DAY_CYCLE;
    const dayPhase = getDayPhase(tNorm, activeTheme);

    ctx.save();
    if (shake > 0) {
      const dx = (Math.random() - 0.5) * shake;
      const dy = (Math.random() - 0.5) * shake;
      ctx.translate(dx, dy);
    }

    drawRoad(dayPhase);

    for (const rb of roadblocks) drawRoadblock(rb);
    for (const p of pickups) drawPickup(p);
    for (const pu of powerups) drawPowerupItem(pu);
    for (const hz of hazards) {
      if (hz.type === 'cone') drawCone(hz);
      else if (hz.type === 'oil') drawOil(hz);
      else if (hz.type === 'banana') drawBanana(hz);
      else drawPothole(hz);
    }
    for (const t of traffic) {
      if (t.type === 'truck') drawTruck(t, dayPhase.dark);
      else if (t.type === 'moto') drawMotorcycle(t, dayPhase.dark);
      else drawCar(ctx, t.x, t.y, t.w, t.h, t.color, '#cfeaff', { night: dayPhase.dark });
    }

    if (police.gap < POLICE_VISIBLE_RANGE) {
      const py = player.y + player.h + police.gap;
      if (py < H + 40) drawPolice(police.x, py, dayPhase.dark);
    }

    if (state !== 'crashing' || crashTimer > 0.75) {
      if (player.spinTimer > 0) {
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        const angle = (1 - player.spinTimer / 0.8) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.translate(-cx, -cy);
        drawCar(ctx, player.x, player.y, player.w, player.h, player.car.body, player.car.window, { night: dayPhase.dark, isPlayer: true });
        ctx.restore();
      } else {
        drawCar(ctx, player.x, player.y, player.w, player.h, player.car.body, player.car.window, { night: dayPhase.dark, isPlayer: true });
      }
    }

    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      ctx.globalAlpha = 1;
    }

    drawWeather();

    if (player.fuel / player.maxFuel < 0.2) {
      const pulse = 0.25 + Math.sin(elapsed * 6) * 0.15;
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.72);
      vg.addColorStop(0, 'rgba(255,60,60,0)');
      vg.addColorStop(1, `rgba(255,40,40,${Math.max(0, pulse)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    if (crashFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${crashFlash * 0.85})`;
      ctx.fillRect(0, 0, W, H);
    }
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
    } else {
      draw();
    }
  }

  // initial UI + static draw
  renderGarage();
  renderScenario();
  renderDailyBest();
  draw();
})();
