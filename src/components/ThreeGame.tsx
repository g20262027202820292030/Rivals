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
  }) => void;
  onWeaponChange?: (weapon: WeaponType) => void;
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
}

interface Obstacle {
  box: THREE.Box3;
  mesh: THREE.Mesh;
}

export default function ThreeGame({
  mapType,
  weaponType,
  round,
  onRoundComplete,
  isLocked,
  setIsLocked,
  updateHUD,
  onWeaponChange,
}: ThreeGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep track of primary weapon on mount, and dynamic weapon callback
  const primaryWeaponRef = useRef<WeaponType>(weaponType);
  const onWeaponChangeRef = useRef(onWeaponChange);
  useEffect(() => {
    onWeaponChangeRef.current = onWeaponChange;
  }, [onWeaponChange]);

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

    // Aim / Reload
    isAiming: false,
    aimProgress: 0, // 0 to 1
    isReloading: false,
    reloadProgress: 0, // 0 to 1
    reloadTimer: 0,
    lastShotTime: 0,

    // Feedback
    hitActive: false,
    hitTimer: 0,
    damageFlashActive: false,
    damageFlashTimer: 0,

    // Round logic
    roundEnded: false,
    jumpCount: 0,
  });

  // Track keyboard inputs
  const keysRef = useRef<Record<string, boolean>>({});

  // ThreeJS variables
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gunGroupRef = useRef<THREE.Group | null>(null);
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
    
    // Remember the chosen primary weapon (must not be FIST)
    if (weaponType !== 'FIST') {
      primaryWeaponRef.current = weaponType;
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
      // Melee: Fist
      // Arm forearm (sleeve)
      const armGeo = new THREE.BoxGeometry(0.08, 0.08, 0.25);
      const armMat = new THREE.MeshStandardMaterial({ color: 0x485460, roughness: 0.5 });
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(0, -0.05, -0.15);
      gunGroup.add(arm);

      // Glove / Hand box
      const handGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const handMat = new THREE.MeshStandardMaterial({ color: 0xfbc531, roughness: 0.4 }); // yellow/orange robotic hand glove
      const hand = new THREE.Mesh(handGeo, handMat);
      hand.position.set(0, -0.05, -0.28);
      gunGroup.add(hand);

      // Knuckle glow (red / orange)
      const knuckleGeo = new THREE.BoxGeometry(0.08, 0.02, 0.02);
      const knuckle = new THREE.Mesh(knuckleGeo, materials.glowingRed);
      knuckle.position.set(0, -0.01, -0.33);
      gunGroup.add(knuckle);

      // Muzzle locator (not really used for shooting bullets, but good as a raycast start/flash location)
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, -0.05, -0.35);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (isSniper) {
      // Sniper rifle
      // Main body (dark metal)
      const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.6);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 0, -0.2);
      gunGroup.add(body);

      // Long Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 8);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.7);
      gunGroup.add(barrel);

      // Scope (highly magnified sniper scope)
      const scopeBodyGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 12);
      const scopeBodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4 });
      const scope = new THREE.Mesh(scopeBodyGeo, scopeBodyMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.07, -0.2);
      gunGroup.add(scope);

      // Scope lens (neon cyan glass)
      const lensGeo = new THREE.CircleGeometry(0.02, 12);
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 0.07, -0.35);
      gunGroup.add(lens);

      // Stock
      const stockGeo = new THREE.BoxGeometry(0.05, 0.12, 0.3);
      const stock = new THREE.Mesh(stockGeo, bodyMat);
      stock.position.set(0, -0.05, 0.2);
      gunGroup.add(stock);

      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.01, -1.1);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'ASSAULT_RIFLE') {
      // Assault Rifle
      // Main body (dark tactical carbon/grey)
      const bodyGeo = new THREE.BoxGeometry(0.06, 0.1, 0.4);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.6 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 0, -0.15);
      gunGroup.add(body);

      // Medium barrel
      const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.4 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.015, -0.45);
      gunGroup.add(barrel);

      // Magazine (curved, tilted box)
      const magGeo = new THREE.BoxGeometry(0.04, 0.15, 0.07);
      const magMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.7 });
      const mag = new THREE.Mesh(magGeo, magMat);
      mag.position.set(0, -0.12, -0.1);
      mag.rotation.x = -0.15;
      gunGroup.add(mag);

      // Holographic red dot sight
      const sightBaseGeo = new THREE.BoxGeometry(0.03, 0.02, 0.08);
      const sightBase = new THREE.Mesh(sightBaseGeo, magMat);
      sightBase.position.set(0, 0.06, -0.15);
      gunGroup.add(sightBase);

      const sightGlassGeo = new THREE.BoxGeometry(0.005, 0.03, 0.04);
      const sightGlassMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
      const sightGlass = new THREE.Mesh(sightGlassGeo, sightGlassMat);
      sightGlass.rotation.y = Math.PI / 2;
      sightGlass.position.set(0, 0.08, -0.15);
      gunGroup.add(sightGlass);

      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.015, -0.6);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    } else if (currentWeaponType === 'RPG') {
      // RPG tube (olive drab / green)
      const tubeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12);
      const tubeMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.6 });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0, -0.2);
      gunGroup.add(tube);

      // Rocket warhead sticking out front
      const warheadGeo = new THREE.CylinderGeometry(0.06, 0.02, 0.2, 12);
      const warheadMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.3 });
      const warhead = new THREE.Mesh(warheadGeo, warheadMat);
      warhead.rotation.x = Math.PI / 2;
      warhead.position.set(0, 0, -0.7);
      gunGroup.add(warhead);
      
      // Red tip
      const tipGeo = new THREE.ConeGeometry(0.02, 0.05, 12);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0, -0.825);
      gunGroup.add(tip);

      // Handle/Grip
      const gripGeo = new THREE.BoxGeometry(0.02, 0.15, 0.04);
      const gripMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }); // Wood grip
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.position.set(0, -0.1, -0.1);
      grip.rotation.x = -0.2;
      gunGroup.add(grip);
      
      // Muzzle locator
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -0.85);
      gunGroup.add(muzzle);
      gunMuzzleRef.current = muzzle;
    }

    // Default rest position (off to the bottom-right)
    gunGroup.position.set(0.25, -0.22, -0.35);
    cameraRef.current.add(gunGroup);
    gunGroupRef.current = gunGroup;
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
    state.playerVelocity.set(0, 0, 0);
    state.pitch = 0;
    state.yaw = 0; // facing north (towards negative z)

    // Set map-specific spawn position
    if (mapType === 'ARENA') {
      state.playerPos.set(0, 1.6, 25);
    } else {
      state.playerPos.set(0, 1.6, 35);
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Set map backgrounds/fog
    if (mapType === 'ARENA') {
      scene.background = new THREE.Color(0xfae1b0); // sandy/sunset peach
      scene.fog = new THREE.FogExp2(0xfae1b0, 0.015);
    } else {
      scene.background = new THREE.Color(0x1a2130); // dark cloudy battlefield
      scene.fog = new THREE.FogExp2(0x1a2130, 0.01);
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
    const ambientLight = new THREE.AmbientLight(0xffffff, mapType === 'ARENA' ? 0.6 : 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff3e0, mapType === 'ARENA' ? 1.2 : 0.6);
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

    // 5. Spawn Enemy Bots (Round depends on score or a set value)
    enemiesRef.current = [];
    // Spawn exactly 1 enemy bot as requested
    const botCount = 1;
    for (let i = 0; i < botCount; i++) {
      spawnBot(scene, i);
    }

    // 6. Setup Event Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;

      // Handle Reload trigger
      if (key === 'r') {
        triggerReload();
      }

      // Handle Slide trigger
      if (key === 'c') {
        triggerSlide();
      }

      // Handle Jump trigger
      if ((key === ' ' || key === 'q') && !e.repeat) {
        triggerJump();
      }

      // 1: Switch to primary weapon
      if (key === '1') {
        if (onWeaponChangeRef.current) {
          onWeaponChangeRef.current(primaryWeaponRef.current);
        }
      }

      // 3: Switch to fist (melee)
      if (key === '3') {
        if (onWeaponChangeRef.current) {
          onWeaponChangeRef.current('FIST');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    // Mouse events
    const handleMouseMove = (e: MouseEvent) => {
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
      if (document.pointerLockElement !== container) {
        requestLock();
        return;
      }

      if (e.button === 0) {
        // Left click: Shoot/Hold fire flag
        keysRef.current['left_click'] = true;
      } else if (e.button === 2) {
        // Right click: ADS Aim toggle/hold
        stateRef.current.isAiming = true;
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
        { size: [6, 2.0, 2], pos: [0, 1.5, 10], mat: materials.plasticDark, neon: materials.neonRed },
        { size: [6, 3.0, 2], pos: [0, 2.5, 8], mat: materials.plasticDark, neon: materials.neonRed },
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
        { size: [6, 2.0, 2], pos: [0, 1.5, -10], mat: materials.plasticDark, neon: materials.neonBlue },
        { size: [6, 3.0, 2], pos: [0, 2.5, -8], mat: materials.plasticDark, neon: materials.neonBlue },
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

    } else {
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

  // Humanoid robotic dummy bot spawn
  const spawnBot = (scene: THREE.Scene, index: number) => {
    const isArena = mapType === 'ARENA';
    // Symmetrical spawn: bot spawns on the north side (negative Z)
    const x = index === 0 ? 0 : (index % 2 === 0 ? 12 : -12);
    const z = isArena ? -25 : -35;

    const botGroup = new THREE.Group();
    botGroup.position.set(x, 0, z);

    // Torso (glowing gray plastic chest)
    const torsoGeo = new THREE.BoxGeometry(0.8, 1.1, 0.4);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x485460, roughness: 0.4 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.receiveShadow = true;
    botGroup.add(torso);

    // Glowing core on chest
    const coreGeo = new THREE.BoxGeometry(0.3, 0.3, 0.05);
    const core = new THREE.Mesh(coreGeo, materials.glowingRed);
    core.position.set(0, 1.2, 0.21);
    botGroup.add(core);

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85;
    head.castShadow = true;
    botGroup.add(head);

    // Visor glowing eye
    const visorGeo = new THREE.BoxGeometry(0.35, 0.1, 0.05);
    const visor = new THREE.Mesh(visorGeo, materials.glowingRed);
    visor.position.set(0, 1.85, 0.26);
    botGroup.add(visor);

    // Left Arm
    const armGeo = new THREE.BoxGeometry(0.25, 1.0, 0.25);
    const lArm = new THREE.Mesh(armGeo, torsoMat);
    lArm.position.set(-0.55, 1.1, 0);
    lArm.castShadow = true;
    botGroup.add(lArm);

    // Right Arm (holding a weapon block)
    const rArm = new THREE.Mesh(armGeo, torsoMat);
    rArm.position.set(0.55, 1.1, 0);
    rArm.castShadow = true;
    botGroup.add(rArm);

    // Dummy gun
    const gunBlockGeo = new THREE.BoxGeometry(0.15, 0.15, 0.7);
    const gunBlock = new THREE.Mesh(gunBlockGeo, headMat);
    gunBlock.position.set(0.55, 0.9, 0.2);
    botGroup.add(gunBlock);

    // Left & Right Legs
    const legGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
    const lLeg = new THREE.Mesh(legGeo, headMat);
    lLeg.position.set(-0.22, 0.5, 0);
    lLeg.castShadow = true;
    botGroup.add(lLeg);

    const rLeg = new THREE.Mesh(legGeo, headMat);
    rLeg.position.set(0.22, 0.5, 0);
    rLeg.castShadow = true;
    botGroup.add(rLeg);

    scene.add(botGroup);

    enemiesRef.current.push({
      mesh: botGroup,
      hp: 150,
      maxHp: 150,
      velocity: new THREE.Vector3(),
      lastShotTime: performance.now() + Math.random() * 2000, // randomized delay on first shot
      shootInterval: isArena ? 1600 : 2000, // slightly slower shots in open field
      state: 'PATROL',
      targetPos: new THREE.Vector3(x, 0, z),
      stateTimer: 0,
      width: 1.4,
      height: 2.1,
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
      const speed = 4 + Math.random() * 10;

      velocities.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 3, // slightly upward biased
        Math.sin(phi) * Math.sin(theta) * speed
      );
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xff4400, // Fiery orange-red
      size: 0.4, // Large size
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
      maxAge: 0.8,
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
      const speed = 3 + Math.random() * 7;

      yellowVel.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 2,
        Math.sin(phi) * Math.sin(theta) * speed
      );
    }

    yellowGeo.setAttribute('position', new THREE.BufferAttribute(yellowPos, 3));
    const yellowMat = new THREE.PointsMaterial({
      color: 0xffcc00, // Bright yellow
      size: 0.25,
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
      maxAge: 0.6,
    });
  };

  // Rocket explosion impact and area-of-effect damage logic
  const triggerRocketExplosion = (hitPoint: THREE.Vector3, hitBotIndex: number | null) => {
    const state = stateRef.current;
    if (!sceneRef.current) return;

    // 1. Spawning big rocket explosion particles
    createExplosionParticles(hitPoint);
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0, 1.0, 0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(1.0, 0, 0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(-1.0, 0, 0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0, 0, 1.0)));
    createExplosionParticles(hitPoint.clone().add(new THREE.Vector3(0, 0, -1.0)));

    // Spawn secondary debris a bit later
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        if (sceneRef.current) {
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3
          );
          createExplosionParticles(hitPoint.clone().add(offset));
        }
      }, 50 + k * 40);
    }

    playHitSound();

    // 1b. Check if Player is within the explosion radius (8.0 units) to launch/jump them!
    const distToPlayer = state.playerPos.distanceTo(hitPoint);
    if (distToPlayer < 8.0) {
      // Launch player! Give upward velocity proportional to proximity
      const launchPower = 11.0 + (1 - distToPlayer / 8.0) * 8.0; // 11 to 19 units vertical launch
      state.playerVelocity.y = launchPower;
      state.isGrounded = false;

      // Add a nice horizontal knockback blast force to player
      const pushDir = state.playerPos.clone().sub(hitPoint);
      pushDir.y = 0;
      if (pushDir.lengthSq() > 0.01) {
        pushDir.normalize();
        const horizPush = 12.0 * (1 - distToPlayer / 8.0);
        state.playerVelocity.x += pushDir.x * horizPush;
        state.playerVelocity.z += pushDir.z * horizPush;
      }
    }

    // 2. Splash and Direct damage for all bots within splashRadius (8.0 units!)
    enemiesRef.current.forEach((bot, bIdx) => {
      if (bot.hp <= 0) return;

      const distToExplosion = bot.mesh.position.distanceTo(hitPoint);
      let dmgToApply = 0;
      let isDirect = false;

      if (bIdx === hitBotIndex) {
        dmgToApply = 100; // Direct hit
        isDirect = true;
      } else if (distToExplosion < 8.0) {
        // Splash damage (any bot within 8 units gets 50 damage!)
        dmgToApply = 50;
      }

      // Launch bots within the 8.0 unit explosion radius!
      if (distToExplosion < 8.0 || bIdx === hitBotIndex) {
        const launchY = 11.0 + (1 - Math.min(8.0, distToExplosion) / 8.0) * 8.0;
        bot.velocity.y = launchY;

        // Push bot horizontally away from explosion center
        const pushDir = bot.mesh.position.clone().sub(hitPoint);
        pushDir.y = 0;
        if (pushDir.lengthSq() > 0.01) {
          pushDir.normalize();
          const horizPush = 10.0 * (1 - Math.min(8.0, distToExplosion) / 8.0);
          bot.velocity.x = pushDir.x * horizPush;
          bot.velocity.z = pushDir.z * horizPush;
        }
      }

      if (dmgToApply > 0) {
        bot.hp -= dmgToApply;
        state.hitActive = true;
        state.hitTimer = 0.12;

        addFloatingDamage(`${dmgToApply}!`, bot.mesh.position.clone().add(new THREE.Vector3(0, bot.height, 0)), isDirect);

        // Bot flash red damage animation
        bot.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const originalColor = child.material.color.clone();
            child.material.color.setHex(0xff0000);
            setTimeout(() => {
              if (child && child.material) child.material.color.copy(originalColor);
            }, 150);
          }
        });

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

  // Jump Action
  const triggerJump = () => {
    const state = stateRef.current;
    if (state.isReloading || state.roundEnded) return;

    if (state.isGrounded) {
      let jumpPower = 7.475; // 6.5 * 1.15
      if (state.isSliding) {
        jumpPower = 8.97; // 7.475 * 1.2
      }
      state.playerVelocity.y = jumpPower; // Jump impulse
      state.isGrounded = false;
      state.jumpCount = 1;
      playJumpSound();
    } else if (state.weaponType === 'FIST' && state.jumpCount < 2) {
      state.playerVelocity.y = 7.475; // Double jump impulse
      state.jumpCount = 2;
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
    if (!state.isReloading && state.ammo < state.maxAmmo && !state.roundEnded) {
      state.isReloading = true;
      state.reloadProgress = 0;
      state.reloadTimer = WEAPON_CONFIGS[state.weaponType].reloadTime;
      state.isAiming = false; // exit ADS to reload
      playReloadSound();
    }
  };

  // Core shooting mechanic
  const shootWeapon = () => {
    const state = stateRef.current;
    const now = performance.now();
    const currentWeaponType = state.weaponType;
    const config = WEAPON_CONFIGS[currentWeaponType];

    if (now - state.lastShotTime < config.fireRate) return;
    if (state.isReloading) return;

    if (currentWeaponType !== 'FIST' && state.ammo <= 0) {
      // Empty clip click / auto reload
      triggerReload();
      return;
    }

    state.lastShotTime = now;
    if (currentWeaponType !== 'FIST') {
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
        gunGroupRef.current.position.z -= 0.25; // punch forward!
      } else {
        gunGroupRef.current.position.z += 0.12; // kick backward
        gunGroupRef.current.position.y += 0.05; // kick upward
      }
    }

    // Exit zoom if sniper rifle after shot (1 shot untoggles ADS)
    if (currentWeaponType === 'SNIPER_RIFLE') {
      state.isAiming = false;
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
          splashRadius: 8.0,
        });
      }
      return; // Skip raycast hit detection
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
    const maxRange = currentWeaponType === 'FIST' ? 3.5 : 100;
    if (closestDist > maxRange) {
      hitObject = null;
      hitBotIndex = null;
    }

    // 5. Spawn Tracer line
    if (sceneRef.current && gunMuzzleRef.current && currentWeaponType !== 'FIST') {
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
          damage = damage * (currentWeaponType === 'SNIPER_RIFLE' ? 2 : 2.5); // 100% crit chance if headshot
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

      // Bot flash red damage animation
      bot.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const originalColor = child.material.color.clone();
          child.material.color.setHex(0xff0000);
          setTimeout(() => {
            if (child && child.material) child.material.color.copy(originalColor);
          }, 150);
        }
      });

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

    // Visual red muzzle flash tracer on bot
    const startPos = bot.mesh.position.clone().add(new THREE.Vector3(0.55, 1.1, 0.4));
    const endPos = stateRef.current.playerPos.clone();
    
    // Add inaccuracy to bot shots
    endPos.x += (Math.random() - 0.5) * 1.5;
    endPos.y += (Math.random() - 0.5) * 1.0;
    endPos.z += (Math.random() - 0.5) * 1.5;

    // Draw bot shot laser (red)
    const points = [startPos, endPos];
    const tracerGeo = new THREE.BufferGeometry().setFromPoints(points);
    const tracerMat = new THREE.LineBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.8,
    });
    const tracerLine = new THREE.Line(tracerGeo, tracerMat);
    sceneRef.current.add(tracerLine);

    tracersRef.current.push({
      line: tracerLine,
      age: 0,
      maxAge: 0.15,
    });

    // Check hit: Bot hit chance is based on range & whether player is sliding
    const dist = startPos.distanceTo(stateRef.current.playerPos);
    let hitChance = 0.45 - dist * 0.005; // further is harder to hit
    if (stateRef.current.isSliding) {
      hitChance *= 0.4; // sliding lowers profile making it 60% harder to hit!
    }

    if (Math.random() < hitChance) {
      // Player hit!
      const damage = mapType === 'ARENA' ? 15 : 12; // Arena bot deals slightly higher damage
      stateRef.current.playerHP = Math.max(0, stateRef.current.playerHP - damage);
      stateRef.current.damageFlashActive = true;
      stateRef.current.damageFlashTimer = 0.2; // 0.2s blood flash
      playHurtSound();

      checkRoundOutcome();
    }
  };

  // AI Logic loop for bot patrols/movement
  const updateBots = (delta: number) => {
    const state = stateRef.current;
    if (state.roundEnded) return;

    enemiesRef.current.forEach((bot) => {
      if (bot.hp <= 0) return;

      bot.stateTimer -= delta;

      const distToPlayer = bot.mesh.position.distanceTo(state.playerPos);

      // Simple State Machine
      if (bot.stateTimer <= 0) {
        bot.stateTimer = 1.5 + Math.random() * 2;
        
        // Decide next state
        if (distToPlayer > 25) {
          bot.state = 'CHASE';
        } else {
          // Patrol or side strafe
          bot.state = Math.random() < 0.65 ? 'COVER' : 'PATROL';
        }

        // Calculate a random target coordinate based on state
        if (bot.state === 'CHASE') {
          // move closer to player
          bot.targetPos.copy(state.playerPos).add(new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            0,
            (Math.random() - 0.5) * 10
          ));
        } else if (bot.state === 'COVER') {
          // dodge/strafe side-to-side relative to player
          const toPlayer = state.playerPos.clone().sub(bot.mesh.position).normalize();
          const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x); // orthogonal vector
          const strafeDist = (Math.random() - 0.5) * 12;
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
          bot.mesh.children[4].rotation.x = swing; // L arm
          bot.mesh.children[5].rotation.x = -swing; // R arm
          bot.mesh.children[7].rotation.x = -swing; // L leg
          bot.mesh.children[8].rotation.x = swing; // R leg
        } else {
          // Reset limb tilts
          bot.mesh.children[4].rotation.x = 0;
          bot.mesh.children[5].rotation.x = 0;
          bot.mesh.children[7].rotation.x = 0;
          bot.mesh.children[8].rotation.x = 0;
        }
      } else {
        // Flail limbs in the air when knocked back!
        const flail = Math.sin(performance.now() * 0.02) * 0.6;
        bot.mesh.children[4].rotation.x = flail;
        bot.mesh.children[5].rotation.x = -flail;
        bot.mesh.children[7].rotation.x = -flail;
        bot.mesh.children[8].rotation.x = flail;
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

      // Fire weapon at player when ready
      const now = performance.now();
      if (now - bot.lastShotTime > bot.shootInterval && distToPlayer < 40) {
        // Only shoot if bot has line of sight (not covered by obstacles)
        const rayDir = state.playerPos.clone().sub(bot.mesh.position).normalize();
        const ray = new THREE.Raycaster(bot.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), rayDir);
        const intersects = ray.intersectObjects(obstaclesRef.current.map(o => o.mesh));
        
        const obstacleDistance = intersects.length > 0 ? intersects[0].distance : Infinity;
        
        if (obstacleDistance > distToPlayer) {
          bot.lastShotTime = now;
          botShootAtPlayer(bot);
        }
      }
    });
  };

  // Main frame updater loop (Physics + Controls + Particles + HUD Sync)
  const updateGame = (delta: number) => {
    const state = stateRef.current;
    const currentWeaponType = state.weaponType;
    const config = WEAPON_CONFIGS[currentWeaponType];

    // 1. Zoom/Aim Down Sights (ADS) progress animation
    if (state.isAiming) {
      const aimSpeed = 1 / config.aimTime;
      state.aimProgress = Math.min(1.0, state.aimProgress + aimSpeed * delta);
    } else {
      state.aimProgress = Math.max(0.0, state.aimProgress - 3.0 * delta); // quick exit zoom
    }

    // Camera FOV zoom scaling based on aimProgress
    if (cameraRef.current) {
      // default FOV is 75, zoomed is config.zoomFov (AR: 45, Sniper: 15)
      const targetFov = 75 - (75 - config.zoomFov) * state.aimProgress;
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
        // Sniper: Hide model when scoped (aimProgress > 0.95) to clear screen for the black scope lens!
        if (currentWeaponType === 'SNIPER_RIFLE' && state.aimProgress > 0.95) {
          gunGroupRef.current.visible = false;
        } else {
          gunGroupRef.current.visible = true;
          const targetX = 0 - (0.25 * (1 - state.aimProgress));
          const targetY = -0.15 - (0.07 * (1 - state.aimProgress));
          const targetZ = -0.35 + (0.05 * state.aimProgress);

          gunGroupRef.current.position.set(targetX + swayX, targetY + swayY, targetZ);
        }
      } else {
        gunGroupRef.current.visible = true;
        // Smoothly interpolate back to hip-fire position
        const currentPos = gunGroupRef.current.position;
        const targetX = 0.25;
        const targetY = -0.22;
        const targetZ = -0.35;

        currentPos.x += (targetX - currentPos.x) * 10 * delta;
        currentPos.y += (targetY - currentPos.y) * 10 * delta;
        currentPos.z += (targetZ - currentPos.z) * 10 * delta;

        // add sway
        currentPos.x += swayX;
        currentPos.y += swayY;
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
    const targetHeight = state.isSliding ? 0.8 : 1.6;
    state.playerHeight += (targetHeight - state.playerHeight) * 8 * delta;

    // 3. Reloading logic
    if (state.isReloading) {
      state.reloadProgress = Math.min(1.0, state.reloadProgress + (delta * 1000) / state.reloadTimer);
      if (state.reloadProgress >= 1.0) {
        state.isReloading = false;
        state.ammo = state.maxAmmo;
      }
    }

    // 4. Handle Gun Fire inputs (Left click)
    if (keysRef.current['left_click'] && !state.roundEnded) {
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
    if (state.isSliding) {
      // locked movement sliding momentum
      const slideFriction = 0.95; // slide momentum decay
      state.playerVelocity.x = state.slideDirection.x * moveSpeed * Math.max(0.3, state.slideTime / 0.8);
      state.playerVelocity.z = state.slideDirection.z * moveSpeed * Math.max(0.3, state.slideTime / 0.8);
    } else {
      // standard WASD walking
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
          // Player is above the obstacle center -> land on top
          state.playerPos.y += (overlapY + 0.001);
          state.playerVelocity.y = 0;
          isGroundedThisFrame = true;
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

    // 7. Update Camera yaw/pitch rotations
    if (cameraRef.current) {
      cameraRef.current.position.copy(state.playerPos);
      cameraRef.current.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
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
        let hitObject: 'GROUND' | 'OBSTACLE' | 'BOT' | null = null;
        
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
        
        // Maximum rocket range safety cleanup
        const maxLifeDistance = 150;
        const distFromPlayer = currentPos.distanceTo(state.playerPos);
        if (distFromPlayer > maxLifeDistance) {
          sceneRef.current.remove(r.mesh);
          rocketsRef.current.splice(i, 1);
          continue;
        }
        
        if (hitOccurred) {
          // Explode the rocket!
          triggerRocketExplosion(hitPoint, hitBotIndex);
          
          sceneRef.current.remove(r.mesh);
          rocketsRef.current.splice(i, 1);
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
    </div>
  );
}
