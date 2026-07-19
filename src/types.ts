export type MapType = 'ARENA' | 'BATTLEFIELD' | 'LOBBY';

export type WeaponType = 'ASSAULT_RIFLE' | 'SNIPER_RIFLE' | 'FIST' | 'RPG' | 'GRENADE' | 'SCYTHE' | 'PISTOL';
export type MeleeWeaponType = 'FIST' | 'SCYTHE';

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
    fireRate: 100, // 0.1s
    reloadTime: 1500, // 1.5s
    aimTime: 0.133, // 0.133s zoom time
    hipSpread: 2.0, // 2 degrees
    adsSpread: 0.1, // 0.1 degrees
    zoomFov: 45, // zoom in
    moveSpeedMod: 0.9,
  },
  SNIPER_RIFLE: {
    type: 'SNIPER_RIFLE',
    name: 'Sniper Rifle',
    nameKo: '저격소총',
    maxAmmo: 12,
    damage: 50,
    fireRate: 1500, // slow rate of fire (bolt-action-like)
    reloadTime: 1800, // 1.8s
    aimTime: 0.233, // 0.233s zoom time
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
    aimTime: 0.067, // very fast
    hipSpread: 0.1,
    adsSpread: 0.1,
    zoomFov: 75, // no zoom
    moveSpeedMod: 1.1, // +10%
  },
  SCYTHE: {
    type: 'SCYTHE',
    name: 'Scythe',
    nameKo: '낫',
    maxAmmo: 1,
    damage: 35,
    fireRate: 700, // 0.7s
    reloadTime: 1000, // 1.0s
    aimTime: 0.1,
    hipSpread: 0.1,
    adsSpread: 0.1,
    zoomFov: 75,
    moveSpeedMod: 1.0,
  },
  RPG: {
    type: 'RPG',
    name: 'Rocket Launcher',
    nameKo: 'RPG',
    maxAmmo: 1, // Single shot per reload
    damage: 100, // Direct hit
    fireRate: 250, // 0.25s fire rate
    reloadTime: 1000, // 1.0s reload
    aimTime: 0.267, // Slow aim time
    hipSpread: 1.0,
    adsSpread: 0.5,
    zoomFov: 50, // Moderate zoom
    moveSpeedMod: 0.85, // -15%
  },
  GRENADE: {
    type: 'GRENADE',
    name: 'Grenade',
    nameKo: '수류탄',
    maxAmmo: 1,
    damage: 75,
    fireRate: 500,
    reloadTime: 100,
    aimTime: 1.333, // 1.333s to cook/self-detonate
    hipSpread: 0.1,
    adsSpread: 0.1,
    zoomFov: 75,
    moveSpeedMod: 1.0,
  },
  PISTOL: {
    type: 'PISTOL',
    name: 'Pistol',
    nameKo: '권총',
    maxAmmo: 13,
    damage: 12,
    fireRate: 150, // 0.15s
    reloadTime: 1000, // 1.0s
    aimTime: 0.2, // 0.2s
    hipSpread: 0.8, // 0.8 degrees
    adsSpread: 0.1, // 0.1 degrees
    zoomFov: 70, // Slightly zoom
    moveSpeedMod: 1.0,
  },
};

export interface GameState {
  stage: 'MENU' | 'WEAPON_SELECT' | 'MELEE_WEAPON_SELECT' | 'PLAYING' | 'ROUND_END' | 'MATCH_END';
  selectedMap: MapType;
  playerScore: number;
  enemyScore: number;
  currentRound: number;
  playerWeapon: WeaponType | null;
  playerMeleeWeapon: MeleeWeaponType | null;
  roundWinner: 'PLAYER' | 'ENEMY' | null;
  matchWinner: 'PLAYER' | 'ENEMY' | null;
}
