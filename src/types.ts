export type MapType = 'ARENA' | 'BATTLEFIELD';

export type WeaponType = 'ASSAULT_RIFLE' | 'SNIPER_RIFLE';

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
}

export const WEAPON_CONFIGS: Record<WeaponType, WeaponConfig> = {
  ASSAULT_RIFLE: {
    type: 'ASSAULT_RIFLE',
    name: 'Assault Rifle',
    nameKo: '돌격소총',
    maxAmmo: 20,
    damage: 12,
    fireRate: 120, // 0.12s
    reloadTime: 1500, // 1.5s
    aimTime: 0.7, // 0.7s zoom time
    hipSpread: 2.0, // 2 degrees
    adsSpread: 0.1, // 0.1 degrees
    zoomFov: 45, // zoom in
  },
  SNIPER_RIFLE: {
    type: 'SNIPER_RIFLE',
    name: 'Sniper Rifle',
    nameKo: '저격소총',
    maxAmmo: 4,
    damage: 50,
    fireRate: 1500, // slow rate of fire (bolt-action-like)
    reloadTime: 2000, // 2.0s
    aimTime: 1.1, // 1.1s zoom time
    hipSpread: 10.0, // 10 degrees
    adsSpread: 0.1, // 0.1 degrees
    zoomFov: 15, // highly zoomed in
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
