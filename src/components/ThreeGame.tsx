import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapType, WeaponType, WEAPON_CONFIGS } from '../types';
import {
  playShootSound,
  playHitSound,
  playKillSound,
  playReloadSound,
  playSlideSound,
  playJumpSound,
  playHurtSound,
  playFistSwingSound,
} from '../utils/audio';

interface ThreeGameProps {
  mapType: MapType;
  meleeWeapon: MeleeWeaponType;
  weaponType: WeaponType;
  round: number;
  onRoundComplete: (winner: 'PLAYER' | 'ENEMY') => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  updateHUD: (stats: {
    playerHP: number;
    ammo: number;
    maxAmmo: number;
    isAiming: boolean;
    aimProgress: number;
    isReloading: boolean;
    reloadProgress: number;
    hitActive: boolean;
    damageFlashActive: boolean;
    isSliding: boolean;
    isSlideCooldown: boolean;
    primaryWeapon: WeaponType;
    grenadeCooldown?: number;
    grenadeCookTimer?: number;
    reserveAmmo?: number;
  }) => void;
  onWeaponChange?: (weapon: WeaponType) => void;
  onStartMatch?: () => void;
}

interface FloatingText {
  id: string;
  text: string;
  pos: THREE.Vector3;
  color: string;
  isCrit: boolean;
  age: number; // 0 to 1
}

interface EnemyBot {
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  velocity: THREE.Vector3;
  lastShotTime: number;
  shootInterval: number;
  state: 'PATROL' | 'CHASE' | 'COVER';
  targetPos: THREE.Vector3;
  stateTimer: number;
  width: number;
  height: number;
  weapon: WeaponType;
  baseWeapon: WeaponType;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
  isAiming: boolean;
  aimTimer: number;
  grenadeCooldown: number;
}

interface Obstacle {
  box: THREE.Box3;
  mesh: THREE.Mesh;
}

export default function ThreeGame({
  mapType,
  meleeWeapon,
  weaponType,
  round,
  onRoundComplete,
  isLocked,
  setIsLocked,
  updateHUD,
  onWeaponChange,
  onStartMatch,
}: ThreeGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep track of primary weapon on mount, and dynamic weapon callback
  const primaryWeaponRef = useRef<WeaponType>(weaponType);
  const meleeWeaponRef = useRef<MeleeWeaponType>(meleeWeapon);
  const onWeaponChangeRef = useRef(onWeaponChange);
  const onStartMatchRef = useRef(onStartMatch);
  const grenadeCookTimerRef = useRef(0);

  useEffect(() => {
    meleeWeaponRef.current = meleeWeapon;
  }, [meleeWeapon]);

  const [isNearButton, setIsNearButton] = useState(false);
  const isNearButtonRef = useRef(false);

  useEffect(() => {
    onWeaponChangeRef.current = onWeaponChange;
  }, [onWeaponChange]);

  useEffect(() => {
    onStartMatchRef.current = onStartMatch;
  }, [onStartMatch]);

  // States for React-rendered elements (like floating damage numbers)
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  // Core Game loop states held in refs for speed and bypass React re-renders
  const stateRef = useRef({
    // Player specs
    playerHP: 150,
    maxHP: 150,
    ammo: WEAPON_CONFIGS[weaponType].maxAmmo,
    maxAmmo: WEAPON_CONFIGS[weaponType].maxAmmo,
    weaponType: weaponType,

    // Coordinates and Physics
    playerPos: new THREE.Vector3(0, 1.6, 15), // center-ish, eye level
    playerVelocity: new THREE.Vector3(),
    playerHeight: 1.6,
    isGrounded: true,
    
    // Rotation (Mouse look)
    yaw: 0,
    pitch: 0,

    // Slide state
    isSliding: false,
    slideTime: 0,
    slideDirection: new THREE.Vector3(),
    slideCooldown: 0,

    // Scythe Dash state
    scytheDashTime: 0,
    scytheDashDir: new THREE.Vector3(),

    // Aim / Reload
    isAiming: false,
    aimProgress: 0, // 0 to 1
    isReloading: false,
    reloadProgress: 0, // 0 to 1
    reloadTimer: 0,
    lastShotTime: 0,
    equipTimer: 0,
    equipDuration: 0.1,

    // Feedback
    hitActive: false,
    hitTimer: 0,
    damageFlashActive: false,
    damageFlashTimer: 0,

    // Round logic
    roundEnded: false,
    jumpCount: 0,

    // Grenade Utility State
    grenadeCooldown: 0,
    quickMeleeTimer: 0,
    fistSwingLeft: false,
    quickMeleeReturnWeapon: null as WeaponType | null,
    quickMeleeSwitchBackTimer: 0,
    weaponReserves: {
      ASSAULT_RIFLE: 100,
      SNIPER_RIFLE: 12,
      RPG: 15,
      FIST: 0,
      GRENADE: 0,
      SCYTHE: 0,
      PISTOL: 91,
    } as Record<WeaponType, number>,
  });

  // Track keyboard inputs
  const keysRef = useRef<Record<string, boolean>>({});

  // ThreeJS variables
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gunGroupRef = useRef<THREE.Group | null>(null);
  const lastScytheDashTimeRef = useRef(0);
  const playerModelRef = useRef<THREE.Group | null>(null);
  const gunMuzzleRef = useRef<THREE.Object3D | null>(null);
  const enemiesRef = useRef<EnemyBot[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const tracersRef = useRef<{ line: THREE.Line; age: number; maxAge: number }[]>([]);
  const particlesRef = useRef<{ system: THREE.Points; velocities: number[]; age: number; maxAge: number }[]>([]);
  const rocketsRef = useRef<{
    mesh: THREE.Mesh;
    direction: THREE.Vector3;
    speed: number;
    damage: number;
    splashDamage: number;
    splashRadius: number;
    owner: 'PLAYER' | 'ENEMY';
  }[]>([]);
  const activeGrenadesRef = useRef<{
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    timer: number;
    damage: number;
    owner: 'PLAYER' | 'ENEMY';
  }[]>([]);

  // Update weapon config when prop changes
  useEffect(() => {
    const config = WEAPON_CONFIGS[weaponType];
    stateRef.current.weaponType = weaponType;
    stateRef.current.ammo = config.maxAmmo;
    stateRef.current.maxAmmo = config.maxAmmo;
    stateRef.current.isReloading = false;
    stateRef.current.isAiming = false;
    stateRef.current.aimProgress = 0;

    let eTime = 0.1;
    if (weaponType === 'ASSAULT_RIFLE') eTime = 0.65;
    else if (weaponType === 'SNIPER_RIFLE') eTime = 0.85;
    else if (weaponType === 'RPG') eTime = 1.0;
    else if (weaponType === 'FIST') eTime = 0.5;
    else if (weaponType === 'GRENADE') eTime = 0.85;
    else if (weaponType === 'PISTOL') eTime = 0.2;
    else if (weaponType === 'SCYTHE') eTime = 0.3;

    stateRef.current.equipTimer = eTime;
    stateRef.current.equipDuration = eTime;
    
    // Remember the chosen primary weapon (must not be FIST, SCYTHE, or GRENADE)
    if (weaponType !== 'FIST' && weaponType !== 'SCYTHE' && weaponType !== 'GRENADE') {
      primaryWeaponRef.current = weaponType;
    }

    if (weaponType !== 'FIST' && weaponType !== 'SCYTHE') {
      stateRef.current.quickMeleeSwitchBackTimer = 0;
      stateRef.current.quickMeleeReturnWeapon = null;
    }
    
    // Re-create gun model
    if (sceneRef.current && cameraRef.current) {
      createGunModel();
    }
  }, [weaponType]);

  // Pointer Lock handling
  useEffect(() => {
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === containerRef.current;
      setIsLocked(locked);
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [setIsLocked]);

  const requestLock = () => {
    if (containerRef.current) {
      containerRef.current.requestPointerLock();
    }
  };

  // Helper to create beautiful modular materials
  const materials = {
    sand: new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.9, metalness: 0.1 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.2, metalness: 0.1 }),
    pillarBase: new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5 }),
    woodBox: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.8 }),
    rustyMetal: new THREE.MeshStandardMaterial({ color: 0x8b3e2f, roughness: 0.7, metalness: 0.6 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0x4f4f4f, roughness: 0.9 }),
    glowingRed: new THREE.MeshBasicMaterial({ color: 0xff0000 }),
    neonYellow: new THREE.MeshBasicMaterial({ color: 0xffff00 }),
    
    // Roblox Rivals Symmetrical Map Materials
    plasticWhite: new THREE.MeshStandardMaterial({ color: 0xf0f0f3, roughness: 0.4, metalness: 0.1 }),
    plasticDark: new THREE.MeshStandardMaterial({ color: 0x1e222b, roughness: 0.5, metalness: 0.15 }),
    rivalsRed: new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.3, metalness: 0.1 }),
    rivalsBlue: new THREE.MeshStandardMaterial({ color: 0x007aff, roughness: 0.3, metalness: 0.1 }),
    rivalsOrange: new THREE.MeshStandardMaterial({ color: 0xff9500, roughness: 0.4, metalness: 0.1 }),
    neonRed: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    neonBlue: new THREE.MeshBasicMaterial({ color: 0x00a8ff }),
    neonGreen: new THREE.MeshBasicMaterial({ color: 0x34c759 }),
    neonYellowBasic: new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    neonCyan: new THREE.MeshBasicMaterial({ color: 0x00f5ff }),
  };

  // Build static gun model & attach to camera
  const createGunModel = () => {
    if (!cameraRef.current) return;

    // Clean old gun
    if (gunGroupRef.current) {
      cameraRef.current.remove(gunGroupRef.current);
    }

    const gunGroup = new THREE.Group();
    const currentWeaponType = stateRef.current.weaponType;
    const isSniper = currentWeaponType === 'SNIPER_RIFLE';
    const isFist = currentWeaponType === 'FIST';

    // Construct gun or fist out of multiple boxes/cylinders for a retro look
    if (isFist) {
      // Melee: Dual Fists
      // Left Arm
      const leftArmGroup = new THREE.Group();
      leftArmGroup.name = 'left_arm_group';
      leftArmGroup.position.set(-0.18, -0.02, -0.15);

      const leftArmGeo = new THREE.BoxGeometry(0.08, 0.08, 0.25);
      const leftArmMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 }); // Crimson red
      const leftArm = new THREE.Mesh(leftArmGeo, leftArmMat);
      leftArm.position.set(0, 0, -0.15);
      leftArmGroup.add(leftArm);

      const leftHandGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const leftHandMat = new THREE.MeshStandardMaterial({ color: 0xff0a0a, roughness: 0.4 }); // Bright red
      const leftHand = new THREE.Mesh(leftHandGeo, leftHandMat);
      leftHand.position.set(0, 0, -0.28);
      leftArmGroup.add(leftHand);

      const leftKnuckleGeo = new THREE.BoxGeometry(0.08, 0.02, 0.02);
      const leftKnuckle = new THREE.Mesh(leftKnuckleGeo, materials.glowingRed);
      leftKnuckle.position.set(0, 0.04, -0.33);
      leftArmGroup.add(leftKnuckle);

      gunGroup.add(leftArmGroup);

      // Right Arm
      const rightArmGroup = new THREE.Group();
      rightArmGroup.name = 'right_arm_group';
      rightArmGroup.position.set(0.18, -0.02, -0.15);

      const rightArmGeo = new THREE.BoxGeometry(0.08, 0.08, 0.25);
      const rightArmMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 }); // Crimson red
      const rightArm = new THREE.Mesh(rightArmGeo, rightArmMat);
      rightArm.position.set(0, 0, -0.15);
      rightArmGroup.add(rightArm);

      const rightHandGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const rightHandMat = new THREE.MeshStandardMaterial({ color: 0xff0a0a, roughness: 0.4 }); // Bright red
      const rightHand = new THREE.Mesh(rightHandGeo, rightHandMat);
      rightHand.position.set(0, 0, -0.28);
      rightArmGroup.add(rightHand);

      const rightKnuckleGeo = new THREE.BoxGeometry(0.08, 0.02, 0.02);
      const rightKnuckle = new THREE.Mesh(rightKnuckleGeo, materials.glowingRed);
      rightKnuckle.position.set(0, 0.04, -0.33);
      rightArmGroup.add(rightKnuckle);

      gunGroup.add(rightArmGroup);

      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, -0.05, -0.35);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'SCYTHE') {
      // Scythe
      const handleGeo = new THREE.BoxGeometry(0.05, 0.8, 0.05);
      const handleMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }); // Dark wood
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0, -0.2, -0.3);
      gunGroup.add(handle);

      const bladeGeo = new THREE.BoxGeometry(0.5, 0.1, 0.05);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.8 }); // Silver
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.2, 0.2, -0.3);
      blade.rotation.z = Math.PI / 4;
      gunGroup.add(blade);
      
      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -0.35);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'PISTOL') {
      // Pistol
      const bodyGeo = new THREE.BoxGeometry(0.04, 0.08, 0.2);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.6 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, -0.05, -0.1);
      gunGroup.add(body);
      
      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, -0.05, -0.25);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (isSniper) {
      // Sniper rifle (Roblox Rivals Bright Lime-Green & Black Style)
      // Main Body/Receiver Material: Vibrant lime green
      const greenBodyMat = new THREE.MeshStandardMaterial({ color: 0x5cd600, roughness: 0.15, metalness: 0.1 });
      const blackMetalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.7 });
      const scopeBodyMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.3 });

      // Main body (vibrant lime green blocky receiver)
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.65);
      const body = new THREE.Mesh(bodyGeo, greenBodyMat);
      body.position.set(0, -0.02, -0.15);
      gunGroup.add(body);

      // Under-body Handguard/Forearm (Vibrant lime green)
      const forearmGeo = new THREE.BoxGeometry(0.08, 0.07, 0.3);
      const forearm = new THREE.Mesh(forearmGeo, greenBodyMat);
      forearm.position.set(0, -0.07, -0.35);
      gunGroup.add(forearm);

      // Long Black Barrel sticking out from the green frame
      const barrelGeo = new THREE.BoxGeometry(0.035, 0.035, 0.95);
      const barrel = new THREE.Mesh(barrelGeo, blackMetalMat);
      barrel.position.set(0, -0.02, -0.75);
      gunGroup.add(barrel);

      // Black Muzzle Brake at the tip
      const brakeGeo = new THREE.BoxGeometry(0.055, 0.055, 0.15);
      const brake = new THREE.Mesh(brakeGeo, blackMetalMat);
      brake.position.set(0, -0.02, -1.2);
      gunGroup.add(brake);

      // Tactical Black Magazine sticking down in front of trigger
      const magGeo = new THREE.BoxGeometry(0.06, 0.16, 0.08);
      const mag = new THREE.Mesh(magGeo, blackMetalMat);
      mag.position.set(0, -0.14, -0.1);
      gunGroup.add(mag);

      // High-Fidelity Tactical Scope (Dual-cylinders / support mounts)
      // Main center scope tube
      const scopeBodyGeo = new THREE.BoxGeometry(0.048, 0.048, 0.38);
      const scope = new THREE.Mesh(scopeBodyGeo, scopeBodyMat);
      scope.position.set(0, 0.09, -0.15);
      gunGroup.add(scope);

      // Scope front wide bell (objective bell)
      const scopeFrontGeo = new THREE.BoxGeometry(0.062, 0.062, 0.08);
      const scopeFront = new THREE.Mesh(scopeFrontGeo, scopeBodyMat);
      scopeFront.position.set(0, 0.09, -0.34);
      gunGroup.add(scopeFront);

      // Scope rear bell (eyepiece)
      const scopeRearGeo = new THREE.BoxGeometry(0.056, 0.056, 0.06);
      const scopeRear = new THREE.Mesh(scopeRearGeo, scopeBodyMat);
      scopeRear.position.set(0, 0.09, 0.04);
      gunGroup.add(scopeRear);

      // Front lens (glowing red center)
      const lensGeo = new THREE.PlaneGeometry(0.052, 0.052);
      const lensMat = materials.neonRed;
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 0.09, -0.381);
      lens.rotation.y = Math.PI; // Face outwards
      gunGroup.add(lens);

      // Scope dual mounts holding it up from receiver
      const mount1Geo = new THREE.BoxGeometry(0.025, 0.04, 0.04);
      const mount1 = new THREE.Mesh(mount1Geo, blackMetalMat);
      mount1.position.set(0, 0.05, -0.22);
      gunGroup.add(mount1);

      const mount2 = new THREE.Mesh(mount1Geo, blackMetalMat);
      mount2.position.set(0, 0.05, -0.06);
      gunGroup.add(mount2);

      // Green Stock with Cheek Rest
      const stockGeo = new THREE.BoxGeometry(0.06, 0.12, 0.25);
      const stock = new THREE.Mesh(stockGeo, greenBodyMat);
      stock.position.set(0, -0.07, 0.2);
      gunGroup.add(stock);

      // Black Stock Buttpad
      const padGeo = new THREE.BoxGeometry(0.062, 0.13, 0.04);
      const pad = new THREE.Mesh(padGeo, blackMetalMat);
      pad.position.set(0, -0.075, 0.32);
      gunGroup.add(pad);

      // Angled black pistol grip
      const gripGeo = new THREE.BoxGeometry(0.048, 0.14, 0.05);
      const grip = new THREE.Mesh(gripGeo, blackMetalMat);
      grip.position.set(0, -0.14, 0.02);
      grip.rotation.x = -0.3;
      gunGroup.add(grip);

      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, -0.02, -1.3);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'ASSAULT_RIFLE') {
      // Assault Rifle (Roblox Rivals Boxy Style)
      // Main body
      const bodyGeo = new THREE.BoxGeometry(0.07, 0.14, 0.45);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, -0.05, -0.15);
      gunGroup.add(body);

      // Bright Orange Accents (Rivals style)
      const accentGeo = new THREE.BoxGeometry(0.072, 0.03, 0.2);
      const accentMat = materials.rivalsOrange;
      const accent = new THREE.Mesh(accentGeo, accentMat);
      accent.position.set(0, 0.01, -0.15);
      gunGroup.add(accent);

      // Blocky Barrel
      const barrelGeo = new THREE.BoxGeometry(0.03, 0.03, 0.35);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(0, -0.02, -0.45);
      gunGroup.add(barrel);

      // Magazine (straight box)
      const magGeo = new THREE.BoxGeometry(0.04, 0.18, 0.08);
      const magMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.7 });
      const mag = new THREE.Mesh(magGeo, magMat);
      mag.position.set(0, -0.18, -0.1);
      gunGroup.add(mag);

      // Blocky sight
      const sightBaseGeo = new THREE.BoxGeometry(0.04, 0.04, 0.08);
      const sightBase = new THREE.Mesh(sightBaseGeo, magMat);
      sightBase.position.set(0, 0.04, -0.15);
      gunGroup.add(sightBase);

      const sightGlassGeo = new THREE.PlaneGeometry(0.03, 0.03);
      const sightGlassMat = materials.neonCyan;
      const sightGlass = new THREE.Mesh(sightGlassGeo, sightGlassMat);
      sightGlass.rotation.y = Math.PI;
      sightGlass.position.set(0, 0.04, -0.191);
      gunGroup.add(sightGlass);

      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, -0.02, -0.65);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'RPG') {
      // RPG Boxy Style (Roblox Rivals)
      const tubeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.9);
      const tubeMat = new THREE.MeshStandardMaterial({ color: 0x2e3b32, roughness: 0.6 });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.position.set(0, 0, -0.3);
      gunGroup.add(tube);

      // Rocket warhead sticking out front (blocky cone)
      const warheadGeo = new THREE.CylinderGeometry(0.0, 0.05, 0.2, 4); // 4-sided cone
      const warheadMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
      const warhead = new THREE.Mesh(warheadGeo, warheadMat);
      warhead.rotation.x = Math.PI / 2;
      warhead.rotation.y = Math.PI / 4;
      warhead.position.set(0, 0, -0.85);
      gunGroup.add(warhead);
      
      // Neon green band
      const bandGeo = new THREE.BoxGeometry(0.082, 0.082, 0.05);
      const bandMat = materials.neonGreen;
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(0, 0, -0.7);
      gunGroup.add(band);

      // Handle/Grip
      const gripGeo = new THREE.BoxGeometry(0.04, 0.15, 0.04);
      const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.position.set(0, -0.1, -0.1);
      gunGroup.add(grip);
      
      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -1.0);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'GRENADE') {
      // Grenade utility 3D visual (oblong olive green pineapple grenade)
      const bodyGeo = new THREE.SphereGeometry(0.05, 16, 16);
      bodyGeo.scale(1, 1.3, 1); // oblong pineapple shape
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e4a28, roughness: 0.8 }); // olive green
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 0, -0.1);
      gunGroup.add(body);

      // Top cap/cylinder
      const capGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x5e5f61, roughness: 0.5 }); // silver steel
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 0.07, -0.1);
      gunGroup.add(cap);

      // Lever/handle
      const leverGeo = new THREE.BoxGeometry(0.01, 0.08, 0.02);
      const lever = new THREE.Mesh(leverGeo, capMat);
      lever.position.set(0, 0.04, -0.08);
      lever.rotation.x = 0.2;
      gunGroup.add(lever);

      // Pull ring
      const ringGeo = new THREE.RingGeometry(0.015, 0.022, 16);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x8e8f91, metalness: 0.8, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(-0.02, 0.07, -0.1);
      ring.rotation.y = Math.PI / 2;
      gunGroup.add(ring);

      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -0.25);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    }

    // Default rest position (off to the bottom-right)
    gunGroup.position.set(0.25, -0.22, -0.35);
    cameraRef.current.add(gunGroup);
    gunGroupRef.current = gunGroup;
  };

  const createBaconHairCharacter = (isEnemy = false) => {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 }); // White skin
    const shirtColor = isEnemy ? 0xcc0000 : 0x1d5a9d; // Red for enemies, blue for player
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 }); 
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }); 
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }); 
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }); 
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }); 

    // Torso (Blue shirt)
    const torsoGeo = new THREE.CylinderGeometry(0.39, 0.39, 1.05, 16, 1, false, -Math.PI / 3, (2 * Math.PI) / 3);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 1.05;
    torso.rotation.y = Math.PI; 
    torso.castShadow = true;
    group.add(torso);

    // Jacket (Black cylinder overlay)
    const jacketGeo = new THREE.CylinderGeometry(0.38, 0.38, 1.1, 16);
    const jacket = new THREE.Mesh(jacketGeo, jacketMat);
    jacket.position.y = 1.05;
    jacket.castShadow = true;
    group.add(jacket);

    // Head
    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.85;
    head.castShadow = true;
    group.add(head);

    // Face
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 1.9, 0.26);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.1, 1.9, 0.26);
    group.add(rightEye);
    
    // Smile
    const smileGroup = new THREE.Group();
    smileGroup.position.set(0, 1.8, 0.28);
    const smileCurve = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), eyeMat);
    smileCurve.rotation.z = Math.PI;
    smileGroup.add(smileCurve);
    group.add(smileGroup);

    // Bacon Hair
    const hairGroup = new THREE.Group();
    hairGroup.position.set(0, 2.1, 0);

    // Base hair cap to prevent bald spots
    const baseGeo = new THREE.SphereGeometry(0.31, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.8);
    const baseHair = new THREE.Mesh(baseGeo, hairMat);
    baseHair.position.set(0, -0.22, 0);
    hairGroup.add(baseHair);
    
    // Front spikes
    const h1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 8, 8), hairMat);
    h1.rotation.set(0, 0, Math.PI/3);
    h1.position.set(0, 0.05, 0.1);
    hairGroup.add(h1);
    
    const h2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 8, 8), hairMat);
    h2.rotation.set(Math.PI/4, 0, -Math.PI/4);
    h2.position.set(-0.2, -0.05, 0.1);
    hairGroup.add(h2);
    
    const h3 = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 8, 8), hairMat);
    h3.rotation.set(-Math.PI/4, 0, Math.PI/4);
    h3.position.set(0.2, -0.05, 0.1);
    hairGroup.add(h3);
    
    // Side and Back hair (Thinner Bacon strips)
    const hBack = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 8, 8), hairMat);
    hBack.rotation.set(-Math.PI/2, 0, 0);
    hBack.position.set(0, -0.1, -0.2);
    hairGroup.add(hBack);

    const hSideL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 8, 8), hairMat);
    hSideL.rotation.set(0, 0, Math.PI/2);
    hSideL.position.set(-0.25, -0.1, 0);
    hairGroup.add(hSideL);

    const hSideR = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.7, 8, 8), hairMat); // Longer right side
    hSideR.rotation.set(0, 0, -Math.PI/2);
    hSideR.position.set(0.25, -0.1, 0);
    hairGroup.add(hSideR);

    // Extra back coverage
    const hBackL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 8, 8), hairMat);
    hBackL.rotation.set(-Math.PI/4, -Math.PI/6, Math.PI/4);
    hBackL.position.set(-0.15, -0.15, -0.25);
    hairGroup.add(hBackL);

    const hBackR = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 8, 8), hairMat);
    hBackR.rotation.set(-Math.PI/4, Math.PI/6, -Math.PI/4);
    hBackR.position.set(0.15, -0.15, -0.25);
    hairGroup.add(hBackR);

    group.add(hairGroup);

    // Arms (Pivot at shoulder)
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.5, 8, 8); 
    
    const lArm = new THREE.Group();
    lArm.position.set(-0.45, 1.4, 0); // Shoulder pivot
    lArm.name = 'left_arm';
    const lArmMesh = new THREE.Mesh(armGeo, skinMat);
    lArmMesh.position.set(0, -0.3, 0);
    lArmMesh.castShadow = true;
    lArm.add(lArmMesh);
    const lSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 8, 8), jacketMat);
    lSleeve.position.set(0, -0.15, 0);
    lArm.add(lSleeve);
    group.add(lArm);

    const rArm = new THREE.Group();
    rArm.position.set(0.45, 1.4, 0);
    rArm.name = 'right_arm';
    const rArmMesh = new THREE.Mesh(armGeo, skinMat);
    rArmMesh.position.set(0, -0.3, 0);
    rArmMesh.castShadow = true;
    rArm.add(rArmMesh);
    const rSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 8, 8), jacketMat);
    rSleeve.position.set(0, -0.15, 0);
    rArm.add(rSleeve);
    group.add(rArm);

    // Legs (Pivot at hip)
    const legGeo = new THREE.CapsuleGeometry(0.15, 0.5, 8, 8);
    
    const lLeg = new THREE.Group();
    lLeg.position.set(-0.18, 0.5, 0); // Hip pivot
    lLeg.name = 'left_leg';
    const lLegMesh = new THREE.Mesh(legGeo, pantsMat);
    lLegMesh.position.set(0, -0.25, 0);
    lLegMesh.castShadow = true;
    lLeg.add(lLegMesh);
    const lShoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.08, 8, 8), shoeMat);
    lShoe.position.set(0, -0.5, 0.05);
    lLeg.add(lShoe);
    group.add(lLeg);

    const rLeg = new THREE.Group();
    rLeg.position.set(0.18, 0.5, 0);
    rLeg.name = 'right_leg';
    const rLegMesh = new THREE.Mesh(legGeo, pantsMat);
    rLegMesh.position.set(0, -0.25, 0);
    rLegMesh.castShadow = true;
    rLeg.add(rLegMesh);
    const rShoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.08, 8, 8), shoeMat);
    rShoe.position.set(0, -0.5, 0.05);
    rLeg.add(rShoe);
    group.add(rLeg);

    return group;
  };

  // Main game setup and cleanup
  useEffect(() => {
    // 1. Initialize ThreeJS Renderer, Scene, Camera
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Reset player state for the start of the round/map
    const state = stateRef.current;
    state.playerHP = 150;
    state.maxHP = 150;
    state.ammo = WEAPON_CONFIGS[weaponType].maxAmmo;
    state.maxAmmo = WEAPON_CONFIGS[weaponType].maxAmmo;
    state.isReloading = false;
    state.isAiming = false;
    state.aimProgress = 0;
    state.roundEnded = false;
    state.weaponReserves = {
      ASSAULT_RIFLE: 100,
      SNIPER_RIFLE: 12,
      RPG: 15,
      FIST: 0,
      GRENADE: 0,
    };
    state.playerVelocity.set(0, 0, 0);
    state.pitch = 0;
    state.yaw = 0; // facing north (towards negative z)

    // Set map-specific spawn position
    if (mapType === 'ARENA') {
      state.playerPos.set(0, 1.6, 25);
    } else if (mapType === 'BATTLEFIELD') {
      state.playerPos.set(0, 1.6, 35);
    } else if (mapType === 'LOBBY') {
      state.playerPos.set(0, 1.6, 0);
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Set map backgrounds/fog
    if (mapType === 'ARENA') {
      scene.background = new THREE.Color(0xfae1b0); // sandy/sunset peach
      scene.fog = new THREE.FogExp2(0xfae1b0, 0.015);
    } else if (mapType === 'BATTLEFIELD') {
      scene.background = new THREE.Color(0x1a2130); // dark cloudy battlefield
      scene.fog = new THREE.FogExp2(0x1a2130, 0.01);
    } else if (mapType === 'LOBBY') {
      scene.background = new THREE.Color(0x070913); // dark sleek tech space lobby background
      scene.fog = new THREE.FogExp2(0x070913, 0.018); // slight sci-fi haze
    }

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.rotation.order = 'YXZ';
    cameraRef.current = camera;
    scene.add(camera); // Add camera to scene to attach lights or models to it

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    // 2. Add Lighting
    let ambientIntensity = 0.3;
    let dirIntensity = 0.6;
    if (mapType === 'ARENA') {
      ambientIntensity = 0.6;
      dirIntensity = 1.2;
    } else if (mapType === 'LOBBY') {
      ambientIntensity = 0.25;
      dirIntensity = 0.3;
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff3e0, dirIntensity);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(hemisphereLight);

    // 3. Generate Map Geometry & Obstacles
    obstaclesRef.current = [];
    rocketsRef.current = [];
    generateMap(scene, mapType);

    // 4. Create Gun Model
    createGunModel();
    if (mapType === 'LOBBY' && gunGroupRef.current) {
      gunGroupRef.current.visible = false;
    }

    // Create Player 3D Character Model if in LOBBY mode (Third-person view)
    if (mapType === 'LOBBY') {
      const playerGroup = createBaconHairCharacter();
      scene.add(playerGroup);
      playerModelRef.current = playerGroup;
    }

    // 5. Spawn Enemy Bots (Round depends on score or a set value)
    enemiesRef.current = [];
    if (mapType !== 'LOBBY') {
      // Spawn exactly 1 enemy bot as requested
      const botCount = 1;
      for (let i = 0; i < botCount; i++) {
        spawnBot(scene, i);
      }
    }

    // 6. Setup Event Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;

      if (key === 'e' && isNearButtonRef.current && mapType === 'LOBBY') {
        if (onStartMatchRef.current) {
          onStartMatchRef.current();
        }
        return;
      }

      // Handle Reload trigger
      if (key === 'r') {
        triggerReload();
      }

      // Handle Slide trigger
      if (key === 'c') {
        triggerSlide();
      }

      // Handle Jump trigger
      if (key === ' ' && !e.repeat) {
        triggerJump();
      }

      // Handle Quick Melee
      if (key === 'q' && !e.repeat) {
        triggerQuickMelee();
      }

      // 1: Switch to primary weapon
      if (key === '1') {
        stateRef.current.quickMeleeSwitchBackTimer = 0;
        stateRef.current.quickMeleeReturnWeapon = null;
        stateRef.current.weaponType = primaryWeaponRef.current;
        stateRef.current.ammo = WEAPON_CONFIGS[primaryWeaponRef.current].maxAmmo;
        stateRef.current.maxAmmo = WEAPON_CONFIGS[primaryWeaponRef.current].maxAmmo;
        if (onWeaponChangeRef.current) {
          onWeaponChangeRef.current(primaryWeaponRef.current);
        }
        createGunModel();
      }

      // 2: Switch to Pistol
      if (key === '2') {
        stateRef.current.quickMeleeSwitchBackTimer = 0;
        stateRef.current.quickMeleeReturnWeapon = null;
        stateRef.current.weaponType = 'PISTOL';
        stateRef.current.ammo = WEAPON_CONFIGS['PISTOL'].maxAmmo;
        stateRef.current.maxAmmo = WEAPON_CONFIGS['PISTOL'].maxAmmo;
        stateRef.current.isReloading = false; // Reset reloading
        if (onWeaponChangeRef.current) {
          onWeaponChangeRef.current('PISTOL');
        }
        createGunModel();
      }

      // 3: Switch to selected melee weapon
      if (key === '3') {
        stateRef.current.quickMeleeSwitchBackTimer = 0;
        stateRef.current.quickMeleeReturnWeapon = null;
        stateRef.current.weaponType = meleeWeaponRef.current;
        stateRef.current.ammo = 0; // Melee weapons have infinite ammo
        stateRef.current.maxAmmo = 0;
        stateRef.current.isReloading = false; // Reset reloading
        if (onWeaponChangeRef.current) {
          onWeaponChangeRef.current(meleeWeaponRef.current);
        }
        createGunModel();
      }

      // 4: Switch to Grenade utility
      if (key === '4') {
        stateRef.current.quickMeleeSwitchBackTimer = 0;
        stateRef.current.quickMeleeReturnWeapon = null;
        stateRef.current.weaponType = 'GRENADE';
        stateRef.current.ammo = WEAPON_CONFIGS['GRENADE'].maxAmmo;
        stateRef.current.maxAmmo = WEAPON_CONFIGS['GRENADE'].maxAmmo;
        if (onWeaponChangeRef.current) {
          onWeaponChangeRef.current('GRENADE');
        }
        createGunModel();
      }

      // Handle Scythe F-key dash
      if (key === 'f' && stateRef.current.weaponType === 'SCYTHE') {
        triggerScytheDash(true);
      }
    };

    const triggerScytheDash = (isFKey = false) => {
      const state = stateRef.current;
      if (performance.now() - lastScytheDashTimeRef.current < 4000) return;

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
      state.scytheDashDir.copy(forward).normalize();
      state.scytheDashTime = 0.35; // 0.35s duration
      const dashPower = 28;
      state.playerVelocity.x = state.scytheDashDir.x * dashPower;
      state.playerVelocity.z = state.scytheDashDir.z * dashPower;
      state.playerVelocity.y = 0; // Keep dash horizontal

      lastScytheDashTimeRef.current = performance.now();

      if (isFKey && state.quickMeleeReturnWeapon) {
        if (onWeaponChangeRef.current) {
            onWeaponChangeRef.current(state.quickMeleeReturnWeapon);
        }
        state.weaponType = state.quickMeleeReturnWeapon;
        state.quickMeleeReturnWeapon = null;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    // Mouse events
    const handleMouseMove = (e: MouseEvent) => {
      if (mapType === 'LOBBY') {
        // Drag to rotate camera when in Lobby and mouse is pressed
        if (e.buttons === 1 || e.buttons === 2) {
          const sensitivity = 0.003;
          const state = stateRef.current;
          state.yaw -= e.movementX * sensitivity;
          state.pitch -= e.movementY * sensitivity;
          
          // Limit pitch in Lobby to avoid going completely vertical
          const limit = Math.PI / 4;
          state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
        }
        return;
      }

      if (document.pointerLockElement !== container) return;

      const sensitivity = 0.0022;
      const state = stateRef.current;

      state.yaw -= e.movementX * sensitivity;
      state.pitch -= e.movementY * sensitivity;

      // Limit pitch (look up/down) to avoid flipping over
      const limit = Math.PI / 2.05;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (mapType === 'LOBBY') {
        // In the lobby, check if they clicked while near the 3D button
        if (e.button === 0 && isNearButtonRef.current) {
          if (onStartMatchRef.current) {
            onStartMatchRef.current();
          }
        }
        // Never request pointer lock in the lobby to keep mouse pointer completely free and visible
        return;
      }

      if (document.pointerLockElement !== container) {
        requestLock();
        return;
      }

      if (e.button === 0) {
        // Left click: Shoot/Hold fire flag
        keysRef.current['left_click'] = true;
      } else if (e.button === 2) {
        // Right click: ADS Aim toggle/hold or Scythe dash
        if (stateRef.current.weaponType === 'SCYTHE') {
          triggerScytheDash(false);
        } else {
          stateRef.current.isAiming = true;
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        keysRef.current['left_click'] = false;
      } else if (e.button === 2) {
        stateRef.current.isAiming = false;
      }
    };

    const preventDefaultContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('contextmenu', preventDefaultContextMenu);

    // 7. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // 8. Start Game Loop
    let animationId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      animationId = requestAnimationFrame(loop);
      
      const delta = Math.min((time - lastTime) / 1000, 0.1); // cap delta to avoid physics explosions
      lastTime = time;

      updateGame(delta);
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animationId = requestAnimationFrame(loop);

    // Cleanups
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('contextmenu', preventDefaultContextMenu);
      resizeObserver.disconnect();
      
      // Memory cleanup for threejs
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      scene.clear();
    };
  }, [mapType, round]);

  // Generates maps procedurally using static colors/geometries matching Roblox Rivals aesthetic
  const generateMap = (scene: THREE.Scene, type: MapType) => {
    if (type === 'ARENA') {
      // --- 1. ROBLOX RIVALS SYMMETRICAL ARENA ---
      // Clean modern white plastic floor
      const floorGeo = new THREE.CylinderGeometry(40, 40, 1, 64);
      const floor = new THREE.Mesh(floorGeo, materials.plasticWhite);
      floor.position.set(0, -0.5, 0);
      floor.receiveShadow = true;
      scene.add(floor);

      // Clean tech grid helper overlaid on the floor
      const grid = new THREE.GridHelper(80, 40, 0x888888, 0xdddddd);
      grid.position.set(0, 0.01, 0);
      scene.add(grid);

      // Symmetrical Outer Boundary with Neon strips
      addCircularBorder(scene, 40, 10, materials.plasticDark);

      // Add Neon strips around the outer perimeter (glowing Red on south, Blue on north)
      const neonSegmentCount = 32;
      const neonGeo = new THREE.BoxGeometry(2 * Math.PI * 39.8 / neonSegmentCount + 0.2, 0.2, 0.2);
      for (let i = 0; i < neonSegmentCount; i++) {
        const angle = (i / neonSegmentCount) * Math.PI * 2;
        const x = Math.cos(angle) * 39.8;
        const z = Math.sin(angle) * 39.8;

        const neonMat = z > 0 ? materials.neonRed : materials.neonBlue;
        const strip = new THREE.Mesh(neonGeo, neonMat);
        strip.position.set(x, 9.8, z);
        strip.rotation.y = -angle;
        scene.add(strip);
      }

      // --- CENTRAL ELEVATED GLASS BRIDGE ---
      // Transparent blue glass bridge platform that players can walk under and stand on top of
      const bridgeGeo = new THREE.BoxGeometry(6, 0.4, 14);
      const bridgeMesh = new THREE.Mesh(bridgeGeo, materials.glass);
      bridgeMesh.position.set(0, 3.0, 0);
      bridgeMesh.castShadow = true;
      bridgeMesh.receiveShadow = true;
      scene.add(bridgeMesh);
      addObstacle(bridgeGeo, bridgeMesh);

      // Glowing Neon Green edges on the glass bridge sides
      const trimGeoL = new THREE.BoxGeometry(0.1, 0.45, 14);
      const trimL = new THREE.Mesh(trimGeoL, materials.neonGreen);
      trimL.position.set(-3.05, 3.0, 0);
      scene.add(trimL);

      const trimR = new THREE.Mesh(trimGeoL, materials.neonGreen);
      trimR.position.set(3.05, 3.0, 0);
      scene.add(trimR);

      // Semi-transparent side handrails on the glass bridge
      const railGeo = new THREE.BoxGeometry(0.15, 1.0, 14);
      const railL = new THREE.Mesh(railGeo, materials.glass);
      railL.position.set(-2.9, 3.7, 0);
      scene.add(railL);
      addObstacle(railGeo, railL);

      const railR = new THREE.Mesh(railGeo, materials.glass);
      railR.position.set(2.9, 3.7, 0);
      scene.add(railR);
      addObstacle(railGeo, railR);

      // Glowing neon cyan top trim on handrails
      const topTrimGeo = new THREE.BoxGeometry(0.2, 0.1, 14);
      const topTrimL = new THREE.Mesh(topTrimGeo, materials.neonCyan);
      topTrimL.position.set(-2.9, 4.25, 0);
      scene.add(topTrimL);

      const topTrimR = new THREE.Mesh(topTrimGeo, materials.neonCyan);
      topTrimR.position.set(2.9, 4.25, 0);
      scene.add(topTrimR);

      // --- SYMMETRICAL ACCESS STAIRS / RAMPS (BLOCKY ROBLOX STYLE) ---
      // South Side (Red theme stairs going up to bridge from Z = 13 to Z = 7)
      const redStairSpecs = [
        { size: [6, 1.0, 2], pos: [0, 0.5, 12], mat: materials.plasticDark, neon: materials.neonRed },
        { size: [6, 2.1, 2], pos: [0, 1.05, 10], mat: materials.plasticDark, neon: materials.neonRed },
        { size: [6, 3.2, 2], pos: [0, 1.6, 8], mat: materials.plasticDark, neon: materials.neonRed },
      ];
      redStairSpecs.forEach(({ size, pos, mat, neon }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        addObstacle(geo, mesh);

        // Neon warning stripe on step edge
        const stripeGeo = new THREE.BoxGeometry(size[0] + 0.05, 0.1, 0.1);
        const stripe = new THREE.Mesh(stripeGeo, neon);
        stripe.position.set(pos[0], pos[1] + size[1]/2, pos[2] - size[2]/2 + 0.05);
        scene.add(stripe);
      });

      // North Side (Blue theme stairs going up to bridge from Z = -13 to Z = -7)
      const blueStairSpecs = [
        { size: [6, 1.0, 2], pos: [0, 0.5, -12], mat: materials.plasticDark, neon: materials.neonBlue },
        { size: [6, 2.1, 2], pos: [0, 1.05, -10], mat: materials.plasticDark, neon: materials.neonBlue },
        { size: [6, 3.2, 2], pos: [0, 1.6, -8], mat: materials.plasticDark, neon: materials.neonBlue },
      ];
      blueStairSpecs.forEach(({ size, pos, mat, neon }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        addObstacle(geo, mesh);

        // Neon warning stripe on step edge
        const stripeGeo = new THREE.BoxGeometry(size[0] + 0.05, 0.1, 0.1);
        const stripe = new THREE.Mesh(stripeGeo, neon);
        stripe.position.set(pos[0], pos[1] + size[1]/2, pos[2] + size[2]/2 - 0.05);
        scene.add(stripe);
      });

      // --- Left & Right Symmetrical Side Pillars ---
      const pillarGeo = new THREE.BoxGeometry(3, 8, 3);
      const sidePillars = [
        { pos: [-14, 4, 6], mat: materials.rivalsRed, neon: materials.neonRed },
        { pos: [14, 4, 6], mat: materials.rivalsRed, neon: materials.neonRed },
        { pos: [-14, 4, -6], mat: materials.rivalsBlue, neon: materials.neonBlue },
        { pos: [14, 4, -6], mat: materials.rivalsBlue, neon: materials.neonBlue },
      ];

      sidePillars.forEach(({ pos, mat, neon }) => {
        const pillar = new THREE.Mesh(pillarGeo, mat);
        pillar.position.set(pos[0], pos[1], pos[2]);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        scene.add(pillar);
        addObstacle(pillarGeo, pillar);

        // Add glowing neon accent band on each side pillar
        const bandGeo = new THREE.BoxGeometry(3.15, 0.3, 3.15);
        const band = new THREE.Mesh(bandGeo, neon);
        band.position.set(pos[0], pos[1] + 1.5, pos[2]);
        scene.add(band);
      });

      // --- Symmetrical Tactical Crates / Covers ---
      const crates = [
        // South Side (Player - Red style)
        { size: [3, 3, 3], pos: [-7, 1.5, 17], mat: materials.rivalsRed, neon: materials.neonRed },
        { size: [2, 2, 2], pos: [7, 1, 18], mat: materials.rivalsRed, neon: materials.neonRed },
        { size: [3, 2, 3], pos: [11, 1, 12], mat: materials.rivalsRed, neon: materials.neonRed, rot: 0.4 },
        { size: [2.5, 2.5, 2.5], pos: [-11, 1.25, 22], mat: materials.rivalsRed, neon: materials.neonRed, rot: -0.2 },

        // North Side (Enemy - Blue style)
        { size: [3, 3, 3], pos: [7, 1.5, -17], mat: materials.rivalsBlue, neon: materials.neonBlue },
        { size: [2, 2, 2], pos: [-7, 1, -18], mat: materials.rivalsBlue, neon: materials.neonBlue },
        { size: [3, 2, 3], pos: [-11, 1, -12], mat: materials.rivalsBlue, neon: materials.neonBlue, rot: 0.4 },
        { size: [2.5, 2.5, 2.5], pos: [11, 1.25, -22], mat: materials.rivalsBlue, neon: materials.neonBlue, rot: -0.2 },
      ];

      crates.forEach(({ size, pos, mat, neon, rot }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const box = new THREE.Mesh(geo, mat);
        box.position.set(pos[0], pos[1], pos[2]);
        if (rot) box.rotation.y = rot;
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
        addObstacle(geo, box);

        // Glowing trim at top edge of each crate
        const trimGeo = new THREE.BoxGeometry(size[0] + 0.1, 0.15, size[2] + 0.1);
        const trim = new THREE.Mesh(trimGeo, neon);
        trim.position.set(pos[0], pos[1] + size[1]/2, pos[2]);
        if (rot) trim.rotation.y = rot;
        scene.add(trim);
      });

      // Spawn Portal Arches with glowing team forcefields
      // South Spawn (Player)
      const southPortalFrameGeo = new THREE.BoxGeometry(10, 6, 1.5);
      const southPortal = new THREE.Mesh(southPortalFrameGeo, materials.plasticDark);
      southPortal.position.set(0, 3, 34);
      scene.add(southPortal);
      addObstacle(southPortalFrameGeo, southPortal);

      const southForcefieldGeo = new THREE.BoxGeometry(8, 5, 0.1);
      const southForcefield = new THREE.Mesh(southForcefieldGeo, materials.neonRed);
      southForcefield.position.set(0, 2.5, 33.9);
      scene.add(southForcefield);

      // North Spawn (Enemy)
      const northPortalFrameGeo = new THREE.BoxGeometry(10, 6, 1.5);
      const northPortal = new THREE.Mesh(northPortalFrameGeo, materials.plasticDark);
      northPortal.position.set(0, 3, -34);
      scene.add(northPortal);
      addObstacle(northPortalFrameGeo, northPortal);

      const northForcefieldGeo = new THREE.BoxGeometry(8, 5, 0.1);
      const northForcefield = new THREE.Mesh(northForcefieldGeo, materials.neonBlue);
      northForcefield.position.set(0, 2.5, -33.9);
      scene.add(northForcefield);

    } else if (type === 'BATTLEFIELD') {
      // --- 2. ROBLOX RIVALS CONTAINER BATTLEFIELD ---
      // Tech-styled steel/dark plastic ground plane
      const floorGeo = new THREE.BoxGeometry(100, 1, 100);
      const floor = new THREE.Mesh(floorGeo, materials.plasticDark);
      floor.position.set(0, -0.5, 0);
      floor.receiveShadow = true;
      scene.add(floor);

      // Neon-cyan grid on dark floor
      const grid = new THREE.GridHelper(100, 50, 0x00f5ff, 0x1f2430);
      grid.position.set(0, 0.01, 0);
      scene.add(grid);

      // Boundary Walls with hazard safety stripes
      const borderGeoX = new THREE.BoxGeometry(100, 14, 1.5);
      const borderGeoZ = new THREE.BoxGeometry(1.5, 14, 100);

      const walls = [
        { geo: borderGeoX, pos: [0, 7, 50] },
        { geo: borderGeoX, pos: [0, 7, -50] },
        { geo: borderGeoZ, pos: [50, 7, 0] },
        { geo: borderGeoZ, pos: [-50, 7, 0] },
      ];

      walls.forEach(({ geo, pos }) => {
        const wall = new THREE.Mesh(geo, materials.plasticDark);
        wall.position.set(pos[0], pos[1], pos[2]);
        wall.receiveShadow = true;
        scene.add(wall);
        addObstacle(geo, wall);

        // Add bottom safety warning trim
        const hazardGeo = pos[0] === 0 
          ? new THREE.BoxGeometry(100, 1.2, 1.6) 
          : new THREE.BoxGeometry(1.6, 1.2, 100);
        const hazardMesh = new THREE.Mesh(hazardGeo, materials.rivalsOrange);
        hazardMesh.position.set(pos[0], 0.6, pos[2]);
        scene.add(hazardMesh);
      });

      // Helper function to build detailed solid containers
      const createContainerMesh = (size: number[], pos: number[], mat: THREE.Material, rot?: number) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const containerMesh = new THREE.Mesh(geo, mat);
        containerMesh.position.set(pos[0], pos[1], pos[2]);
        if (rot) containerMesh.rotation.y = rot;
        containerMesh.castShadow = true;
        containerMesh.receiveShadow = true;
        scene.add(containerMesh);
        addObstacle(geo, containerMesh);

        // Corrugated details on the containers (vertical ridges)
        const ridgesCount = 6;
        const ridgeWidth = 0.2;
        const ridgeGeo = new THREE.BoxGeometry(ridgeWidth, size[1], size[2] + 0.15);
        for (let i = 0; i < ridgesCount; i++) {
          const rx = -size[0]/2 + (size[0] / (ridgesCount - 1)) * i;
          const ridge = new THREE.Mesh(ridgeGeo, mat);
          ridge.position.set(rx, 0, 0);
          containerMesh.add(ridge);
        }
      };

      // Helper function to build OPEN shipping containers players can run through
      const createOpenContainer = (pos: number[], mat: THREE.Material, rot?: number) => {
        // Aligned along Z. Width 5, Height 4, Length 12.
        const leftWallGeo = new THREE.BoxGeometry(0.2, 4, 12);
        const rightWallGeo = new THREE.BoxGeometry(0.2, 4, 12);
        const ceilingGeo = new THREE.BoxGeometry(5.2, 0.2, 12);

        // Left wall
        const leftWall = new THREE.Mesh(leftWallGeo, mat);
        leftWall.position.set(pos[0] - 2.5, pos[1], pos[2]);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        scene.add(leftWall);
        addObstacle(leftWallGeo, leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(rightWallGeo, mat);
        rightWall.position.set(pos[0] + 2.5, pos[1], pos[2]);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        scene.add(rightWall);
        addObstacle(rightWallGeo, rightWall);

        // Ceiling
        const ceiling = new THREE.Mesh(ceilingGeo, mat);
        ceiling.position.set(pos[0], pos[1] + 2.0, pos[2]);
        ceiling.castShadow = true;
        ceiling.receiveShadow = true;
        scene.add(ceiling);
        addObstacle(ceilingGeo, ceiling);
      };

      // --- HIGH VERTICAL CONTAINER TOWERS (CLIMBABLE/JUMPABLE ON TOP) ---
      // Red Side Container Stack Tower (Left)
      createContainerMesh([12, 4, 5], [-20, 2, 20], materials.rivalsRed);
      createContainerMesh([12, 4, 5], [-20, 6, 20], materials.rivalsRed);
      createContainerMesh([12, 4, 5], [-20, 10, 20], materials.rivalsRed);

      // Blue Side Container Stack Tower (Right)
      createContainerMesh([12, 4, 5], [20, 2, -20], materials.rivalsBlue);
      createContainerMesh([12, 4, 5], [20, 6, -20], materials.rivalsBlue);
      createContainerMesh([12, 4, 5], [20, 10, -20], materials.rivalsBlue);

      // Angled Ground Containers for cover
      createContainerMesh([12, 4, 5], [18, 2, 25], materials.rivalsRed, 0.5);
      createContainerMesh([12, 4, 5], [-18, 2, -25], materials.rivalsBlue, 0.5);

      // Far Back Stacked Containers
      createContainerMesh([12, 4, 5], [-30, 2, 38], materials.rivalsRed, -0.2);
      createContainerMesh([12, 4, 5], [-30, 6, 38], materials.rivalsRed, -0.2);

      createContainerMesh([12, 4, 5], [30, 2, -38], materials.rivalsBlue, -0.2);
      createContainerMesh([12, 4, 5], [30, 6, -38], materials.rivalsBlue, -0.2);

      // --- CENTRAL CONFLICT ZONE CONTAINERS (MIDDLE LANES) ---
      // Stacked neutral orange containers in center lane
      createContainerMesh([12, 4, 5], [-12, 2, 0], materials.rivalsOrange, 0.8);
      createContainerMesh([12, 4, 5], [-12, 6, 0], materials.rivalsOrange, 0.8); // double stack center-left

      createContainerMesh([12, 4, 5], [12, 2, 0], materials.rivalsOrange, -0.8);
      createContainerMesh([12, 4, 5], [12, 6, 0], materials.rivalsOrange, -0.8); // double stack center-right

      // --- OPEN WALKTHROUGH SHIPPING CONTAINERS (ROBLOX RIVALS STYLE) ---
      // Red Side Open Tunnel (Left Lane)
      createOpenContainer([-16, 2, 5], materials.rivalsRed);

      // Blue Side Open Tunnel (Right Lane)
      createOpenContainer([16, 2, -5], materials.rivalsBlue);

      // --- Concrete Barricades / Sandbags ---
      const barricades = [
        { size: [6, 2, 1.5], pos: [0, 1, 10], mat: materials.concrete },
        { size: [6, 2, 1.5], pos: [0, 1, -10], mat: materials.concrete },
        { size: [5, 2, 1.5], pos: [-32, 1, 10], mat: materials.concrete, rot: 0.3 },
        { size: [5, 2, 1.5], pos: [32, 1, -10], mat: materials.concrete, rot: 0.3 },
        { size: [4, 1.5, 4], pos: [35, 0.75, 18], mat: materials.plasticDark },
        { size: [4, 1.5, 4], pos: [-35, 0.75, -18], mat: materials.plasticDark },
      ];

      barricades.forEach(({ size, pos, mat, rot }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos[0], pos[1], pos[2]);
        if (rot) mesh.rotation.y = rot;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        addObstacle(geo, mesh);

        // Add safety warning yellow/orange stripes to concrete barricades
        const stripeGeo = new THREE.BoxGeometry(size[0] + 0.1, 0.2, size[2] + 0.1);
        const stripe = new THREE.Mesh(stripeGeo, materials.rivalsOrange);
        stripe.position.set(pos[0], pos[1] - 0.2, pos[2]);
        if (rot) stripe.rotation.y = rot;
        scene.add(stripe);
      });

      // Tall Light Poles with Spotlights
      const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 16, 8);
      const bulbGeo = new THREE.SphereGeometry(0.8, 16, 16);
      const polePositions = [
        [-38, 8, 0],
        [38, 8, 0]
      ];

      polePositions.forEach((pos) => {
        // Pole mesh
        const pole = new THREE.Mesh(poleGeo, materials.plasticDark);
        pole.position.set(pos[0], pos[1], pos[2]);
        scene.add(pole);

        // Bulb mesh
        const bulb = new THREE.Mesh(bulbGeo, materials.neonYellowBasic);
        bulb.position.set(pos[0], pos[1] + 8, pos[2]);
        scene.add(bulb);

        // SpotLight pointing to the center of the arena
        const spotLight = new THREE.SpotLight(0xfff5cc, 3.0, 50, Math.PI/3, 0.5, 1);
        spotLight.position.set(pos[0], pos[1] + 8, pos[2]);
        spotLight.target.position.set(0, 0, 0);
        spotLight.castShadow = true;
        scene.add(spotLight);
        scene.add(spotLight.target);
      });
    } else if (type === 'LOBBY') {
      // --- 3. ROBLOX RIVALS LOBBY MAP ---
      // 1. Central cylindrical room floor
      const centerFloorGeo = new THREE.CylinderGeometry(14, 14, 1, 64);
      const centerFloor = new THREE.Mesh(centerFloorGeo, materials.plasticWhite);
      centerFloor.position.set(0, -0.5, 0);
      centerFloor.receiveShadow = true;
      scene.add(centerFloor);

      // Clean tech grid helper overlaid on the floor
      const grid = new THREE.GridHelper(80, 40, 0x00f5ff, 0x3b4252);
      grid.position.set(0, 0.01, 0);
      scene.add(grid);

      // 2. 4 pathways going North, South, East, West (8 units wide, 24 units long)
      const pathLength = 24;
      const pathWidth = 8;
      
      // East Pathway Floor
      const floorEastGeo = new THREE.BoxGeometry(pathLength, 1, pathWidth);
      const floorEast = new THREE.Mesh(floorEastGeo, materials.plasticWhite);
      floorEast.position.set(24, -0.5, 0);
      floorEast.receiveShadow = true;
      scene.add(floorEast);

      // West Pathway Floor
      const floorWestGeo = new THREE.BoxGeometry(pathLength, 1, pathWidth);
      const floorWest = new THREE.Mesh(floorWestGeo, materials.plasticWhite);
      floorWest.position.set(-24, -0.5, 0);
      floorWest.receiveShadow = true;
      scene.add(floorWest);

      // North Pathway Floor
      const floorNorthGeo = new THREE.BoxGeometry(pathWidth, 1, pathLength);
      const floorNorth = new THREE.Mesh(floorNorthGeo, materials.plasticWhite);
      floorNorth.position.set(0, -0.5, -24);
      floorNorth.receiveShadow = true;
      scene.add(floorNorth);

      // South Pathway Floor
      const floorSouthGeo = new THREE.BoxGeometry(pathWidth, 1, pathLength);
      const floorSouth = new THREE.Mesh(floorSouthGeo, materials.plasticWhite);
      floorSouth.position.set(0, -0.5, 24);
      floorSouth.receiveShadow = true;
      scene.add(floorSouth);

      // 3. Central curved walls with openings for hallways
      const numSegments = 32;
      const wallSegmentGeo = new THREE.BoxGeometry(2 * Math.PI * 14 / numSegments + 0.5, 12, 2);
      for (let i = 0; i < numSegments; i++) {
        const angle = (i / numSegments) * Math.PI * 2;
        
        // Skip wall segments near the 4 cardinal directions (North, South, East, West openings)
        const isNearOpening = 
          Math.abs(Math.sin(angle)) < 0.28 || 
          Math.abs(Math.cos(angle)) < 0.28;
        
        if (!isNearOpening) {
          const x = Math.cos(angle) * 14;
          const z = Math.sin(angle) * 14;
          
          const wall = new THREE.Mesh(wallSegmentGeo, materials.plasticDark);
          wall.position.set(x, 6, z);
          wall.rotation.y = -angle;
          wall.receiveShadow = true;
          wall.castShadow = true;
          scene.add(wall);
          addObstacle(wallSegmentGeo, wall);

          // Add glowing neon strip accent on the central walls
          const neonStripGeo = new THREE.BoxGeometry(2 * Math.PI * 14 / numSegments + 0.6, 0.3, 2.1);
          const neonStrip = new THREE.Mesh(neonStripGeo, materials.neonCyan);
          neonStrip.position.set(x, 6, z);
          neonStrip.rotation.y = -angle;
          scene.add(neonStrip);
        }
      }

      // 4. Hallway Walls (Height 12)
      // East Pathway Walls
      const wallEastNS_Geo = new THREE.BoxGeometry(pathLength, 12, 1);
      
      const wallEastNorth = new THREE.Mesh(wallEastNS_Geo, materials.plasticDark);
      wallEastNorth.position.set(24, 6, -4.5);
      scene.add(wallEastNorth);
      addObstacle(wallEastNS_Geo, wallEastNorth);

      const wallEastSouth = new THREE.Mesh(wallEastNS_Geo, materials.plasticDark);
      wallEastSouth.position.set(24, 6, 4.5);
      scene.add(wallEastSouth);
      addObstacle(wallEastNS_Geo, wallEastSouth);

      // East Pathway End Wall
      const wallEastEndGeo = new THREE.BoxGeometry(1, 12, pathWidth + 2);
      const wallEastEnd = new THREE.Mesh(wallEastEndGeo, materials.plasticDark);
      wallEastEnd.position.set(36.5, 6, 0);
      scene.add(wallEastEnd);
      addObstacle(wallEastEndGeo, wallEastEnd);

      // West Pathway Walls
      const wallWestNorth = new THREE.Mesh(wallEastNS_Geo, materials.plasticDark);
      wallWestNorth.position.set(-24, 6, -4.5);
      scene.add(wallWestNorth);
      addObstacle(wallEastNS_Geo, wallWestNorth);

      const wallWestSouth = new THREE.Mesh(wallEastNS_Geo, materials.plasticDark);
      wallWestSouth.position.set(-24, 6, 4.5);
      scene.add(wallWestSouth);
      addObstacle(wallEastNS_Geo, wallWestSouth);

      // West Pathway End Wall
      const wallWestEnd = new THREE.Mesh(wallEastEndGeo, materials.plasticDark);
      wallWestEnd.position.set(-36.5, 6, 0);
      scene.add(wallWestEnd);
      addObstacle(wallEastEndGeo, wallWestEnd);

      // North Pathway Walls
      const wallNorthEW_Geo = new THREE.BoxGeometry(1, 12, pathLength);
      
      const wallNorthWest = new THREE.Mesh(wallNorthEW_Geo, materials.plasticDark);
      wallNorthWest.position.set(-4.5, 6, -24);
      scene.add(wallNorthWest);
      addObstacle(wallNorthEW_Geo, wallNorthWest);

      const wallNorthEast = new THREE.Mesh(wallNorthEW_Geo, materials.plasticDark);
      wallNorthEast.position.set(4.5, 6, -24);
      scene.add(wallNorthEast);
      addObstacle(wallNorthEW_Geo, wallNorthEast);

      // North Pathway End Wall
      const wallNorthEndGeo = new THREE.BoxGeometry(pathWidth + 2, 12, 1);
      const wallNorthEnd = new THREE.Mesh(wallNorthEndGeo, materials.plasticDark);
      wallNorthEnd.position.set(0, 6, -36.5);
      scene.add(wallNorthEnd);
      addObstacle(wallNorthEndGeo, wallNorthEnd);

      // South Pathway Walls
      const wallSouthWest = new THREE.Mesh(wallNorthEW_Geo, materials.plasticDark);
      wallSouthWest.position.set(-4.5, 6, 24);
      scene.add(wallSouthWest);
      addObstacle(wallNorthEW_Geo, wallSouthWest);

      const wallSouthEast = new THREE.Mesh(wallNorthEW_Geo, materials.plasticDark);
      wallSouthEast.position.set(4.5, 6, 24);
      scene.add(wallSouthEast);
      addObstacle(wallNorthEW_Geo, wallSouthEast);

      // South Pathway End Wall
      const wallSouthEnd = new THREE.Mesh(wallNorthEndGeo, materials.plasticDark);
      wallSouthEnd.position.set(0, 6, 36.5);
      scene.add(wallSouthEnd);
      addObstacle(wallNorthEndGeo, wallSouthEnd);

      // 5. Aesthetic details & glowing neon accents along the corridors
      const trimGeoEastWest = new THREE.BoxGeometry(pathLength, 0.2, 0.2);
      const trimGeoNorthSouth = new THREE.BoxGeometry(0.2, 0.2, pathLength);

      // East Corridor (Red accents)
      const trimE_L = new THREE.Mesh(trimGeoEastWest, materials.neonRed);
      trimE_L.position.set(24, 11.9, -4.4);
      scene.add(trimE_L);
      const trimE_R = new THREE.Mesh(trimGeoEastWest, materials.neonRed);
      trimE_R.position.set(24, 11.9, 4.4);
      scene.add(trimE_R);

      // West Corridor (Blue accents)
      const trimW_L = new THREE.Mesh(trimGeoEastWest, materials.neonBlue);
      trimW_L.position.set(-24, 11.9, -4.4);
      scene.add(trimW_L);
      const trimW_R = new THREE.Mesh(trimGeoEastWest, materials.neonBlue);
      trimW_R.position.set(-24, 11.9, 4.4);
      scene.add(trimW_R);

      // North Corridor (Green accents)
      const trimN_L = new THREE.Mesh(trimGeoNorthSouth, materials.neonGreen);
      trimN_L.position.set(-4.4, 11.9, -24);
      scene.add(trimN_L);
      const trimN_R = new THREE.Mesh(trimGeoNorthSouth, materials.neonGreen);
      trimN_R.position.set(4.4, 11.9, -24);
      scene.add(trimN_R);

      // South Corridor (Yellow/Orange accents)
      const trimS_L = new THREE.Mesh(trimGeoNorthSouth, materials.neonYellowBasic);
      trimS_L.position.set(-4.4, 11.9, 24);
      scene.add(trimS_L);
      const trimS_R = new THREE.Mesh(trimGeoNorthSouth, materials.neonYellowBasic);
      trimS_R.position.set(4.4, 11.9, 24);
      scene.add(trimS_R);

      // 6. Giant Interactive Matchmaking Terminal at the end of East hallway (X=32, Z=0)
      // Base Column / Podium
      const podiumGeo = new THREE.CylinderGeometry(1.2, 1.5, 3, 16);
      const podium = new THREE.Mesh(podiumGeo, materials.plasticDark);
      podium.position.set(32, 1.5, 0);
      podium.castShadow = true;
      podium.receiveShadow = true;
      scene.add(podium);
      addObstacle(podiumGeo, podium);

      // Terminal screen tilted slightly back
      const screenFrameGeo = new THREE.BoxGeometry(2.0, 1.2, 0.3);
      const screenFrame = new THREE.Mesh(screenFrameGeo, materials.plasticWhite);
      screenFrame.position.set(32, 3.5, 0);
      screenFrame.rotation.x = -Math.PI / 6; // tilt back
      scene.add(screenFrame);
      addObstacle(screenFrameGeo, screenFrame);

      // Glowing virtual interface screen
      const screenGeo = new THREE.BoxGeometry(1.8, 1.0, 0.1);
      const screen = new THREE.Mesh(screenGeo, materials.neonRed);
      screen.position.set(32, 3.5, 0.11);
      screen.rotation.x = -Math.PI / 6;
      scene.add(screen);

      // Neon Cyan floor rings around terminal
      const ringGeo = new THREE.TorusGeometry(2.2, 0.08, 8, 32);
      const ring = new THREE.Mesh(ringGeo, materials.neonCyan);
      ring.position.set(32, 0.05, 0);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      const smallRingGeo = new THREE.TorusGeometry(1.5, 0.05, 8, 32);
      const smallRing = new THREE.Mesh(smallRingGeo, materials.neonRed);
      smallRing.position.set(32, 0.05, 0);
      smallRing.rotation.x = Math.PI / 2;
      scene.add(smallRing);

      // Floating particles above the terminal screen for futuristic look
      const particlesGeo = new THREE.SphereGeometry(0.12, 8, 8);
      for (let j = 0; j < 6; j++) {
        const floatParticle = new THREE.Mesh(particlesGeo, materials.neonRed);
        const pAngle = (j / 6) * Math.PI * 2;
        floatParticle.position.set(
          32 + Math.cos(pAngle) * 0.8,
          4.0 + Math.sin(j) * 0.4,
          Math.sin(pAngle) * 0.8
        );
        scene.add(floatParticle);
      }

      // 7. Ambient lighting inside the Lobby
      const mainLight = new THREE.PointLight(0x00f5ff, 2.0, 30);
      mainLight.position.set(0, 8, 0);
      scene.add(mainLight);

      const lobbyTerminalLight = new THREE.PointLight(0xff0055, 3.0, 15);
      lobbyTerminalLight.position.set(32, 5, 0);
      scene.add(lobbyTerminalLight);
    }
  };

  const addCircularBorder = (scene: THREE.Scene, radius: number, height: number, material: THREE.Material) => {
    // We can simulate a circular border using multiple tall blocks
    const segmentCount = 32;
    const borderGeo = new THREE.BoxGeometry(2 * Math.PI * radius / segmentCount + 1, height, 2);
    for (let i = 0; i < segmentCount; i++) {
      const angle = (i / segmentCount) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const wall = new THREE.Mesh(borderGeo, material);
      wall.position.set(x, height / 2, z);
      wall.rotation.y = -angle;
      wall.receiveShadow = true;
      scene.add(wall);
      addObstacle(borderGeo, wall);
    }
  };

  const addObstacle = (geo: THREE.BufferGeometry, mesh: THREE.Mesh) => {
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const box = new THREE.Box3();
      box.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld);
      obstaclesRef.current.push({ box, mesh });
    }
  };

  const createRedBlockyRobot = () => {
    const group = new THREE.Group();
    const primaryMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 }); // Red
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }); // Dark gray

    // Head
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const head = new THREE.Mesh(headGeo, primaryMat);
    head.position.y = 1.85;
    head.castShadow = true;
    
    // Face (Standard Roblox style blocky eyes)
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.15, 0.02);
    const leftEye = new THREE.Mesh(eyeGeo, faceMat);
    leftEye.position.set(-0.12, 0.05, 0.31);
    const rightEye = new THREE.Mesh(eyeGeo, faceMat);
    rightEye.position.set(0.12, 0.05, 0.31);

    head.add(leftEye);
    head.add(rightEye);
    
    group.add(head);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.8, 1.0, 0.5);
    const torso = new THREE.Mesh(torsoGeo, primaryMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
    
    const lArm = new THREE.Group();
    lArm.position.set(-0.6, 1.4, 0); // Shoulder pivot
    lArm.name = 'left_arm';
    const lArmMesh = new THREE.Mesh(armGeo, primaryMat);
    lArmMesh.position.set(0, -0.35, 0); // Shift down so pivot is at top
    lArmMesh.castShadow = true;
    lArm.add(lArmMesh);
    group.add(lArm);

    const rArm = new THREE.Group();
    rArm.position.set(0.6, 1.4, 0);
    rArm.name = 'right_arm';
    const rArmMesh = new THREE.Mesh(armGeo, primaryMat);
    rArmMesh.position.set(0, -0.35, 0);
    rArmMesh.castShadow = true;
    rArm.add(rArmMesh);
    group.add(rArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.35, 1.0, 0.35);
    
    const lLeg = new THREE.Group();
    lLeg.position.set(-0.25, 0.5, 0);
    lLeg.name = 'left_leg';
    const lLegMesh = new THREE.Mesh(legGeo, jointMat);
    lLegMesh.position.set(0, -0.5, 0);
    lLegMesh.castShadow = true;
    lLeg.add(lLegMesh);
    group.add(lLeg);

    const rLeg = new THREE.Group();
    rLeg.position.set(0.25, 0.5, 0);
    rLeg.name = 'right_leg';
    const rLegMesh = new THREE.Mesh(legGeo, jointMat);
    rLegMesh.position.set(0, -0.5, 0);
    rLegMesh.castShadow = true;
    rLeg.add(rLegMesh);
    group.add(rLeg);

    return group;
  };

  // Humanoid robotic dummy bot spawn
  const spawnBot = (scene: THREE.Scene, index: number) => {
    const isArena = mapType === 'ARENA';
    // Symmetrical spawn: bot spawns on the north side (negative Z)
    const x = index === 0 ? 0 : (index % 2 === 0 ? 12 : -12);
    const z = isArena ? -25 : -35;

    const botGroup = createRedBlockyRobot();
    botGroup.position.set(x, 0, z);

    // Pick a random weapon for the bot (Assault Rifle, Sniper, or RPG)
    const botWeapons: WeaponType[] = ['ASSAULT_RIFLE', 'SNIPER_RIFLE', 'RPG'];
    const chosenWeapon = botWeapons[Math.floor(Math.random() * botWeapons.length)];

    // Customize the 3D gun model based on the chosen weapon!
    let gunBlockGeo: THREE.BufferGeometry;
    let gunBlockMat: THREE.Material;
    let gunPosOffset = new THREE.Vector3(0.8, 0.9, 0.2);

    if (chosenWeapon === 'SNIPER_RIFLE') {
      // Long sniper barrel
      gunBlockGeo = new THREE.BoxGeometry(0.12, 0.12, 1.2);
      gunBlockMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }); // stealth black
      gunPosOffset.z = 0.45;
    } else if (chosenWeapon === 'RPG') {
      // Cylindrical rocket launcher barrel tube
      gunBlockGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.0, 8);
      gunBlockMat = new THREE.MeshStandardMaterial({ color: 0x2e3d1c, roughness: 0.6 }); // dark army green
      gunPosOffset.z = 0.2;
    } else {
      // Standard assault rifle
      gunBlockGeo = new THREE.BoxGeometry(0.15, 0.15, 0.7);
      gunBlockMat = new THREE.MeshStandardMaterial({ color: 0x333c4d, roughness: 0.5 }); // steel blue-gray
      gunPosOffset.z = 0.2;
    }

    const gunBlock = new THREE.Mesh(gunBlockGeo, gunBlockMat);
    gunBlock.name = 'gun_mesh';
    if (chosenWeapon === 'RPG') {
      // Rotate cylinder to point forward along Z
      gunBlock.rotation.x = Math.PI / 2;
    }
    gunBlock.position.copy(gunPosOffset);
    gunBlock.castShadow = true;
    botGroup.add(gunBlock);

    // If RPG, add a mini rocket cone visually protruding from muzzle
    if (chosenWeapon === 'RPG') {
      const miniRocketGeo = new THREE.ConeGeometry(0.14, 0.25, 8);
      const miniRocketMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const miniRocket = new THREE.Mesh(miniRocketGeo, miniRocketMat);
      miniRocket.rotation.x = Math.PI / 2;
      miniRocket.position.set(0.8, 0.9, 0.75); // protruding
      botGroup.add(miniRocket);
    }

    scene.add(botGroup);

    // Set custom shot intervals matching each weapon style
    let shootInterval = isArena ? 150 : 200; // Assault Rifle rapid fire (continuous)
    if (chosenWeapon === 'SNIPER_RIFLE') {
      shootInterval = isArena ? 3500 : 4000; // Slow Sniper
    } else if (chosenWeapon === 'RPG') {
      shootInterval = isArena ? 3800 : 4500; // Slower RPG firing rate
    }

    const config = WEAPON_CONFIGS[chosenWeapon];

    enemiesRef.current.push({
      mesh: botGroup,
      hp: 150,
      maxHp: 150,
      velocity: new THREE.Vector3(),
      lastShotTime: performance.now() + 1500 + Math.random() * 2000, // Significantly slower initial engagement
      shootInterval,
      state: 'PATROL',
      targetPos: new THREE.Vector3(x, 0, z),
      stateTimer: 0,
      width: 1.4,
      height: 2.1,
      weapon: chosenWeapon,
      baseWeapon: chosenWeapon,
      ammo: config.maxAmmo,
      maxAmmo: config.maxAmmo,
      isReloading: false,
      reloadTimer: 0,
      isAiming: false,
      aimTimer: 0,
      grenadeCooldown: 30.0, // initial 30-second cooldown before first grenade
    });
  };

  // Floating 2D/3D projected damage numbers in screen coords helper
  const addFloatingDamage = (text: string, pos: THREE.Vector3, isCrit = false) => {
    const id = Math.random().toString(36).substring(2, 9);
    // slightly randomize position so they don't overlap completely
    const offsetPos = pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      Math.random() * 0.3,
      (Math.random() - 0.5) * 0.4
    ));

    const newFloat: FloatingText = {
      id,
      text,
      pos: offsetPos,
      color: isCrit ? 'text-yellow-400 font-bold scale-110' : 'text-red-500',
      isCrit,
      age: 0,
    };

    floatingTextsRef.current = [...floatingTextsRef.current, newFloat];
    setFloatingTexts(floatingTextsRef.current);
  };

  // Rocket Explosion Particles
  const createExplosionParticles = (pos: THREE.Vector3) => {
    if (!sceneRef.current) return;

    // Red-orange fire explosion particles (35 particles)
    const count = 35;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: number[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      // Scaled down speed for 75% reduced explosion radius (visual match)
      const speed = (4 + Math.random() * 10) * 0.25;

      velocities.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 0.75, // slightly upward biased
        Math.sin(phi) * Math.sin(theta) * speed
      );
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xff4400, // Fiery orange-red
      size: 0.15, // Reduced size for smaller explosion
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const system = new THREE.Points(geometry, material);
    sceneRef.current.add(system);

    particlesRef.current.push({
      system,
      velocities,
      age: 0,
      maxAge: 0.5, // dissipates faster
    });

    // Yellow shockwave spark particles (20 particles)
    const yellowCount = 20;
    const yellowGeo = new THREE.BufferGeometry();
    const yellowPos = new Float32Array(yellowCount * 3);
    const yellowVel: number[] = [];

    for (let i = 0; i < yellowCount; i++) {
      yellowPos[i * 3] = pos.x;
      yellowPos[i * 3 + 1] = pos.y;
      yellowPos[i * 3 + 2] = pos.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const speed = (3 + Math.random() * 7) * 0.25;

      yellowVel.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 0.5,
        Math.sin(phi) * Math.sin(theta) * speed
      );
    }

    yellowGeo.setAttribute('position', new THREE.BufferAttribute(yellowPos, 3));
    const yellowMat = new THREE.PointsMaterial({
      color: 0xffcc00, // Bright yellow
      size: 0.1,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const yellowSystem = new THREE.Points(yellowGeo, yellowMat);
    sceneRef.current.add(yellowSystem);

    particlesRef.current.push({
      system: yellowSystem,
      velocities: yellowVel,
      age: 0,
      maxAge: 0.4,
    });
  };

  // Rocket explosion impact and area-of-effect damage logic
  const triggerRocketExplosion = (hitPoint: THREE.Vector3, hitBotIndex: number | null, owner: 'PLAYER' | 'ENEMY', isGrenade = false) => {
    const state = stateRef.current;
    if (!sceneRef.current) return;

    // 1. Spawning scaled rocket explosion particles
    createExplosionParticles(hitPoint);
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0, 0.25, 0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0.25, 0, 0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(-0.25, 0, 0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0, 0, 0.25)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0, 0, -0.25)));

    // Spawn secondary debris a bit later
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        if (sceneRef.current) {
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 0.75,
            Math.random() * 0.5,
            (Math.random() - 0.5) * 0.75
          );
          createExplosionParticles(hitPoint.clone().add(offset));
        }
      }, 50 + k * 40);
    }

    playHitSound();

    const splashRadius = isGrenade ? 5.0 : 6.0;
    const maxDmg = isGrenade ? 75 : 100;

    // 1b. Check if Player is within the explosion radius to launch/jump them!
    const distToPlayer = state.playerPos.distanceTo(hitPoint);
    if (distToPlayer < splashRadius) {
      // Launch player! Give upward velocity proportional to proximity (75% multiplier)
      const launchPower = (11.0 + (1 - distToPlayer / splashRadius) * 8.0) * 0.75; 
      state.playerVelocity.y = launchPower;
      state.isGrounded = false;

      // Add horizontal knockback blast force to player (75% multiplier)
      const pushDir = state.playerPos.clone().sub(hitPoint);
      pushDir.y = 0;
      if (pushDir.lengthSq() > 0.01) {
        pushDir.normalize();
        const horizPush = 3.0 * (1 - distToPlayer / splashRadius) * 0.75;
        state.playerVelocity.x += pushDir.x * horizPush;
        state.playerVelocity.z += pushDir.z * horizPush;
      }

      // Damage player if they are caught in the blast
      let playerDmg = 0;
      if (isGrenade) {
        if (owner === 'ENEMY') {
          playerDmg = Math.round(75 * (1 - distToPlayer / splashRadius));
          if (playerDmg < 15) playerDmg = 15; // floor damage
        } else {
          // Self damage from own grenade - removed to 0
          playerDmg = 0;
        }
      } else {
        if (owner === 'ENEMY') {
          playerDmg = distToPlayer < 1.0 ? 100 : 50; // High threat from bots
        } else {
          // Self damage from own rocket jump - removed to 0
          playerDmg = 0;
        }
      }

      if (playerDmg > 0) {
        state.playerHP = Math.max(0, state.playerHP - playerDmg);
        state.damageFlashActive = true;
        state.damageFlashTimer = 0.2;
        playHurtSound();
      }
    }

    // 2. Splash and Direct damage for all bots within splashRadius
    enemiesRef.current.forEach((bot, bIdx) => {
      if (bot.hp <= 0) return;

      const distToExplosion = bot.mesh.position.distanceTo(hitPoint);
      let dmgToApply = 0;
      let isDirect = false;

      if (bIdx === hitBotIndex && !isGrenade) {
        dmgToApply = 100; // RPG Direct hit
        isDirect = true;
      } else if (distToExplosion < splashRadius) {
        if (isGrenade) {
          // Grenade Splash damage (proportional to distance)
          dmgToApply = Math.round(maxDmg * (1 - distToExplosion / splashRadius));
          if (dmgToApply < 15) dmgToApply = 15; // floor splash damage
        } else {
          // RPG splash is strictly 50
          dmgToApply = 50;
        }
      }

      // Launch bots within the explosion radius!
      if (distToExplosion < splashRadius || (bIdx === hitBotIndex && !isGrenade)) {
        const launchY = (11.0 + (1 - Math.min(splashRadius, distToExplosion) / splashRadius) * 8.0) * 0.75;
        bot.velocity.y = launchY;

        // Push bot horizontally away from explosion center
        const pushDir = bot.mesh.position.clone().sub(hitPoint);
        pushDir.y = 0;
        if (pushDir.lengthSq() > 0.01) {
          pushDir.normalize();
          const horizPush = 2.5 * (1 - Math.min(splashRadius, distToExplosion) / splashRadius) * 0.75;
          bot.velocity.x = pushDir.x * horizPush;
          bot.velocity.z = pushDir.z * horizPush;
        }
      }

      if (owner === 'ENEMY') {
        dmgToApply = 0;
      }

      if (dmgToApply > 0) {
        bot.hp -= dmgToApply;
        state.hitActive = true;
        state.hitTimer = 0.12;

        addFloatingDamage(`${dmgToApply}!`, bot.mesh.position.clone().add(new THREE.Vector3(0, bot.height, 0)), isDirect || isGrenade);

        // Check Bot Death
        if (bot.hp <= 0) {
          playKillSound();
          addFloatingDamage('KILLED', bot.mesh.position.clone().add(new THREE.Vector3(0, bot.height + 0.5, 0)), true);
          bot.mesh.position.y = -5; // hide
          if (sceneRef.current) sceneRef.current.remove(bot.mesh);
        }
      }
    });

    checkRoundOutcome();
  };

  // Gun firing particle sparks
  const createHitParticles = (pos: THREE.Vector3, isBlood = false) => {
    if (!sceneRef.current) return;

    const count = isBlood ? 12 : 8;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: number[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      // spray direction
      velocities.push(
        (Math.random() - 0.5) * 4,
        (Math.random() * 2) + (isBlood ? 1.5 : 3), // shoot upwards
        (Math.random() - 0.5) * 4
      );
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: isBlood ? 0xb00000 : 0xffaa44,
      size: 0.15,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const system = new THREE.Points(geometry, material);
    sceneRef.current.add(system);

    particlesRef.current.push({
      system,
      velocities,
      age: 0,
      maxAge: 0.5, // Fades quickly
    });
  };

  // Quick Melee Action
  const triggerQuickMelee = () => {
    const state = stateRef.current;
    if (state.isReloading || state.roundEnded) return;

    // If current weapon is already FIST, do nothing
    if (state.weaponType === 'FIST') return;

    // Swap to FIST for 0.75 seconds, then change back
    state.quickMeleeReturnWeapon = state.weaponType;
    state.quickMeleeSwitchBackTimer = 0.75;
    state.weaponType = 'FIST';

    if (onWeaponChangeRef.current) {
      onWeaponChangeRef.current('FIST');
    }

    // Force instant punch swing with no draw delay
    state.equipTimer = 0;
    shootWeapon();
  };

  // Jump Action
  const triggerJump = () => {
    const state = stateRef.current;
    if (state.isReloading || state.roundEnded) return;

    if (state.isGrounded) {
      let jumpPower = 7.475; // 6.5 * 1.15
      if (state.isSliding) {
        jumpPower = 8.97; // 7.475 * 1.2
        state.isSliding = false; // Cancel slide on jump to immediately restore height and allow air control!
        state.slideCooldown = 1.2; // Reset slide cooldown
      }
      state.playerVelocity.y = jumpPower; // Jump impulse
      state.isGrounded = false;
      state.jumpCount = 1;
      playJumpSound();
    } else if (state.jumpCount < 2 && state.weaponType === 'FIST') {
      state.playerVelocity.y = 7.475; // Double jump impulse
      // Increment instead of setting to 2, so if they fall off an edge (count 0) they get two jumps
      state.jumpCount++;
      playJumpSound();
    }
  };

  // Slide Action (Lower camera height, high velocity boost)
  const triggerSlide = () => {
    const state = stateRef.current;
    // sliding requires moving, being grounded, not already sliding, and slide cooldown being 0
    const isMoving = keysRef.current['w'] || keysRef.current['a'] || keysRef.current['s'] || keysRef.current['d'];
    if (state.isGrounded && !state.isSliding && state.slideCooldown <= 0 && isMoving && !state.roundEnded) {
      state.isSliding = true;
      state.slideTime = 0.8; // 0.8 seconds duration
      playSlideSound();

      // Determine sliding direction based on keyboard inputs relative to camera yaw
      const moveX = (keysRef.current['a'] ? -1 : 0) + (keysRef.current['d'] ? 1 : 0);
      const moveZ = (keysRef.current['w'] ? -1 : 0) + (keysRef.current['s'] ? 1 : 0);

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);

      const dir = new THREE.Vector3();
      dir.addScaledVector(forward, -moveZ);
      dir.addScaledVector(right, moveX);
      dir.normalize();

      state.slideDirection.copy(dir);

      // Slide height: adjust height and smoothly lower playerPos Y to stay grounded without teleporting to absolute ground (0.8)
      const heightDiff = state.playerHeight - 0.8;
      state.playerHeight = 0.8;
      state.playerPos.y = Math.max(0.8, state.playerPos.y - heightDiff);
    }
  };

  // Reload Action
  const triggerReload = () => {
    const state = stateRef.current;
    if (state.equipTimer > 0) return;
    if (state.weaponType === 'FIST' || state.weaponType === 'SCYTHE') return;
    if (state.weaponReserves[state.weaponType] <= 0) return;
    if (!state.isReloading && state.ammo < state.maxAmmo && !state.roundEnded && state.weaponType !== 'PISTOL') {
      state.isReloading = true;
      state.reloadProgress = 0;
      
      let rTimer = WEAPON_CONFIGS[state.weaponType].reloadTime;
      if (state.weaponType === 'SNIPER_RIFLE') {
        if (state.ammo === 0) {
          rTimer = 2150; // 전탄 소모 후 재장전 시 2.15초 (2150ms)
        } else {
          rTimer = 1800; // 그 외 재장전 시 1.8초 (1800ms)
        }
      }
      state.reloadTimer = rTimer;
      state.isAiming = false; // exit ADS to reload
      playReloadSound();
    }
  };

  // Core shooting mechanic
  const shootWeapon = () => {
    const state = stateRef.current;
    if (state.equipTimer > 0) return;
    const now = performance.now();
    const currentWeaponType = state.weaponType;
    const config = WEAPON_CONFIGS[currentWeaponType];

    if (now - state.lastShotTime < config.fireRate) return;
    if (state.isReloading) return;

    if (currentWeaponType !== 'FIST' && currentWeaponType !== 'SCYTHE' && state.ammo <= 0) {
      // Empty clip click / auto reload
      triggerReload();
      return;
    }

    if (currentWeaponType === 'SNIPER_RIFLE' && !state.isAiming) {
      return; // Sniper rifles can only shoot while aiming
    }

    state.lastShotTime = now;
    if (currentWeaponType !== 'FIST' && currentWeaponType !== 'SCYTHE') {
      state.ammo--;
    }

    // 1. Calculate accuracy/spread
    // Hip spread: AR = 2 deg, Sniper = 10 deg
    // ADS spread: both = 0.1 deg
    const spreadDegrees = state.isAiming ? config.adsSpread : config.hipSpread;
    const spreadRad = (spreadDegrees * Math.PI) / 180;

    // Get shooting direction from camera with spread added
    const shootDir = new THREE.Vector3(0, 0, -1);
    shootDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), state.pitch);
    shootDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);

    // Apply random dispersion orthogonal to direction
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
    const up = new THREE.Vector3(0, 1, 0);

    const angleSpreadX = (Math.random() - 0.5) * spreadRad;
    const angleSpreadY = (Math.random() - 0.5) * spreadRad;

    shootDir.applyAxisAngle(right, angleSpreadY);
    shootDir.applyAxisAngle(up, angleSpreadX);
    shootDir.normalize();

    // 2. Play sound
    if (currentWeaponType === 'FIST') {
      playFistSwingSound();
    } else {
      playShootSound(currentWeaponType === 'SNIPER_RIFLE');
    }

    // 3. Gun Recoil Sway / Bolt action kick / Fist punch forward
    if (gunGroupRef.current) {
      if (currentWeaponType === 'FIST') {
        const leftArmGroup = gunGroupRef.current.getObjectByName('left_arm_group');
        const rightArmGroup = gunGroupRef.current.getObjectByName('right_arm_group');
        
        state.fistSwingLeft = !state.fistSwingLeft;
        
        if (state.fistSwingLeft) {
          if (leftArmGroup) {
            leftArmGroup.position.z = -0.4; // punch forward!
            leftArmGroup.rotation.y = 0.2;  // slight rotation inward
          }
        } else {
          if (rightArmGroup) {
            rightArmGroup.position.z = -0.4; // punch forward!
            rightArmGroup.rotation.y = -0.2; // slight rotation inward
          }
        }
      } else {
        gunGroupRef.current.position.z += 0.12; // kick backward
        gunGroupRef.current.position.y += 0.05; // kick upward
      }
    }

    // Exit zoom if sniper rifle after shot (1 shot untoggles ADS)
    if (currentWeaponType === 'SNIPER_RIFLE') {
      state.isAiming = false;
    }

    // GRENADE utility throw logic
    if (currentWeaponType === 'GRENADE') {
      if (state.grenadeCooldown > 0) return; // on cooldown!

      state.grenadeCooldown = 30.0; // 30s cooldown

      const startPos = new THREE.Vector3();
      if (gunMuzzleRef.current) {
        gunMuzzleRef.current.getWorldPosition(startPos);
      } else {
        startPos.copy(state.playerPos).addScaledVector(shootDir, 0.5);
      }

      // Create grenade 3D mesh
      const grenadeGroup = new THREE.Group();
      grenadeGroup.position.copy(startPos);

      const bodyGeo = new THREE.SphereGeometry(0.08, 12, 12);
      bodyGeo.scale(1, 1.25, 1);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e4a28, roughness: 0.8 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      grenadeGroup.add(body);

      const capGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x5e5f61 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 0.09, 0);
      grenadeGroup.add(cap);

      grenadeGroup.castShadow = true;

      if (sceneRef.current) {
        sceneRef.current.add(grenadeGroup);
        
        // Parabolic arc: forward velocity + upward toss component
        const finalVelocity = shootDir.clone().multiplyScalar(16.0);
        finalVelocity.y += 4.5; // arc upward!

        activeGrenadesRef.current.push({
          mesh: grenadeGroup as any,
          velocity: finalVelocity,
          timer: Math.max(0.1, 2.0 - grenadeCookTimerRef.current),
          damage: 75,
          owner: 'PLAYER',
        });
      }

      playFistSwingSound(); // Swoosh sound for throwing!

      // Reset cook timer just in case
      grenadeCookTimerRef.current = 0;

      // Auto switch back to primary weapon after throw
      setTimeout(() => {
        if (stateRef.current.weaponType === 'GRENADE' && onWeaponChangeRef.current) {
          onWeaponChangeRef.current(primaryWeaponRef.current);
        }
      }, 150);

      return;
    }

    // RPG slow projectile logic
    if (currentWeaponType === 'RPG') {
      const startPos = new THREE.Vector3();
      if (gunMuzzleRef.current) {
        gunMuzzleRef.current.getWorldPosition(startPos);
      } else {
        startPos.copy(state.playerPos).addScaledVector(shootDir, 0.5);
      }

      const rocketGroup = new THREE.Group();
      rocketGroup.position.copy(startPos);
      rocketGroup.lookAt(startPos.clone().add(shootDir));

      // Rocket cylinder body
      const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      rocketGroup.add(body);

      // Tip cone
      const tipGeo = new THREE.ConeGeometry(0.1, 0.18, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0, 0.29);
      rocketGroup.add(tip);

      if (sceneRef.current) {
        sceneRef.current.add(rocketGroup);
        rocketsRef.current.push({
          mesh: rocketGroup as any,
          direction: shootDir.clone(),
          speed: 30.0, // Slow visible rocket speed
          damage: 100,
          splashDamage: 50,
          splashRadius: 6.0, // 75% of original 8.0
          owner: 'PLAYER',
        });
      }
      return; // Skip raycast hit detection
    }

    // FIST/SCYTHE Area-of-effect damage check (rpg splash is 6.0, half is 3.0)
    if (currentWeaponType === 'FIST' || currentWeaponType === 'SCYTHE') {
      const punchCenter = state.playerPos.clone().addScaledVector(shootDir, 1.5);
      const punchRadius = 3.0; // Half of RPG's splashRadius (6.0 / 2 = 3.0)
      
      let hitAnyBot = false;

      enemiesRef.current.forEach((bot) => {
        if (bot.hp <= 0) return;
        
        const distToPunch = bot.mesh.position.distanceTo(punchCenter);
        if (distToPunch <= punchRadius) {
          hitAnyBot = true;
          let damage = config.damage;
          const isCrit = Math.random() < 0.25;
          if (isCrit) damage *= 2;
          
          bot.hp -= damage;
          
          createHitParticles(bot.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), true);
          addFloatingDamage(`${damage}${isCrit ? '!' : ''}`, bot.mesh.position.clone().add(new THREE.Vector3(0, bot.height, 0)), isCrit);

          // Check Bot Death
          if (bot.hp <= 0) {
            playKillSound();
            addFloatingDamage('KILLED', bot.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), true);
            bot.mesh.position.y = -5; // hide
            if (sceneRef.current) {
              sceneRef.current.remove(bot.mesh);
            }
            checkRoundOutcome();
          }
        }
      });

      if (hitAnyBot) {
        playHitSound();
        state.hitActive = true;
        state.hitTimer = 0.12;
      }
      return; // Skip standard raycast hit detection
    }

    // 4. Raycasting for hit detection
    const raycaster = new THREE.Raycaster(state.playerPos, shootDir);
    let hitPoint = state.playerPos.clone().addScaledVector(shootDir, 100); // default far tracer destination
    let hitObject: any = null;
    let closestDist = Infinity;

    // A. Check obstacles (concrete, blocks, walls, pillars)
    const obstacleIntersects = raycaster.intersectObjects(obstaclesRef.current.map(o => o.mesh));
    if (obstacleIntersects.length > 0) {
      const first = obstacleIntersects[0];
      if (first.distance < closestDist) {
        closestDist = first.distance;
        hitPoint.copy(first.point);
        hitObject = 'OBSTACLE';
      }
    }

    // B. Check Ground Plane (y = 0)
    if (shootDir.y < 0) {
      const distToGround = -state.playerPos.y / shootDir.y;
      if (distToGround > 0 && distToGround < closestDist) {
        closestDist = distToGround;
        hitPoint.copy(state.playerPos).addScaledVector(shootDir, distToGround);
        hitObject = 'GROUND';
      }
    }

    // C. Check enemy bots bounding spheres / hitboxes
    let hitBotIndex: number | null = null;
    enemiesRef.current.forEach((bot, bIdx) => {
      if (bot.hp <= 0) return;

      // Simple cylinder ray intersect (precise enough for FPS)
      const intersects = raycaster.intersectObject(bot.mesh, true);

      if (intersects.length > 0) {
        const first = intersects[0];
        if (first.distance < closestDist) {
          closestDist = first.distance;
          hitPoint.copy(first.point);
          hitBotIndex = bIdx;
          hitObject = 'BOT';
        }
      }
    });

    // Enforce melee weapon distance constraint
    const maxRange = (currentWeaponType === 'FIST' || currentWeaponType === 'SCYTHE') ? 3.5 : 100;
    if (closestDist > maxRange) {
      hitObject = null;
      hitBotIndex = null;
    }

    // 5. Spawn Tracer line
    if (sceneRef.current && gunMuzzleRef.current && currentWeaponType !== 'FIST' && currentWeaponType !== 'SCYTHE') {
      const muzzleWorldPos = new THREE.Vector3();
      gunMuzzleRef.current.getWorldPosition(muzzleWorldPos);

      // Create glowing laser tracer
      const points = [muzzleWorldPos, hitPoint];
      const tracerGeo = new THREE.BufferGeometry().setFromPoints(points);
      const tracerMat = new THREE.LineBasicMaterial({
        color: currentWeaponType === 'SNIPER_RIFLE' ? 0x00ffff : 0xffaa00,
        linewidth: 2,
        transparent: true,
        opacity: 0.9,
      });
      const tracerLine = new THREE.Line(tracerGeo, tracerMat);
      sceneRef.current.add(tracerLine);

      tracersRef.current.push({
        line: tracerLine,
        age: 0,
        maxAge: 0.12,
      });
    }

    // 6. Handle hit outcomes (Standard Weapons)
    if (hitObject === 'BOT' && hitBotIndex !== null) {
      const bot = enemiesRef.current[hitBotIndex];
      let damage = config.damage;
      let isCrit = false;

      // Headshot / Crit logic
      if (currentWeaponType === 'ASSAULT_RIFLE' || currentWeaponType === 'SNIPER_RIFLE') {
        const botTop = bot.mesh.position.y + bot.height;
        // Headshot threshold: top 0.4 units of the bot
        if (hitPoint.y >= botTop - 0.4) {
          isCrit = true;
          if (currentWeaponType === 'ASSAULT_RIFLE') {
            damage = 15; // Fixed headshot damage
          } else if (currentWeaponType === 'SNIPER_RIFLE') {
            damage = 120; // 120 headshot damage
          } else {
            damage = damage * 2; // 100% crit chance if headshot
          }
        } else {
          if (currentWeaponType === 'ASSAULT_RIFLE') {
            damage = 12; // Fixed body damage
          }
        }
      } else {
        // FIST random crits
        isCrit = Math.random() < 0.25;
        if (isCrit) damage *= 2;
      }

      const finalDamage = damage;
      bot.hp -= finalDamage;

      // Trigger visual & sound feedback
      playHitSound();
      state.hitActive = true;
      state.hitTimer = 0.12; // 0.12 seconds hitmarker flash

      createHitParticles(hitPoint, true);
      addFloatingDamage(`${finalDamage}${isCrit ? '!' : ''}`, hitPoint, isCrit);

      // Check Bot Death
      if (bot.hp <= 0) {
        playKillSound();
        addFloatingDamage('KILLED', hitPoint.clone().add(new THREE.Vector3(0, 0.5, 0)), true);
        
        // Bot collapse animation (shatters/falls down)
        bot.mesh.position.y = -5; // hide quickly for now
        if (sceneRef.current) {
          sceneRef.current.remove(bot.mesh);
        }

        // Check if all bots are dead (Victory of round!)
        checkRoundOutcome();
      }
    } else if (hitObject === 'OBSTACLE') {
      // Dust sparks on wall
      createHitParticles(hitPoint, false);
    }
  };

  // Check victory / defeat of the round
  const checkRoundOutcome = () => {
    const state = stateRef.current;
    if (state.roundEnded) return;

    // Player Death
    if (state.playerHP <= 0) {
      state.roundEnded = true;
      state.playerHP = 0;
      onRoundComplete('ENEMY');
      return;
    }

    // All Enemies Dead
    const aliveBotsCount = enemiesRef.current.filter((b) => b.hp > 0).length;
    if (aliveBotsCount === 0) {
      state.roundEnded = true;
      onRoundComplete('PLAYER');
    }
  };

  // Bot shooting at player
  const botShootAtPlayer = (bot: EnemyBot) => {
    if (!sceneRef.current || stateRef.current.roundEnded) return;

    // Face player
    const toPlayer = stateRef.current.playerPos.clone().sub(bot.mesh.position);
    toPlayer.y = 0; // look horizontal
    const angle = Math.atan2(toPlayer.x, toPlayer.z);
    bot.mesh.rotation.y = angle;

    // 0. Fist punch melee attack logic for bots
    if (bot.weapon === 'FIST') {
      const rightArm = bot.mesh.getObjectByName('right_arm');
      if (rightArm) {
        rightArm.rotation.x = -Math.PI / 2;
        setTimeout(() => {
          if (rightArm) rightArm.rotation.x = 0;
        }, 150);
      }

      playFistSwingSound();

      const dist = bot.mesh.position.distanceTo(stateRef.current.playerPos);
      if (dist < 4.0) {
        const damage = 30;
        stateRef.current.playerHP = Math.max(0, stateRef.current.playerHP - damage);
        stateRef.current.damageFlashActive = true;
        stateRef.current.damageFlashTimer = 0.2;
        playHurtSound();
        checkRoundOutcome();
      }
      return;
    }

    // Visual start position of bullet from the weapon muzzle height
    const startPos = bot.mesh.position.clone().add(new THREE.Vector3(0.55, 1.1, 0.4));
    const endPos = stateRef.current.playerPos.clone();
    
    // Introduce natural human-like aim inaccuracy/dispersion instead of robotic perfect aiming
    endPos.x += (Math.random() - 0.5) * 3.0; // Increased spread for lower accuracy
    endPos.y += (Math.random() - 0.5) * 3.0;
    endPos.z += (Math.random() - 0.5) * 3.0;

    // 1. RPG Rocket Projectile fire logic
    if (bot.weapon === 'RPG') {
      const shootDir = stateRef.current.playerPos.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(startPos).normalize();
      
      const rocketGroup = new THREE.Group();
      rocketGroup.position.copy(startPos);
      rocketGroup.lookAt(startPos.clone().add(shootDir));

      // Rocket cylinder body
      const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      rocketGroup.add(body);

      // Tip cone
      const tipGeo = new THREE.ConeGeometry(0.1, 0.18, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0, 0.29);
      rocketGroup.add(tip);

      if (sceneRef.current) {
        sceneRef.current.add(rocketGroup);
        rocketsRef.current.push({
          mesh: rocketGroup as any,
          direction: shootDir,
          speed: 12.0, // Significantly slower speed for more dodgeable NPC rockets
          damage: 100,
          splashDamage: 50,
          splashRadius: 6.0, // 75% of original 8.0
          owner: 'ENEMY',
        });
      }
      playShootSound(false);
      return;
    }

    // 2. Sniper Rifle high-damage laser logic
    if (bot.weapon === 'SNIPER_RIFLE') {
      const points = [startPos, endPos];
      const tracerGeo = new THREE.BufferGeometry().setFromPoints(points);
      const tracerMat = new THREE.LineBasicMaterial({
        color: 0x00ffff, // Intense cyan beam for sniper
        transparent: true,
        opacity: 0.9,
      });
      const tracerLine = new THREE.Line(tracerGeo, tracerMat);
      sceneRef.current.add(tracerLine);

      tracersRef.current.push({
        line: tracerLine,
        age: 0,
        maxAge: 0.25, // Longer tracer age
      });

      playShootSound(true); // Loud sniper crack sound

      const dist = startPos.distanceTo(stateRef.current.playerPos);
      // Significantly lower AI precision for snipers
      let hitChance = 0.45 - dist * 0.005;
      if (stateRef.current.isSliding) {
        hitChance *= 0.4;
      }

      if (Math.random() < hitChance) {
        const damage = 50; // Devastating punch
        stateRef.current.playerHP = Math.max(0, stateRef.current.playerHP - damage);
        stateRef.current.damageFlashActive = true;
        stateRef.current.damageFlashTimer = 0.2;
        playHurtSound();
        checkRoundOutcome();
      }
      return;
    }

    // 3. Assault Rifle rapid-fire laser logic
    const points = [startPos, endPos];
    const tracerGeo = new THREE.BufferGeometry().setFromPoints(points);
    const tracerMat = new THREE.LineBasicMaterial({
      color: 0xffaa00, // Orange-yellow rapid laser
      transparent: true,
      opacity: 0.8,
    });
    const tracerLine = new THREE.Line(tracerGeo, tracerMat);
    sceneRef.current.add(tracerLine);

    tracersRef.current.push({
      line: tracerLine,
      age: 0,
      maxAge: 0.12,
    });

    playShootSound(false); // Standard shoot sound

    const dist = startPos.distanceTo(stateRef.current.playerPos);
    // Lower AI precision for assault rifles
    let hitChance = 0.35 - dist * 0.008;
    if (stateRef.current.isSliding) {
      hitChance *= 0.4;
    }

    if (Math.random() < hitChance) {
      const damage = mapType === 'ARENA' ? 14 : 11;
      stateRef.current.playerHP = Math.max(0, stateRef.current.playerHP - damage);
      stateRef.current.damageFlashActive = true;
      stateRef.current.damageFlashTimer = 0.2;
      playHurtSound();
      checkRoundOutcome();
    }
  };

  // Bot throwing grenade at player
  const botThrowGrenadeAtPlayer = (bot: EnemyBot) => {
    if (!sceneRef.current || stateRef.current.roundEnded) return;

    // Visual start position: slightly elevated from torso
    const startPos = bot.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    // Toss direction: arc towards player's position
    const toPlayer = stateRef.current.playerPos.clone().sub(startPos);
    const distance = toPlayer.length();
    
    // Normalize and add upward toss arc depending on distance
    const shootDir = toPlayer.clone().normalize();
    
    // Create grenade 3D mesh
    const grenadeGroup = new THREE.Group();
    grenadeGroup.position.copy(startPos);

    const bodyGeo = new THREE.SphereGeometry(0.08, 12, 12);
    bodyGeo.scale(1, 1.25, 1);
    // Dark magenta-purple to clearly distinguish bot grenades from player green grenades
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    grenadeGroup.add(body);

    const capGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0, 0.09, 0);
    grenadeGroup.add(cap);

    grenadeGroup.castShadow = true;

    if (sceneRef.current) {
      sceneRef.current.add(grenadeGroup);
      
      const throwSpeed = Math.min(18.0, 8.0 + distance * 0.5);
      const finalVelocity = shootDir.clone().multiplyScalar(throwSpeed);
      finalVelocity.y += Math.min(6.0, 2.0 + distance * 0.15); // arc upward!

      activeGrenadesRef.current.push({
        mesh: grenadeGroup as any,
        velocity: finalVelocity,
        timer: 2.0, // 2s fuse
        damage: 75,
        owner: 'ENEMY', // bot owned
      });
      
      playFistSwingSound(); // throw whoosh sound
    }
  };

  // AI Logic loop for bot patrols/movement
  const updateBots = (delta: number) => {
    const state = stateRef.current;
    if (state.roundEnded) return;

    enemiesRef.current.forEach((bot) => {
      if (bot.hp <= 0) return;

      bot.stateTimer -= delta;

      const startPos = bot.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const rayDir = state.playerPos.clone().sub(startPos).normalize();
      const ray = new THREE.Raycaster(startPos, rayDir);
      const intersects = ray.intersectObjects(obstaclesRef.current.map(o => o.mesh));
      
      const obstacleDistance = intersects.length > 0 ? intersects[0].distance : Infinity;
      const actualDistToPlayer = startPos.distanceTo(state.playerPos);
      const hasLineOfSight = obstacleDistance > actualDistToPlayer;

      // Simple State Machine
      if (bot.stateTimer <= 0) {
        // Slightly lower AI skill: response delay (0.7s to 1.8s) for more natural movement
        bot.stateTimer = 0.7 + Math.random() * 1.1;
        
        if (hasLineOfSight) {
          // Decide next state: extremely aggressive pursuit of player
          if (actualDistToPlayer > 18) {
            bot.state = 'CHASE';
          } else {
            // Patrol or side strafe
            bot.state = Math.random() < 0.75 ? 'COVER' : 'PATROL';
          }
        } else {
          // Can't see player -> wander
          bot.state = 'PATROL';
        }

        // Calculate a random target coordinate based on state
        if (bot.state === 'CHASE') {
          // move closer to player aggressively
          bot.targetPos.copy(state.playerPos).add(new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            0,
            (Math.random() - 0.5) * 6
          ));
        } else if (bot.state === 'COVER') {
          // dodge/strafe side-to-side relative to player
          const toPlayer = state.playerPos.clone().sub(bot.mesh.position).normalize();
          const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x); // orthogonal vector
          const strafeDist = (Math.random() - 0.5) * 14;
          bot.targetPos.copy(bot.mesh.position).addScaledVector(right, strafeDist);
        } else {
          // wander
          bot.targetPos.set(
            (Math.random() - 0.5) * (mapType === 'ARENA' ? 40 : 60),
            0,
            (Math.random() - 0.5) * (mapType === 'ARENA' ? 40 : 60)
          );
        }
      }

      // 1. Gravity and velocity physics for bots (jumping / launching)
      const isGrounded = bot.mesh.position.y <= 0.05;

      if (!isGrounded || bot.velocity.y !== 0) {
        // Apply gravity
        bot.velocity.y -= 19.8 * delta;
        bot.mesh.position.y += bot.velocity.y * delta;

        // Apply horizontal knockback velocity
        bot.mesh.position.x += bot.velocity.x * delta;
        bot.mesh.position.z += bot.velocity.z * delta;

        // Decay horizontal knockback velocities
        bot.velocity.x *= Math.max(0, 1 - 3 * delta);
        bot.velocity.z *= Math.max(0, 1 - 3 * delta);

        if (bot.mesh.position.y <= 0) {
          bot.mesh.position.y = 0;
          bot.velocity.set(0, 0, 0);
        }
      }

      // Find limbs dynamically by name for animation
      const leftArm = bot.mesh.getObjectByName('left_arm');
      const rightArm = bot.mesh.getObjectByName('right_arm');
      const leftLeg = bot.mesh.getObjectByName('left_leg');
      const rightLeg = bot.mesh.getObjectByName('right_leg');

      // Move toward target position (only if grounded)
      if (isGrounded) {
        const dir = bot.targetPos.clone().sub(bot.mesh.position);
        dir.y = 0;
        const dist = dir.length();

        if (dist > 1) {
          dir.normalize();
          const speed = bot.state === 'CHASE' ? 3.5 : 2.0;
          bot.mesh.position.addScaledVector(dir, speed * delta);

          // Tilt/sway limbs slightly when moving for Roblox style feel
          const swing = Math.sin(performance.now() * 0.01) * 0.4;
          if (leftArm) leftArm.rotation.x = swing;
          if (rightArm) rightArm.rotation.x = -swing;
          if (leftLeg) leftLeg.rotation.x = -swing;
          if (rightLeg) rightLeg.rotation.x = swing;
        } else {
          // Reset limb tilts
          if (leftArm) leftArm.rotation.x = 0;
          if (rightArm) rightArm.rotation.x = 0;
          if (leftLeg) leftLeg.rotation.x = 0;
          if (rightLeg) rightLeg.rotation.x = 0;
        }
      } else {
        // Flail limbs in the air when knocked back!
        const flail = Math.sin(performance.now() * 0.02) * 0.6;
        if (leftArm) leftArm.rotation.x = flail;
        if (rightArm) rightArm.rotation.x = -flail;
        if (leftLeg) leftLeg.rotation.x = -flail;
        if (rightLeg) rightLeg.rotation.x = flail;
      }

      // Check obstacle boundaries for bots (circular for arena, box for battlefield)
      if (mapType === 'ARENA') {
        const rad = Math.sqrt(bot.mesh.position.x * bot.mesh.position.x + bot.mesh.position.z * bot.mesh.position.z);
        if (rad > 38.5) {
          bot.mesh.position.x = (bot.mesh.position.x / rad) * 38.5;
          bot.mesh.position.z = (bot.mesh.position.z / rad) * 38.5;
          bot.stateTimer = 0; // force new target
          bot.velocity.x = 0;
          bot.velocity.z = 0;
        }
      } else {
        bot.mesh.position.x = Math.max(-48.5, Math.min(48.5, bot.mesh.position.x));
        bot.mesh.position.z = Math.max(-48.5, Math.min(48.5, bot.mesh.position.z));
      }

      // Collision between bot and other obstacles
      obstaclesRef.current.forEach((obs) => {
        const botBox = new THREE.Box3(
          bot.mesh.position.clone().add(new THREE.Vector3(-0.5, 0, -0.5)),
          bot.mesh.position.clone().add(new THREE.Vector3(0.5, bot.height, 0.5))
        );
        if (botBox.intersectsBox(obs.box)) {
          const obsCenter = new THREE.Vector3();
          obs.box.getCenter(obsCenter);

          // Overlap depths
          const overlapX = Math.min(botBox.max.x, obs.box.max.x) - Math.max(botBox.min.x, obs.box.min.x);
          const overlapZ = Math.min(botBox.max.z, obs.box.max.z) - Math.max(botBox.min.z, obs.box.min.z);

          if (overlapX < overlapZ) {
            if (bot.mesh.position.x < obsCenter.x) {
              bot.mesh.position.x -= overlapX + 0.01;
            } else {
              bot.mesh.position.x += overlapX + 0.01;
            }
          } else {
            if (bot.mesh.position.z < obsCenter.z) {
              bot.mesh.position.z -= overlapZ + 0.01;
            } else {
              bot.mesh.position.z += overlapZ + 0.01;
            }
          }
          bot.stateTimer = 0; // recalculate route
        }
      });

      // Face the player
      const lookDir = state.playerPos.clone().sub(bot.mesh.position);
      lookDir.y = 0;
      bot.mesh.rotation.y = Math.atan2(lookDir.x, lookDir.z);

      // Decrease bot's grenade cooldown
      if (bot.grenadeCooldown > 0) {
        bot.grenadeCooldown -= delta;
      }

      // Situational weapon switching based on distance
      const distToPlayer = bot.mesh.position.distanceTo(state.playerPos);

      if (distToPlayer < 3.5) {
        // Melee range -> Switch to FIST!
        if (bot.weapon !== 'FIST') {
          bot.weapon = 'FIST';
          bot.ammo = 1;
          bot.maxAmmo = 1;
          bot.shootInterval = 400; // fast punches
          bot.isReloading = false;
          bot.isAiming = false;
        }
      } else {
        // Out of melee range -> Restore primary base weapon if they were using FIST
        if (bot.weapon === 'FIST') {
          bot.weapon = bot.baseWeapon;
          const config = WEAPON_CONFIGS[bot.baseWeapon];
          bot.maxAmmo = config.maxAmmo;
          bot.ammo = config.maxAmmo;
          
          let sInterval = mapType === 'ARENA' ? 150 : 200; // Assault Rifle rapid fire
          if (bot.baseWeapon === 'SNIPER_RIFLE') {
            sInterval = mapType === 'ARENA' ? 3500 : 4000;
          } else if (bot.baseWeapon === 'RPG') {
            sInterval = mapType === 'ARENA' ? 3800 : 4500;
          }
          bot.shootInterval = sInterval;
          bot.isReloading = false;
          bot.isAiming = false;
        }

        // Grenade toss situation
        if (hasLineOfSight && distToPlayer >= 8.0 && distToPlayer <= 22.0 && bot.grenadeCooldown <= 0 && !bot.isReloading && !bot.isAiming) {
          botThrowGrenadeAtPlayer(bot);
          bot.grenadeCooldown = 30.0; // 30s cooldown exactly
        }
      }

      // Reload logic
      const gunMesh = bot.mesh ? bot.mesh.getObjectByName('gun_mesh') : null;
      if (bot.isReloading) {
        bot.reloadTimer -= delta;
        if (gunMesh) {
          // Bob/rotate gun to simulate reloading
          gunMesh.rotation.x = Math.sin(bot.reloadTimer * 8) * 0.4 + (bot.weapon === 'RPG' ? Math.PI/2 : 0);
        }
        if (bot.reloadTimer <= 0) {
          bot.isReloading = false;
          bot.ammo = bot.maxAmmo;
          if (gunMesh) {
            gunMesh.rotation.x = bot.weapon === 'RPG' ? Math.PI / 2 : 0;
          }
        }
      }

      // Fire weapon at player when ready
      const now = performance.now();
      if (!bot.isReloading) {
        if (hasLineOfSight) {
          if (bot.weapon === 'SNIPER_RIFLE') {
            if (!bot.isAiming) {
              if (now - bot.lastShotTime > bot.shootInterval) {
                bot.isAiming = true;
                bot.aimTimer = 0.3; // 0.3s aim delay
              }
            } else {
              bot.aimTimer -= delta;
              if (bot.aimTimer <= 0) {
                bot.isAiming = false;
                bot.lastShotTime = now;
                bot.ammo--;
                botShootAtPlayer(bot);
                if (bot.ammo <= 0) {
                  bot.isReloading = true;
                  bot.reloadTimer = 2.5; // Bot reload time
                  playReloadSound();
                }
              }
            }
          } else {
            if (now - bot.lastShotTime > bot.shootInterval) {
              bot.lastShotTime = now;
              bot.ammo--;
              botShootAtPlayer(bot);
              if (bot.ammo <= 0) {
                bot.isReloading = true;
                bot.reloadTimer = 2.0;
                playReloadSound();
              }
            }
          }
        } else {
          // Lost line of sight, cancel aiming
          bot.isAiming = false;
        }
      } else {
        bot.isAiming = false;
      }
    });
  };

  // Main frame updater loop (Physics + Controls + Particles + HUD Sync)
  const updateGame = (delta: number) => {
    const state = stateRef.current;
    const currentWeaponType = state.weaponType;
    const config = WEAPON_CONFIGS[currentWeaponType];

    // Matchmaking terminal proximity check
    if (mapType === 'LOBBY') {
      const terminalPos = new THREE.Vector3(32, 1.6, 0);
      const distToTerminal = state.playerPos.distanceTo(terminalPos);
      const near = distToTerminal < 4.5;
      if (near !== isNearButtonRef.current) {
        isNearButtonRef.current = near;
        setIsNearButton(near);
      }
    } else {
      if (isNearButtonRef.current) {
        isNearButtonRef.current = false;
        setIsNearButton(false);
      }
    }

    // Decrease equipTimer
    if (state.equipTimer > 0) {
      state.equipTimer = Math.max(0, state.equipTimer - delta);
      state.isAiming = false; // Cannot ADS during equip
    }

    // 1. Zoom/Aim Down Sights (ADS) progress animation
    if (state.isAiming) {
      const aimSpeed = 1 / config.aimTime;
      state.aimProgress = Math.min(1.0, state.aimProgress + aimSpeed * delta);
    } else {
      state.aimProgress = Math.max(0.0, state.aimProgress - 3.0 * delta); // quick exit zoom
    }

    // Camera FOV zoom scaling based on aimProgress and sliding
    if (cameraRef.current) {
      let baseFov = 75;
      
      const targetFov = baseFov - (baseFov - config.zoomFov) * state.aimProgress;
      if (Math.abs(cameraRef.current.fov - targetFov) > 0.1) {
        cameraRef.current.fov = targetFov;
        cameraRef.current.updateProjectionMatrix();
      }
    }

    // Gun Model Alignment & sway
    if (gunGroupRef.current) {
      // Gun Sway with mouse/breathing
      const swayX = Math.sin(performance.now() * 0.003) * 0.005;
      const swayY = Math.cos(performance.now() * 0.002) * 0.004;

      if (state.isAiming) {
        // Align gun directly centered on the screen for ADS
        // standard hip position is (0.25, -0.22, -0.35). Centered position is (0, -0.15, -0.3)
        // Sniper: Hide model when scoped (aimProgress > 0.5) to clear screen for the black scope lens!
        if (currentWeaponType === 'SNIPER_RIFLE' && state.aimProgress > 0.1) {
          gunGroupRef.current.visible = false;
        } else {
          gunGroupRef.current.visible = true;
          let targetX = 0 - (0.25 * (1 - state.aimProgress));
          let targetY = -0.15 - (0.07 * (1 - state.aimProgress));
          if (currentWeaponType === 'SCYTHE') {
            targetX = 0.1 - (0.25 * (1 - state.aimProgress));
            targetY = -0.1 - (0.07 * (1 - state.aimProgress));
          }
          const targetZ = -0.35 + (0.05 * state.aimProgress);

          gunGroupRef.current.position.set(targetX + swayX, targetY + swayY, targetZ);
        }
      } else {
        gunGroupRef.current.visible = true;
        // Smoothly interpolate back to hip-fire position
        const currentPos = gunGroupRef.current.position;
        const isFist = currentWeaponType === 'FIST';
        const targetX = isFist ? 0.0 : 0.25;
        const targetY = isFist ? -0.2 : -0.22;
        const targetZ = isFist ? -0.15 : -0.35;

        currentPos.x += (targetX - currentPos.x) * 10 * delta;
        currentPos.y += (targetY - currentPos.y) * 10 * delta;
        currentPos.z += (targetZ - currentPos.z) * 10 * delta;

        // add sway
        currentPos.x += swayX;
        currentPos.y += swayY;

        // Interpolate dual arms for FIST
        if (isFist) {
          const leftArmGroup = gunGroupRef.current.getObjectByName('left_arm_group');
          const rightArmGroup = gunGroupRef.current.getObjectByName('right_arm_group');
          
          if (leftArmGroup) {
            leftArmGroup.position.z += (-0.15 - leftArmGroup.position.z) * 12 * delta;
            leftArmGroup.rotation.y += (0 - leftArmGroup.rotation.y) * 12 * delta;
          }
          if (rightArmGroup) {
            rightArmGroup.position.z += (-0.15 - rightArmGroup.position.z) * 12 * delta;
            rightArmGroup.rotation.y += (0 - rightArmGroup.rotation.y) * 12 * delta;
          }
        }

        // Equip draw animation (weapon rises up)
        if (state.equipTimer > 0) {
          const ratio = state.equipTimer / state.equipDuration; // 1 to 0
          currentPos.y -= ratio * 0.4;
          currentPos.z -= ratio * 0.1;
          gunGroupRef.current.rotation.x = ratio * -0.6;
        } else {
          gunGroupRef.current.rotation.x = 0;
        }
      }
    }

    // 2. Sliding State & sliding cooldown ticks
    if (state.isSliding) {
      state.slideTime -= delta;
      if (state.slideTime <= 0) {
        state.isSliding = false;
        state.slideCooldown = 1.5; // 1.5s cooldown before next slide
      }
    }

    if (state.slideCooldown > 0) {
      state.slideCooldown = Math.max(0, state.slideCooldown - delta);
    }

    // Smoothly restore player height after sliding
    const prevHeight = state.playerHeight;
    const targetHeight = state.isSliding ? 0.8 : 1.6;
    state.playerHeight += (targetHeight - state.playerHeight) * 8 * delta;
    // Adjust pos.y smoothly to keep bottom of bounding box in place
    state.playerPos.y += (state.playerHeight - prevHeight);

    // 3. Reloading logic
    if (state.isReloading) {
      state.reloadProgress = Math.min(1.0, state.reloadProgress + (delta * 1000) / state.reloadTimer);
      
      // Animate gun pitching downwards during reload
      if (gunGroupRef.current) {
        gunGroupRef.current.rotation.x = Math.sin(state.reloadProgress * Math.PI) * -0.6;
        gunGroupRef.current.rotation.z = Math.sin(state.reloadProgress * Math.PI) * 0.2;
      }

      if (state.reloadProgress >= 1.0) {
        state.isReloading = false;
        if (state.weaponType !== 'FIST' && state.weaponType !== 'GRENADE') {
          const needed = state.maxAmmo - state.ammo;
          const transfer = Math.min(needed, state.weaponReserves[state.weaponType]);
          state.ammo += transfer;
          state.weaponReserves[state.weaponType] -= transfer;
        } else {
          state.ammo = state.maxAmmo;
        }
      }
    } else {
      if (gunGroupRef.current) {
        gunGroupRef.current.rotation.x = 0;
        gunGroupRef.current.rotation.z = 0;
      }
    }

    // 4. Handle Gun Fire inputs (Left click)
    if (currentWeaponType === 'GRENADE') {
      if (keysRef.current['left_click'] && !state.roundEnded && state.grenadeCooldown <= 0) {
        // Cook grenade on Left click
        grenadeCookTimerRef.current += delta;
        
        // Visual smoke puff/indicator around player
        if (Math.floor(grenadeCookTimerRef.current * 10) % 3 === 0) {
          if (sceneRef.current) {
            const playerChest = state.playerPos.clone().add(new THREE.Vector3(0, 0.4, 0));
            createHitParticles(playerChest, false);
          }
        }

        if (grenadeCookTimerRef.current >= 2.0) {
          // Cooked for 2 seconds -> Explode!
          triggerRocketExplosion(state.playerPos, null, 'PLAYER', true); // isGrenade = true

          state.grenadeCooldown = 30.0;
          grenadeCookTimerRef.current = 0;
          keysRef.current['left_click'] = false;

          // Auto switch back to primary weapon after explosion
          if (onWeaponChangeRef.current) {
            onWeaponChangeRef.current(primaryWeaponRef.current);
          }
        }
      } else if (!keysRef.current['left_click'] && grenadeCookTimerRef.current > 0) {
        // Released left click! THROW!
        shootWeapon();
        grenadeCookTimerRef.current = 0;
      }
    } else if (keysRef.current['left_click'] && !state.roundEnded) {
      if (currentWeaponType === 'ASSAULT_RIFLE') {
        // continuous firing
        shootWeapon();
      } else {
        // semi-auto/bolt-action: click fire
        shootWeapon();
        keysRef.current['left_click'] = false; // require release
      }
    }

    // 5. Update timers / Flashes
    if (state.quickMeleeTimer > 0) {
      state.quickMeleeTimer -= delta;
    }

    if (state.quickMeleeSwitchBackTimer > 0) {
      state.quickMeleeSwitchBackTimer -= delta;
      if (state.quickMeleeSwitchBackTimer <= 0) {
        if (state.quickMeleeReturnWeapon && onWeaponChangeRef.current) {
          onWeaponChangeRef.current(state.quickMeleeReturnWeapon);
        }
        state.quickMeleeReturnWeapon = null;
      }
    }

    if (state.hitActive) {
      state.hitTimer -= delta;
      if (state.hitTimer <= 0) state.hitActive = false;
    }

    if (state.damageFlashActive) {
      state.damageFlashTimer -= delta;
      if (state.damageFlashTimer <= 0) state.damageFlashActive = false;
    }

    // 6. Player Movement & Physics (Grounded, Jump, Slide speed)
    const moveSpeedMod = config.moveSpeedMod || 1.0;
    const moveSpeed = (state.isSliding ? 14.0 : state.isAiming ? 3.0 : 7.0) * moveSpeedMod; // sliding gives high momentum, aiming slows down
    
    // Friction/gravity
    if (!state.isGrounded) {
      state.playerVelocity.y -= 19.8 * delta; // standard game gravity
    }

    // Movement directions
    const moveX = (keysRef.current['a'] ? -1 : 0) + (keysRef.current['d'] ? 1 : 0);
    const moveZ = (keysRef.current['w'] ? -1 : 0) + (keysRef.current['s'] ? 1 : 0);

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);

    const wishDir = new THREE.Vector3();
    wishDir.addScaledVector(forward, -moveZ);
    wishDir.addScaledVector(right, moveX);
    wishDir.normalize();

    // Apply movement velocity
    if (state.scytheDashTime > 0) {
      state.scytheDashTime = Math.max(0, state.scytheDashTime - delta);
      const currentDashSpeed = 28 * Math.max(0.4, state.scytheDashTime / 0.35);
      state.playerVelocity.x = state.scytheDashDir.x * currentDashSpeed;
      state.playerVelocity.z = state.scytheDashDir.z * currentDashSpeed;
      state.playerVelocity.y = 0; // maintain horizontal
    } else if (state.isSliding) {
      // locked movement sliding momentum
      // Boost speed up to 1.8x, decaying to 0.5x
      const slideMultiplier = 0.5 + 1.3 * (state.slideTime / 0.8);
      state.playerVelocity.x = state.slideDirection.x * moveSpeed * slideMultiplier;
      state.playerVelocity.z = state.slideDirection.z * moveSpeed * slideMultiplier;
    } else if (!state.isGrounded) {
      // Air physics: smooth momentum conservation with air control!
      // This preserves high horizontal velocity (e.g. from a slide-jump) and slowly decays/shifts it towards the WASD input direction
      const airSteerSpeed = 4.5; // lerp speed per second
      const targetVelX = wishDir.x * moveSpeed;
      const targetVelZ = wishDir.z * moveSpeed;
      state.playerVelocity.x += (targetVelX - state.playerVelocity.x) * Math.min(1.0, airSteerSpeed * delta);
      state.playerVelocity.z += (targetVelZ - state.playerVelocity.z) * Math.min(1.0, airSteerSpeed * delta);
    } else {
      // standard WASD walking on ground
      state.playerVelocity.x = wishDir.x * moveSpeed;
      state.playerVelocity.z = wishDir.z * moveSpeed;
    }

    // --- AXIS-BY-AXIS COLLISION RESOLUTION ---
    let isGroundedThisFrame = false;

    // Helper to compute player's bounding box at a given position
    const getPlayerBox = (pos: THREE.Vector3, height: number) => {
      // 0.45 horizontal radius is highly stable for 3D navigation and container entrances
      return new THREE.Box3(
        new THREE.Vector3(pos.x - 0.45, pos.y - height, pos.z - 0.45),
        new THREE.Vector3(pos.x + 0.45, pos.y + 0.4, pos.z + 0.45)
      );
    };

    // 1. Move & Resolve X
    state.playerPos.x += state.playerVelocity.x * delta;
    obstaclesRef.current.forEach((obs) => {
      // Skip horizontal collision check if player is clearly standing on top of this obstacle
      // Disable skipping if sliding to prevent passing through low obstacles (stairs)
      if (!state.isSliding && state.playerPos.y - state.playerHeight >= obs.box.max.y - 0.15) {
        return;
      }
      const playerBox = getPlayerBox(state.playerPos, state.playerHeight);
      if (playerBox.intersectsBox(obs.box)) {
        const obsCenter = new THREE.Vector3();
        obs.box.getCenter(obsCenter);
        const overlapX = Math.min(playerBox.max.x, obs.box.max.x) - Math.max(playerBox.min.x, obs.box.min.x);
        if (state.playerPos.x < obsCenter.x) {
          state.playerPos.x -= (overlapX + 0.001);
        } else {
          state.playerPos.x += (overlapX + 0.001);
        }
        state.playerVelocity.x = 0;
      }
    });

    // 2. Move & Resolve Z
    state.playerPos.z += state.playerVelocity.z * delta;
    obstaclesRef.current.forEach((obs) => {
      // Skip horizontal collision check if player is clearly standing on top of this obstacle
      // Disable skipping if sliding to prevent passing through low obstacles (stairs)
      if (!state.isSliding && state.playerPos.y - state.playerHeight >= obs.box.max.y - 0.15) {
        return;
      }
      const playerBox = getPlayerBox(state.playerPos, state.playerHeight);
      if (playerBox.intersectsBox(obs.box)) {
        const obsCenter = new THREE.Vector3();
        obs.box.getCenter(obsCenter);
        const overlapZ = Math.min(playerBox.max.z, obs.box.max.z) - Math.max(playerBox.min.z, obs.box.min.z);
        if (state.playerPos.z < obsCenter.z) {
          state.playerPos.z -= (overlapZ + 0.001);
        } else {
          state.playerPos.z += (overlapZ + 0.001);
        }
        state.playerVelocity.z = 0;
      }
    });

    // 3. Move & Resolve Y
    state.playerPos.y += state.playerVelocity.y * delta;
    obstaclesRef.current.forEach((obs) => {
      const playerBox = getPlayerBox(state.playerPos, state.playerHeight);
      if (playerBox.intersectsBox(obs.box)) {
        const obsCenter = new THREE.Vector3();
        obs.box.getCenter(obsCenter);
        const overlapY = Math.min(playerBox.max.y, obs.box.max.y) - Math.max(playerBox.min.y, obs.box.min.y);
        
        if (state.playerPos.y > obsCenter.y) {
          // Player is above the obstacle center
          // Only land on top if they are falling or stationary (not moving upwards)
          if (state.playerVelocity.y <= 0) {
            state.playerPos.y += (overlapY + 0.001);
            state.playerVelocity.y = 0;
            isGroundedThisFrame = true;
          }
        } else {
          // Player is below the obstacle center -> hit head / push down to prevent clipping above
          state.playerPos.y -= (overlapY + 0.001);
          state.playerVelocity.y = 0;
        }
      }
    });

    // 4. Floor boundaries & ground check
    const floorY = state.playerHeight;
    if (state.playerPos.y <= floorY) {
      state.playerPos.y = floorY;
      state.playerVelocity.y = 0;
      isGroundedThisFrame = true;
    }

    state.isGrounded = isGroundedThisFrame;
    if (state.isGrounded) {
      state.jumpCount = 0; // Reset double jump
    }

    // Map Boundaries
    if (mapType === 'ARENA') {
      const distFromCenter = Math.sqrt(state.playerPos.x * state.playerPos.x + state.playerPos.z * state.playerPos.z);
      if (distFromCenter > 38.5) {
        // Clamp player inside circular wall
        const dir = new THREE.Vector3(state.playerPos.x, 0, state.playerPos.z).normalize();
        state.playerPos.x = dir.x * 38.5;
        state.playerPos.z = dir.z * 38.5;
      }
    } else {
      state.playerPos.x = Math.max(-48.5, Math.min(48.5, state.playerPos.x));
      state.playerPos.z = Math.max(-48.5, Math.min(48.5, state.playerPos.z));
    }

    // 7. Update Camera yaw/pitch rotations and Player Model
    if (cameraRef.current) {
      if (mapType === 'LOBBY') {
        // Third person camera: placed behind and above the player
        const backDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
        const cameraOffset = new THREE.Vector3(0, 1.8, 3.8); // 3.8 units behind, 1.8 units above
        cameraOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), state.pitch); // apply vertical pitch look tilt
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw); // apply horizontal yaw look rotation
        
        const targetPos = state.playerPos.clone().add(new THREE.Vector3(0, 0.4, 0)); // look at player chest
        const cameraPos = state.playerPos.clone().add(cameraOffset);
        
        cameraRef.current.position.copy(cameraPos);
        cameraRef.current.lookAt(targetPos);
        
        // Hide first-person gun model in Lobby
        if (gunGroupRef.current) {
          gunGroupRef.current.visible = false;
        }

        // Update player 3D mesh position and rotation!
        if (playerModelRef.current) {
          const pModel = playerModelRef.current;
          pModel.visible = true;
          
          // Position player model on the floor below the eye height
          pModel.position.set(state.playerPos.x, state.playerPos.y - state.playerHeight, state.playerPos.z);
          
          // Face the direction of yaw (the view direction rotated 180 deg so they look where the camera is looking)
          pModel.rotation.y = state.yaw + Math.PI;

          // Limb animations based on movement!
          const speedSq = state.playerVelocity.x * state.playerVelocity.x + state.playerVelocity.z * state.playerVelocity.z;
          const isMoving = speedSq > 0.05;

          const leftArm = pModel.getObjectByName('left_arm');
          const rightArm = pModel.getObjectByName('right_arm');
          const leftLeg = pModel.getObjectByName('left_leg');
          const rightLeg = pModel.getObjectByName('right_leg');

          // Target rotations
          let targetModelRotX = 0;
          let targetLArmX = 0, targetLArmZ = 0;
          let targetRArmX = 0, targetRArmZ = 0;
          let targetLLegX = 0;
          let targetRLegX = 0;

          if (state.isSliding) {
            // Sliding animation (knees bent, torso leaned)
            targetModelRotX = -0.4; // lean forward
            targetLArmX = -1.2; targetLArmZ = -0.3;
            targetRArmX = -1.2; targetRArmZ = 0.3;
            targetLLegX = 1.0;
            targetRLegX = 0.2;
          } else if (!state.isGrounded) {
            // Jumping/Falling animation (limbs flailed outward)
            const t = performance.now() * 0.015;
            targetLArmX = -0.5 + Math.sin(t) * 0.3; targetLArmZ = -0.3;
            targetRArmX = 0.5 + Math.cos(t) * 0.3; targetRArmZ = 0.3;
            targetLLegX = -0.3;
            targetRLegX = 0.3;
          } else if (isMoving) {
            // Walking animation (Roblox blocky swing)
            const swing = Math.sin(performance.now() * 0.014) * 0.7;
            targetLArmX = swing; targetLArmZ = 0;
            targetRArmX = -swing; targetRArmZ = 0;
            targetLLegX = -swing;
            targetRLegX = swing;
          } else {
            // Idle stance
            targetLArmX = 0; targetLArmZ = 0.05;
            targetRArmX = 0; targetRArmZ = -0.05;
            targetLLegX = 0;
            targetRLegX = 0;
          }

          // Smoothly interpolate current rotations to target rotations
          const lerpSpeed = 15 * delta;
          pModel.rotation.x += (targetModelRotX - pModel.rotation.x) * lerpSpeed;
          
          if (leftArm) { 
            leftArm.rotation.x += (targetLArmX - leftArm.rotation.x) * lerpSpeed;
            leftArm.rotation.z += (targetLArmZ - leftArm.rotation.z) * lerpSpeed;
          }
          if (rightArm) { 
            rightArm.rotation.x += (targetRArmX - rightArm.rotation.x) * lerpSpeed;
            rightArm.rotation.z += (targetRArmZ - rightArm.rotation.z) * lerpSpeed;
          }
          if (leftLeg) { 
            leftLeg.rotation.x += (targetLLegX - leftLeg.rotation.x) * lerpSpeed;
            leftLeg.position.y = 0.5;
          }
          if (rightLeg) { 
            rightLeg.rotation.x += (targetRLegX - rightLeg.rotation.x) * lerpSpeed;
            rightLeg.position.y = 0.5;
          }
        }
      } else {
        // First person camera
        cameraRef.current.position.copy(state.playerPos);
        cameraRef.current.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
        
        // Dynamic camera lean and weapon tilt for sliding
        if (state.isSliding) {
          const slideProgress = state.slideTime / 0.8;
          const slideIntensity = Math.sin(slideProgress * Math.PI); // Smooth curve
          
          if (gunGroupRef.current) {
            gunGroupRef.current.position.y -= 0.06 * slideIntensity;
          }
        }
        
        // Hide player model if present in active match
        if (playerModelRef.current) {
          playerModelRef.current.visible = false;
        }
        if (gunGroupRef.current) {
          gunGroupRef.current.visible = true;
        }
      }
    }

    // 8. Update Bots (AI Move, aim and shoot)
    updateBots(delta);

    // 9. Update Tracers and Sparks lists (and clean old ones)
    if (sceneRef.current) {
      // Tracers
      for (let i = tracersRef.current.length - 1; i >= 0; i--) {
        const tracer = tracersRef.current[i];
        tracer.age += delta;
        if (tracer.age >= tracer.maxAge) {
          sceneRef.current.remove(tracer.line);
          tracersRef.current.splice(i, 1);
        } else {
          // fade opacity
          (tracer.line.material as THREE.LineBasicMaterial).opacity = 1 - tracer.age / tracer.maxAge;
        }
      }

      // Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const part = particlesRef.current[i];
        part.age += delta;
        if (part.age >= part.maxAge) {
          sceneRef.current.remove(part.system);
          particlesRef.current.splice(i, 1);
        } else {
          // Update particles positions by velocity list
          const posAttr = part.system.geometry.getAttribute('position') as THREE.BufferAttribute;
          const posArray = posAttr.array as Float32Array;
          const count = posAttr.count;

          for (let k = 0; k < count; k++) {
            posArray[k * 3] += part.velocities[k * 3] * delta;
            posArray[k * 3 + 1] += part.velocities[k * 3 + 1] * delta;
            posArray[k * 3 + 2] += part.velocities[k * 3 + 2] * delta;

            // apply gravity to spark particles
            part.velocities[k * 3 + 1] -= 9.8 * delta;
          }
          posAttr.needsUpdate = true;
          (part.system.material as THREE.PointsMaterial).opacity = 1 - part.age / part.maxAge;
        }
      }

      // 9b. Update Active RPG Rocket Projectiles
      for (let i = rocketsRef.current.length - 1; i >= 0; i--) {
        const r = rocketsRef.current[i];
        
        const prevPos = r.mesh.position.clone();
        const movement = r.direction.clone().multiplyScalar(r.speed * delta);
        r.mesh.position.add(movement);
        
        const currentPos = r.mesh.position;
        const moveDist = movement.length();
        let hitOccurred = false;
        const hitPoint = new THREE.Vector3();
        let hitBotIndex: number | null = null;
        let hitObject: 'GROUND' | 'OBSTACLE' | 'BOT' | 'PLAYER' | null = null;
        
        // Raycast forward along travel segment to check for exact collision
        const rocketRaycaster = new THREE.Raycaster(prevPos, r.direction.clone().normalize(), 0, moveDist + 0.1);
        let closestDist = Infinity;
        
        // Check obstacles (boxes/walls)
        const obstacleMeshes = obstaclesRef.current.map(o => o.mesh);
        const obsIntersects = rocketRaycaster.intersectObjects(obstacleMeshes, true);
        if (obsIntersects.length > 0) {
          closestDist = obsIntersects[0].distance;
          hitPoint.copy(obsIntersects[0].point);
          hitObject = 'OBSTACLE';
          hitOccurred = true;
        }
        
        // Check ground plane (y = 0)
        if (r.direction.y < 0) {
          const distToGround = -prevPos.y / r.direction.y;
          if (distToGround >= 0 && distToGround <= moveDist && distToGround < closestDist) {
            closestDist = distToGround;
            hitPoint.copy(prevPos).addScaledVector(r.direction, distToGround);
            hitObject = 'GROUND';
            hitOccurred = true;
          }
        }
        
        // Check enemy bots bounding meshes
        enemiesRef.current.forEach((bot, bIdx) => {
          if (bot.hp <= 0) return;
          const botIntersects = rocketRaycaster.intersectObject(bot.mesh, true);
          if (botIntersects.length > 0) {
            const first = botIntersects[0];
            if (first.distance < closestDist) {
              closestDist = first.distance;
              hitPoint.copy(first.point);
              hitBotIndex = bIdx;
              hitObject = 'BOT';
              hitOccurred = true;
            }
          }
        });

        // Check Player direct collision
        const distFromPlayer = currentPos.distanceTo(state.playerPos);
        const playerChest = state.playerPos.clone().add(new THREE.Vector3(0, 0.9, 0));
        const distToPlayerForCollision = currentPos.distanceTo(playerChest);
        if (distToPlayerForCollision < 0.8 && distToPlayerForCollision < closestDist) {
          // Prevent immediate self-collision right at muzzle exit (allow at > 2.0m travel)
          const isSelfCollisionJustFired = r.owner === 'PLAYER' && distFromPlayer < 2.0;
          if (!isSelfCollisionJustFired) {
            closestDist = distToPlayerForCollision;
            hitPoint.copy(playerChest);
            hitObject = 'PLAYER';
            hitOccurred = true;
          }
        }
        
        // Maximum rocket range safety cleanup
        const maxLifeDistance = 150;
        if (distFromPlayer > maxLifeDistance) {
          sceneRef.current.remove(r.mesh);
          rocketsRef.current.splice(i, 1);
          continue;
        }
        
        if (hitOccurred) {
          // Explode the rocket! Pass rocket owner
          triggerRocketExplosion(hitPoint, hitBotIndex, r.owner);
          
          sceneRef.current.remove(r.mesh);
          rocketsRef.current.splice(i, 1);
        }
      }
    }

    // Decay grenade cooldown
    if (state.grenadeCooldown > 0) {
      state.grenadeCooldown = Math.max(0, state.grenadeCooldown - delta);
    }

    // Update Thrown Parabolic Grenades
    if (sceneRef.current) {
      for (let i = activeGrenadesRef.current.length - 1; i >= 0; i--) {
        const g = activeGrenadesRef.current[i];
        
        // Gravity acceleration (parabolic movement)
        g.velocity.y -= 13.8 * delta;
        
        // Move grenade mesh
        g.mesh.position.addScaledVector(g.velocity, delta);
        
        // Tumbling spin rotation
        g.mesh.rotation.x += 3.5 * delta;
        g.mesh.rotation.y += 2.0 * delta;
        
        // Ground bounce collision
        if (g.mesh.position.y <= 0.08) {
          g.mesh.position.y = 0.08;
          g.velocity.y = -g.velocity.y * 0.45; // damp bounce
          g.velocity.x *= 0.7; // friction
          g.velocity.z *= 0.7;
        }
        
        // Obstacle bouncy collisions
        obstaclesRef.current.forEach((obs) => {
          const gBox = new THREE.Box3(
            g.mesh.position.clone().add(new THREE.Vector3(-0.15, -0.15, -0.15)),
            g.mesh.position.clone().add(new THREE.Vector3(0.15, 0.15, 0.15))
          );
          if (gBox.intersectsBox(obs.box)) {
            // bounce away: reverse horizontal velocity
            g.velocity.x = -g.velocity.x * 0.5;
            g.velocity.z = -g.velocity.z * 0.5;
            g.mesh.position.addScaledVector(g.velocity, delta * 2.5); // bounce offset
          }
        });
        
        // Tick down detonation timer (2.0s total fuse)
        g.timer -= delta;
        if (g.timer <= 0) {
          // Trigger the explosion!
          triggerRocketExplosion(g.mesh.position, null, g.owner, true); // isGrenade = true
          
          // Clean up 3D visual
          sceneRef.current.remove(g.mesh);
          activeGrenadesRef.current.splice(i, 1);
        }
      }
    }

    // 10. Floating Texts age & position updates
    if (floatingTextsRef.current.length > 0) {
      floatingTextsRef.current = floatingTextsRef.current
        .map((t) => {
          // float upward
          t.pos.y += 1.5 * delta;
          return { ...t, age: t.age + 2.0 * delta };
        })
        .filter((t) => t.age < 1.0);
      setFloatingTexts(floatingTextsRef.current);
    }

    // 11. Sync state to HUD callback in parent React App
    updateHUD({
      playerHP: state.playerHP,
      ammo: state.ammo,
      maxAmmo: state.maxAmmo,
      isAiming: state.isAiming,
      aimProgress: state.aimProgress,
      isReloading: state.isReloading,
      reloadProgress: state.reloadProgress,
      hitActive: state.hitActive,
      damageFlashActive: state.damageFlashActive,
      isSliding: state.isSliding,
      isSlideCooldown: state.slideCooldown > 0,
      primaryWeapon: primaryWeaponRef.current,
      grenadeCooldown: state.grenadeCooldown,
      grenadeCookTimer: grenadeCookTimerRef.current,
      reserveAmmo: state.weaponReserves[state.weaponType] ?? 0,
    });
  };

  // Convert 3D world coordinates to 2D screen positions for floating damage text
  const projectWorldToScreen = (pos: THREE.Vector3): { x: number; y: number } | null => {
    if (!cameraRef.current || !rendererRef.current || !containerRef.current) return null;

    const tempV = pos.clone();
    tempV.project(cameraRef.current);

    // If point is behind camera, don't show
    if (tempV.z > 1) return null;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const x = (tempV.x *  .5 + .5) * width;
    const y = (tempV.y * -.5 + .5) * height;

    return { x, y };
  };

  return (
    <div
      ref={containerRef}
      id="three-container"
      className="relative w-full h-full select-none overflow-hidden cursor-crosshair outline-none"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating 2D Damage Text Overlay */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        {floatingTexts.map((txt) => {
          const screenPos = projectWorldToScreen(txt.pos);
          if (!screenPos) return null;

          return (
            <div
              key={txt.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 font-mono text-xl font-black filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none transition-all ${txt.color}`}
              style={{
                left: `${screenPos.x}px`,
                top: `${screenPos.y}px`,
                opacity: 1 - txt.age,
                transform: `translate(-50%, -50%) scale(${1 + txt.age * 0.5})`,
              }}
            >
              {txt.text}
            </div>
          );
        })}
      </div>

      {/* Interactive Lobby Matchmaking Button Overlay Prompt */}
      {isNearButton && mapType === 'LOBBY' && (
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-40 select-none animate-bounce">
          <div className="bg-red-950/90 border border-red-500 rounded p-4 shadow-[0_0_20px_rgba(239,68,68,0.4)] flex flex-col items-center gap-1">
            <span className="text-white text-sm font-bold tracking-widest font-sans uppercase">
              단말기 탐지됨 (Terminal Detected)
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-red-500 text-black text-lg font-black font-mono px-3 py-1 rounded">
                [E]
              </span>
              <span className="text-white text-md font-semibold">
                또는 마우스 클릭하여 1v1 AI 대전 시작
              </span>
            </div>
            <span className="text-neutral-400 text-[11px] mt-1 font-mono text-center">
              (Start 1v1 match against your Rivals AI)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
