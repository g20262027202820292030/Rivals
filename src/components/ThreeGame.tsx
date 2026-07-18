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
  }) => void;
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
}: ThreeGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Update weapon config when prop changes
  useEffect(() => {
    const config = WEAPON_CONFIGS[weaponType];
    stateRef.current.weaponType = weaponType;
    stateRef.current.ammo = config.maxAmmo;
    stateRef.current.maxAmmo = config.maxAmmo;
    stateRef.current.isReloading = false;
    stateRef.current.isAiming = false;
    stateRef.current.aimProgress = 0;
    
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
  };

  // Build static gun model & attach to camera
  const createGunModel = () => {
    if (!cameraRef.current) return;

    // Clean old gun
    if (gunGroupRef.current) {
      cameraRef.current.remove(gunGroupRef.current);
    }

    const gunGroup = new THREE.Group();
    const isSniper = weaponType === 'SNIPER_RIFLE';

    // Construct gun out of multiple boxes/cylinders for a retro look
    if (isSniper) {
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
    } else {
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
      if (key === ' ' || key === 'q') {
        triggerJump();
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

  // Generates maps procedurally using static colors/geometries
  const generateMap = (scene: THREE.Scene, type: MapType) => {
    if (type === 'ARENA') {
      // 1. Sand Arena Floor (Circle)
      const floorGeo = new THREE.CylinderGeometry(40, 40, 1, 64);
      const floor = new THREE.Mesh(floorGeo, materials.sand);
      floor.position.set(0, -0.5, 0);
      floor.receiveShadow = true;
      scene.add(floor);

      // Add a collidable border
      addCircularBorder(scene, 40, 8, materials.concrete);

      // 2. Pillars (Marble cylinders)
      const pillarCount = 6;
      for (let i = 0; i < pillarCount; i++) {
        const angle = (i / pillarCount) * Math.PI * 2;
        const radius = 22;
        const px = Math.cos(angle) * radius;
        const pz = Math.sin(angle) * radius;

        // Base
        const baseGeo = new THREE.BoxGeometry(4, 1.5, 4);
        const base = new THREE.Mesh(baseGeo, materials.pillarBase);
        base.position.set(px, 0.75, pz);
        base.castShadow = true;
        base.receiveShadow = true;
        scene.add(base);
        addObstacle(baseGeo, base);

        // Shaft
        const shaftGeo = new THREE.CylinderGeometry(1.2, 1.2, 12, 16);
        const shaft = new THREE.Mesh(shaftGeo, materials.marble);
        shaft.position.set(px, 7.5, pz);
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        scene.add(shaft);
        addObstacle(shaftGeo, shaft);
      }

      // 3. Wooden Cover boxes scattered
      const boxes = [
        { size: [3, 3, 3], pos: [0, 1.5, -10] },
        { size: [2, 2, 4], pos: [-12, 1, 5], rot: 0.5 },
        { size: [4, 2, 2], pos: [12, 1, -4], rot: -0.3 },
        { size: [2.5, 2.5, 2.5], pos: [-6, 1.25, -16] },
        { size: [3, 2, 3], pos: [8, 1, 14], rot: 0.8 },
        { size: [2, 4, 2], pos: [-14, 2, -10] },
        { size: [3, 1.5, 2], pos: [15, 0.75, 12], rot: -0.2 },
      ];

      boxes.forEach(({ size, pos, rot }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const box = new THREE.Mesh(geo, materials.woodBox);
        box.position.set(pos[0], pos[1], pos[2]);
        if (rot) box.rotation.y = rot;
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
        addObstacle(geo, box);
      });

    } else {
      // BATTLEFIELD Map
      // 1. Concrete ground plane
      const floorGeo = new THREE.BoxGeometry(100, 1, 100);
      const floor = new THREE.Mesh(floorGeo, materials.concrete);
      floor.position.set(0, -0.5, 0);
      floor.receiveShadow = true;
      scene.add(floor);

      // Simple grid helper on floor to feel 3D
      const grid = new THREE.GridHelper(100, 50, 0x4f4f4f, 0x222222);
      grid.position.set(0, 0.01, 0);
      scene.add(grid);

      // Boundary Walls (4 tall walls)
      const borderGeoX = new THREE.BoxGeometry(100, 10, 1);
      const borderGeoZ = new THREE.BoxGeometry(1, 10, 100);

      const walls = [
        { geo: borderGeoX, pos: [0, 5, 50] },
        { geo: borderGeoX, pos: [0, 5, -50] },
        { geo: borderGeoZ, pos: [50, 5, 0] },
        { geo: borderGeoZ, pos: [-50, 5, 0] },
      ];

      walls.forEach(({ geo, pos }) => {
        const wall = new THREE.Mesh(geo, materials.barrier);
        wall.position.set(pos[0], pos[1], pos[2]);
        wall.receiveShadow = true;
        scene.add(wall);
        addObstacle(geo, wall);
      });

      // 2. Ruined military-style concrete barricades
      const barricades = [
        { size: [8, 2.5, 1.5], pos: [0, 1.25, 0] },
        { size: [6, 2.5, 1.5], pos: [-15, 1.25, 15], rot: Math.PI / 4 },
        { size: [6, 2.5, 1.5], pos: [15, 1.25, -15], rot: Math.PI / 4 },
        { size: [12, 3, 2], pos: [-20, 1.5, -20], rot: -Math.PI / 6 },
        { size: [12, 3, 2], pos: [20, 1.5, 20], rot: -Math.PI / 6 },
        // Container block covers
        { size: [5, 4, 10], pos: [-30, 2, 5], rot: 0.1 },
        { size: [5, 4, 10], pos: [30, 2, -5], rot: -0.1 },
        // Small sandbag piles
        { size: [3, 1.2, 1.2], pos: [10, 0.6, 10], rot: 0.3 },
        { size: [3, 1.2, 1.2], pos: [-10, 0.6, -10], rot: -0.3 },
        { size: [4, 1.2, 1.2], pos: [0, 0.6, 25] },
        { size: [4, 1.2, 1.2], pos: [0, 0.6, -25] },
      ];

      barricades.forEach(({ size, pos, rot }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mesh = new THREE.Mesh(geo, materials.rustyMetal);
        mesh.position.set(pos[0], pos[1], pos[2]);
        if (rot) mesh.rotation.y = rot;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        addObstacle(geo, mesh);
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
    const radius = isArena ? 25 : 35;
    // Spawn around in a circle relative to center, but opposite to player
    const angle = ((index + 1) / (isArena ? 4 : 5)) * Math.PI * 1.5 + Math.PI / 4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

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
      hp: 100,
      maxHp: 100,
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
    if (state.isGrounded && !state.isReloading && !state.roundEnded) {
      state.playerVelocity.y = 7.0; // Jump impulse
      state.isGrounded = false;
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

      // Slide height
      state.playerHeight = 0.8; // half eye height (crouching)
      state.playerPos.y = 0.8;
    }
  };

  // Reload Action
  const triggerReload = () => {
    const state = stateRef.current;
    if (!state.isReloading && state.ammo < state.maxAmmo && !state.roundEnded) {
      state.isReloading = true;
      state.reloadProgress = 0;
      state.reloadTimer = WEAPON_CONFIGS[weaponType].reloadTime;
      state.isAiming = false; // exit ADS to reload
      playReloadSound();
    }
  };

  // Core shooting mechanic
  const shootWeapon = () => {
    const state = stateRef.current;
    const now = performance.now();
    const config = WEAPON_CONFIGS[weaponType];

    if (now - state.lastShotTime < config.fireRate) return;
    if (state.isReloading) return;

    if (state.ammo <= 0) {
      // Empty clip click / auto reload
      triggerReload();
      return;
    }

    state.lastShotTime = now;
    state.ammo--;

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
    playShootSound(weaponType === 'SNIPER_RIFLE');

    // 3. Gun Recoil Sway / Bolt action kick
    if (gunGroupRef.current) {
      gunGroupRef.current.position.z += 0.12; // kick backward
      gunGroupRef.current.position.y += 0.05; // kick upward
    }

    // Exit zoom if sniper rifle after shot (1 shot untoggles ADS)
    if (weaponType === 'SNIPER_RIFLE') {
      state.isAiming = false;
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

    // B. Check enemy bots bounding spheres / hitboxes
    let hitBotIndex: number | null = null;
    enemiesRef.current.forEach((bot, bIdx) => {
      if (bot.hp <= 0) return;

      // Simple cylinder ray intersect (precise enough for FPS)
      const botCenter = bot.mesh.position.clone().add(new THREE.Vector3(0, bot.height / 2, 0));
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

    // 5. Spawn Tracer line
    if (sceneRef.current && gunMuzzleRef.current) {
      const muzzleWorldPos = new THREE.Vector3();
      gunMuzzleRef.current.getWorldPosition(muzzleWorldPos);

      // Create glowing laser tracer
      const points = [muzzleWorldPos, hitPoint];
      const tracerGeo = new THREE.BufferGeometry().setFromPoints(points);
      const tracerMat = new THREE.LineBasicMaterial({
        color: weaponType === 'SNIPER_RIFLE' ? 0x00ffff : 0xffaa00,
        linewidth: 2,
        transparent: true,
        opacity: 0.9,
      });
      const tracerLine = new THREE.Line(tracerGeo, tracerMat);
      sceneRef.current.add(tracerLine);

      tracersRef.current.push({
        line: tracerLine,
        age: 0,
        maxAge: 0.12, // extremely fast fade
      });
    }

    // 6. Handle hit outcomes
    if (hitObject === 'BOT' && hitBotIndex !== null) {
      const bot = enemiesRef.current[hitBotIndex];
      const damage = config.damage;
      
      // Randomly critical hits (2x damage)
      const isCrit = Math.random() < 0.25;
      const finalDamage = isCrit ? damage * 2 : damage;

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

      // Move toward target position
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

      // Check obstacle boundaries for bots (circular for arena, box for battlefield)
      if (mapType === 'ARENA') {
        const rad = bot.mesh.position.length();
        if (rad > 38.5) {
          bot.mesh.position.normalize().multiplyScalar(38.5);
          bot.stateTimer = 0; // force new target
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
          // Push bot away
          const pushDir = bot.mesh.position.clone().sub(obs.mesh.position);
          pushDir.y = 0;
          pushDir.normalize();
          bot.mesh.position.addScaledVector(pushDir, 0.15);
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
    const config = WEAPON_CONFIGS[weaponType];

    // 1. Zoom/Aim Down Sights (ADS) progress animation
    if (state.isAiming) {
      // AR aim time = 0.7s, Sniper = 1.1s
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
        if (weaponType === 'SNIPER_RIFLE' && state.aimProgress > 0.95) {
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
      if (weaponType === 'ASSAULT_RIFLE') {
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
    const moveSpeed = state.isSliding ? 14.0 : state.isAiming ? 3.0 : 7.0; // sliding gives high momentum, aiming slows down
    
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

    // Update Player position by velocity
    state.playerPos.x += state.playerVelocity.x * delta;
    state.playerPos.y += state.playerVelocity.y * delta;
    state.playerPos.z += state.playerVelocity.z * delta;

    // Ground check (Floor y = 0, player coordinates reflect eye height)
    const floorY = state.playerHeight;
    if (state.playerPos.y <= floorY) {
      state.playerPos.y = floorY;
      state.playerVelocity.y = 0;
      state.isGrounded = true;
    }

    // Obstacles Collisions detection
    obstaclesRef.current.forEach((obs) => {
      // Player bounding box (AABB)
      const playerBox = new THREE.Box3(
        state.playerPos.clone().add(new THREE.Vector3(-0.6, -state.playerHeight, -0.6)),
        state.playerPos.clone().add(new THREE.Vector3(0.6, 0.4, 0.6))
      );

      if (playerBox.intersectsBox(obs.box)) {
        // Resolve collision: push player away from obstacle
        const pushDir = state.playerPos.clone().sub(obs.mesh.position);
        pushDir.y = 0;
        pushDir.normalize();
        state.playerPos.addScaledVector(pushDir, 0.25);
      }
    });

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
