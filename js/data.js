export const UPGRADE_MAX_LEVEL = 5;
export const UPGRADE_STAT_STEP = 0.05; // per level, added to car's base speed/handling
export const UPGRADE_TANK_STEP = 20; // per level, added to base max fuel

export function upgradeCost(level) {
  return 120 * (level + 1);
}

export const CARS = [
  { id: 'yellow', name: 'Amarelo Clássico', body: '#ffcc00', window: '#1b2735', cost: 0, speed: 0.55, handling: 0.60, nitro: 0.50 },
  { id: 'red', name: 'Vermelho Veloz', body: '#e63946', window: '#0d1117', cost: 250, speed: 0.90, handling: 0.40, nitro: 0.45 },
  { id: 'blue', name: 'Azul Ágil', body: '#457b9d', window: '#e9f5ff', cost: 250, speed: 0.40, handling: 0.95, nitro: 0.45 },
  { id: 'green', name: 'Verde Nitro', body: '#2a9d8f', window: '#eafff9', cost: 500, speed: 0.55, handling: 0.55, nitro: 0.95 },
  { id: 'purple', name: 'Roxo Lendário', body: '#8338ec', window: '#f3e8ff', cost: 900, speed: 0.80, handling: 0.75, nitro: 0.80 },
];

export const THEMES = [
  { id: 'city', name: 'Cidade', cost: 0, grassDay: '#3a5a2c', grassNight: '#111a0e', roadDay: '#2b2b30', roadNight: '#131316', scenery: ['tree', 'building'], weather: 'rain' },
  { id: 'desert', name: 'Deserto', cost: 400, grassDay: '#c9a86a', grassNight: '#2b2416', roadDay: '#3d362b', roadNight: '#18140f', scenery: ['cactus', 'rock'], weather: 'clear' },
  { id: 'snow', name: 'Nevado', cost: 700, grassDay: '#e8eef2', grassNight: '#1b232c', roadDay: '#4a5158', roadNight: '#16191d', scenery: ['pine', 'rock'], weather: 'snow' },
];

export const ACHIEVEMENTS = [
  { id: 'survive60', icon: '⏱️', name: 'Resistente', desc: 'Sobreviva 60s em uma corrida' },
  { id: 'score1000', icon: '💯', name: 'Milha de Ouro', desc: 'Alcance 1000 pontos em uma corrida' },
  { id: 'coins10', icon: '🪙', name: 'Colecionador', desc: 'Colete 10 moedas em uma corrida' },
  { id: 'combo5', icon: '🌀', name: 'Quase Lá', desc: 'Faça um combo de 5 desvios por pouco' },
  { id: 'nitro5', icon: '🔥', name: 'Turbo Puro', desc: 'Use o nitro por 5s seguidos' },
  { id: 'garage', icon: '🏆', name: 'Garagem Completa', desc: 'Desbloqueie todos os carros' },
  { id: 'themes', icon: '🗺️', name: 'Explorador', desc: 'Desbloqueie todos os cenários' },
  { id: 'police_evade', icon: '🚔', name: 'Fuga Perfeita', desc: 'Escape da polícia depois dela quase te pegar' },
  { id: 'mechanic', icon: '🔧', name: 'Mecânico', desc: 'Deixe um carro no nível máximo de upgrade' },
];

export function carById(id) { return CARS.find((c) => c.id === id) || CARS[0]; }
export function themeById(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }
