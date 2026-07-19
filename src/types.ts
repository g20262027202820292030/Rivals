export type MapType = 'ARENA' | 'BATTLEFIELD';

export type WeaponType = 'ASSAULT_RIFLE' | 'SNIPER_RIFLE' | 'FIST' | 'RPG';

export interface WeaponConfig {
  type: WeaponType;
  name: string;
  nameKo: string;
  maxAmmo: number;
  damage: number;
  fireRate: number; // in ms between shots
  reloadTime: number; // in ms
  aimTime: number; // in seconds
  hipSpread: number; // in degrees
  adsSpread: number; // in degrees
  zoomFov: number; // camera FOV when aimed
  moveSpeedMod?: number; // default is 1.0 if not specified
}

export const WEAPON_CONFIGS: Record<WeaponType, WeaponConfig> = {
  ASSAULT_RIFLE: {
    type: 'ASSAULT_RIFLE',
    name: 'Assault Rifle',
    nameKo: '돌격소총',
    maxAmmo: 20,
    damage: 12, // Headshot critical will be handled in game logic
    fireRate: 120, // 0.12s
    reloadTime: 1500, // 1.5s
    aimTime: 0.2, // 0.2s zoom time
    hipSpread: 2.0, // 2 degrees
    adsSpread: 0.1, // 0.1 degrees
    zoomFov: 45, // zoom in
    moveSpeedMod: 1.0,
  },
  SNIPER_RIFLE: {
    type: 'SNIPER_RIFLE',
    name: 'Sniper Rifle',
    nameKo: '저격소총',
    maxAmmo: 4,
    damage: 50,
    fireRate: 1500, // slow rate of fire (bolt-action-like)
    reloadTime: 2000, // 2.0s
    aimTime: 0.35, // 0.35s zoom time
    hipSpread: 10.0, // 10 degrees
    adsSpread: 0.1, // 0.1 degrees
    zoomFov: 15, // highly zoomed in
    moveSpeedMod: 0.9, // -10%
  },
  FIST: {
    type: 'FIST',
    name: 'Fist',
    nameKo: '주먹',
    maxAmmo: 1,
    damage: 30,
    fireRate: 350, // fast punch speed
    reloadTime: 100, // negligible
    aimTime: 0.1, // very fast
    hipSpread: 0.1,
    adsSpread: 0.1,
    zoomFov: 75, // no zoom
    moveSpeedMod: 1.1, // +10%
  },
  RPG: {
    type: 'RPG',
    name: 'Rocket Launcher',
    nameKo: 'RPG',
    maxAmmo: 1, // Single shot per reload
    damage: 100, // Direct hit
    fireRate: 250, // 0.25s fire rate
    reloadTime: 1000, // 1.0s reload
    aimTime: 0.4, // Slow aim time
    hipSpread: 1.0,
    adsSpread: 0.5,
    zoomFov: 50, // Moderate zoom
    moveSpeedMod: 0.85, // -15%
  },
};

export interface GameState {
  stage: 'MENU' | 'WEAPON_SELECT' | 'PLAYING' | 'ROUND_END' | 'MATCH_END';
  selectedMap: MapType;
  playerScore: number;
  enemyScore: number;
  currentRound: number;
  playerWeapon: WeaponType | null;
  roundWinner: 'PLAYER' | 'ENEMY' | null;
  matchWinner: 'PLAYER' | 'ENEMY' | null;
}
