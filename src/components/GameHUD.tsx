import React from 'react';
import { WeaponType, WEAPON_CONFIGS } from '../types';
import { Shield, Zap, RefreshCw, Crosshair, Lock, Move, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GameHUDProps {
  playerHP: number;
  maxHP: number;
  ammo: number;
  maxAmmo: number;
  weaponType: WeaponType;
  isAiming: boolean;
  aimProgress: number; // 0 to 1
  isReloading: boolean;
  reloadProgress: number; // 0 to 1
  playerScore: number;
  enemyScore: number;
  round: number;
  hitActive: boolean;
  damageFlashActive: boolean;
  isSliding: boolean;
  isSlideCooldown: boolean;
  isLocked: boolean;
  onUnlockRequest?: () => void;
  onExitGame?: () => void;
}

export default function GameHUD({
  playerHP,
  maxHP,
  ammo,
  maxAmmo,
  weaponType,
  isAiming,
  aimProgress,
  isReloading,
  reloadProgress,
  playerScore,
  enemyScore,
  round,
  hitActive,
  damageFlashActive,
  isSliding,
  isSlideCooldown,
  isLocked,
  onExitGame,
}: GameHUDProps) {
  const hpPercentage = Math.max(0, Math.min(100, (playerHP / maxHP) * 100));
  const weaponConfig = WEAPON_CONFIGS[weaponType];

  const currentSpread = isAiming
    ? weaponConfig.adsSpread
    : weaponConfig.hipSpread;
  const crosshairSize = 16 + currentSpread * 6;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none select-none font-sans overflow-hidden">
      
      {/* 1. Full Screen Damage Vignette */}
      <AnimatePresence>
        {damageFlashActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-radial from-transparent via-red-950/30 to-red-600/65 mix-blend-multiply pointer-events-none z-10"
          />
        )}
      </AnimatePresence>

      {/* 2. Sniper Scope Screen-filling Overlay */}
      {weaponType === 'SNIPER_RIFLE' && aimProgress > 0.95 && (
        <div className="absolute inset-0 bg-black pointer-events-none z-20 flex items-center justify-center">
          {/* Magnified view-port circle */}
          <div 
            className="relative rounded-full aspect-square border-4 border-red-600/80 bg-transparent flex items-center justify-center overflow-hidden shadow-[0_0_50px_rgba(239,68,68,0.3)]"
            style={{ height: '75vh', width: '75vh' }}
          >
            {/* Scope lines overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Vertical scope hair */}
              <div className="absolute w-[1.5px] h-full bg-red-500 opacity-80"></div>
              {/* Horizontal scope hair */}
              <div className="absolute h-[1.5px] w-full bg-red-500 opacity-80"></div>
              {/* Scope circle marks */}
              <div className="absolute w-3/4 h-3/4 rounded-full border border-dashed border-red-500/30"></div>
              <div className="absolute w-1/2 h-1/2 rounded-full border border-red-500/40"></div>
              <div className="absolute w-1/4 h-1/4 rounded-full border border-red-500/60 flex items-center justify-center">
                {/* Micro target red-dot */}
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping" />
              </div>
              
              {/* Scope indicators - Top and Bottom */}
              <div className="absolute bottom-16 text-[11px] font-mono text-red-500 font-bold bg-black/85 border border-red-900 px-3 py-1 rounded-sm tracking-widest uppercase">
                TARGET RANGE FINDER • 100M
              </div>
              <div className="absolute top-16 text-[11px] font-mono text-red-500 font-bold bg-black/85 border border-red-900 px-3 py-1 rounded-sm tracking-widest uppercase">
                INTELLIGENT ZOOM HUD
              </div>
              <div className="absolute right-16 text-[10px] font-mono text-red-500 font-bold bg-black/85 border border-red-900 px-2.5 py-0.5 rounded-sm tracking-wider">
                MAGNIFICATION: 8.0X
              </div>
              <div className="absolute left-16 text-[10px] font-mono text-red-500 font-bold bg-black/85 border border-red-900 px-2.5 py-0.5 rounded-sm tracking-wider">
                MUNITION: .50 BMG CAL
              </div>
            </div>
          </div>

          {/* Left and Right side solid panels to ensure it is fully black outside the circle */}
          <div className="absolute left-0 top-0 h-full w-[calc(50vw-37.5vh)] bg-black"></div>
          <div className="absolute right-0 top-0 h-full w-[calc(50vw-37.5vh)] bg-black"></div>
          <div className="absolute top-0 left-[calc(50vw-37.5vh)] h-[calc(50vh-37.5vh)] w-[75vh] bg-black"></div>
          <div className="absolute bottom-0 left-[calc(50vw-37.5vh)] h-[calc(50vh-37.5vh)] w-[75vh] bg-black"></div>
        </div>
      )}

      {/* 3. Pointer Lock prompt (requires pointer-events-auto so player can click it!) */}
      {!isLocked && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center pointer-events-auto z-30 cyber-scanlines">
          {/* Grid lines overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.01)_1px,_transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="-skew-x-[10deg] bg-neutral-950 border-2 border-red-500/60 p-8 text-center max-w-sm shadow-[0_0_40px_rgba(239,68,68,0.35)] flex flex-col items-center relative"
          >
            {/* Cyber Brackets */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-500" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500" />

            <div className="skew-x-[10deg] flex flex-col items-center">
              <div className="w-16 h-16 rounded-sm bg-red-500/10 flex items-center justify-center mb-5 text-red-500 border border-red-500/30 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <Lock className="w-8 h-8" />
              </div>
              
              <h3 className="text-2xl font-display font-black italic tracking-wider mb-2 text-white uppercase">
                포인터 제어 승인
              </h3>
              <p className="text-xs font-sans text-neutral-400 mb-6 leading-relaxed">
                정밀한 3D 가상 조작 및 실시간 사격 제어를 위해 마우스 포인터를 고정합니다.<br />
                해제 시 <kbd className="bg-neutral-950 border border-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px] font-mono">ESC</kbd> 키를 입력하십시오.
              </p>
              
              <div className="text-sm font-tech font-bold text-red-500 tracking-widest animate-bounce uppercase bg-red-500/10 border border-red-500/20 px-4 py-1.5">
                여기를 클릭하여 교전 개시
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 4. Top Header: Score Board & Round Info */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
        <div className="-skew-x-[12deg] bg-neutral-950/90 border border-neutral-800 rounded-sm px-6 py-2.5 flex items-center gap-6 shadow-[0_0_20px_rgba(0,0,0,0.8)]">
          {/* Player Score */}
          <div className="skew-x-[12deg] flex items-center gap-3">
            <span className="text-[10px] font-display font-bold text-red-400 tracking-widest uppercase">PLAYER</span>
            <span className="text-3xl font-display font-black italic text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">{playerScore}</span>
          </div>

          {/* VS / Round */}
          <div className="skew-x-[12deg] flex flex-col items-center px-4 border-x border-neutral-800">
            <span className="text-[10px] font-mono font-bold text-neutral-500 tracking-widest uppercase">ROUND {round}</span>
            <span className="text-[11px] font-tech font-bold text-yellow-500 tracking-widest uppercase mt-0.5">5선승제</span>
          </div>

          {/* Enemy Score */}
          <div className="skew-x-[12deg] flex items-center gap-3">
            <span className="text-3xl font-display font-black italic text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">{enemyScore}</span>
            <span className="text-[10px] font-display font-bold text-cyan-400 tracking-widest uppercase">ENEMY AI</span>
          </div>
        </div>
      </div>

      {/* 5. Aim Down Sights (ADS) Zooming Overlay */}
      {isAiming && aimProgress < 1.0 && (
        <div 
          className="absolute inset-0 bg-red-950/5 pointer-events-none z-10 border-[12px] border-neutral-950/40 transition-all duration-75"
          style={{ opacity: aimProgress }}
        />
      )}

      {/* 6. Center Screen crosshair / hitmarker (Only show when sniper is NOT fully scoped) */}
      {!(weaponType === 'SNIPER_RIFLE' && aimProgress > 0.95) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10">
          
          {/* Hitmarker (flashing red X) */}
          <AnimatePresence>
            {hitActive && (
              <motion.div
                initial={{ scale: 0.8, opacity: 1 }}
                animate={{ scale: 1.3, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute w-14 h-14 flex items-center justify-center"
              >
                {/* 4 Diagonal ticks with glow */}
                <div className="absolute w-3.5 h-[2px] bg-red-500 shadow-[0_0_4px_#ef4444] rotate-45 translate-x-3.5 -translate-y-3.5"></div>
                <div className="absolute w-3.5 h-[2px] bg-red-500 shadow-[0_0_4px_#ef4444] -rotate-45 -translate-x-3.5 -translate-y-3.5"></div>
                <div className="absolute w-3.5 h-[2px] bg-red-500 shadow-[0_0_4px_#ef4444] -rotate-45 translate-x-3.5 translate-y-3.5"></div>
                <div className="absolute w-3.5 h-[2px] bg-red-500 shadow-[0_0_4px_#ef4444] rotate-45 -translate-x-3.5 translate-y-3.5"></div>
                
                {/* Center dot flashing */}
                <div className="absolute w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"></div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Standard Crosshair lines */}
          <div 
            className="relative flex items-center justify-center transition-all duration-75"
            style={{ width: `${crosshairSize}px`, height: `${crosshairSize}px` }}
          >
            {/* Center dot */}
            <div className="w-1 h-1 bg-green-400 rounded-full shadow-[0_0_3px_#4ade80]"></div>

            {/* Crosshair ticks */}
            {/* Top */}
            <div 
              className="absolute w-[2px] bg-green-400 transition-all duration-75 shadow-[0_0_2px_#4ade80]"
              style={{ 
                height: '7px', 
                bottom: `${crosshairSize / 2}px`,
                opacity: isAiming ? 0.3 : 1
              }}
            ></div>
            {/* Bottom */}
            <div 
              className="absolute w-[2px] bg-green-400 transition-all duration-75 shadow-[0_0_2px_#4ade80]"
              style={{ 
                height: '7px', 
                top: `${crosshairSize / 2}px`,
                opacity: isAiming ? 0.3 : 1
              }}
            ></div>
            {/* Left */}
            <div 
              className="absolute h-[2px] bg-green-400 transition-all duration-75 shadow-[0_0_2px_#4ade80]"
              style={{ 
                width: '7px', 
                right: `${crosshairSize / 2}px`,
                opacity: isAiming ? 0.3 : 1
              }}
            ></div>
            {/* Right */}
            <div 
              className="absolute h-[2px] bg-green-400 transition-all duration-75 shadow-[0_0_2px_#4ade80]"
              style={{ 
                width: '7px', 
                left: `${crosshairSize / 2}px`,
                opacity: isAiming ? 0.3 : 1
              }}
            ></div>
          </div>
        </div>
      )}

      {/* 7. Bottom Left: Health bar and Sliding indicator */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-3.5 z-10">
        
        {/* Sliding Indicator */}
        <AnimatePresence>
          {isSliding && (
            <motion.div
              initial={{ opacity: 0, x: -20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="-skew-x-12 bg-amber-500/20 text-amber-400 border border-amber-500/45 px-3.5 py-2 rounded-sm text-xs font-mono font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.25)] w-max"
            >
              <Zap className="w-4 h-4 animate-bounce skew-x-12" /> 
              <span className="skew-x-12">TACTICAL SLIDE ENABLED (C)</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Health Panel (Skewed & Holographic) */}
        <div className="-skew-x-[15deg] bg-neutral-950/90 border-2 border-red-500/45 p-4 rounded-sm flex items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.8)] w-[280px] relative">
          {/* Custom Brackets */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-red-400" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-red-400" />

          {/* Skew-back inner */}
          <div className="skew-x-[15deg] w-10 h-10 rounded-sm bg-red-500/10 border border-red-500/40 flex items-center justify-center text-red-500 flex-shrink-0 shadow-[0_0_10px_rgba(239,68,68,0.15)]">
            <Shield className="w-5 h-5 animate-pulse" />
          </div>
          
          <div className="skew-x-[15deg] flex-1 space-y-1.5">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-mono text-neutral-400 font-bold tracking-widest">HP CONTROLLER</span>
              <span className={`font-display text-xl font-black italic ${playerHP < 50 ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]' : 'text-neutral-100'}`}>
                {playerHP} <span className="text-xs text-neutral-500 font-normal">/ {maxHP}</span>
              </span>
            </div>
            
            {/* Skewed Progress Bar */}
            <div className="h-2.5 w-full bg-neutral-900 border border-neutral-800 rounded-sm overflow-hidden -skew-x-12">
              <div 
                className={`h-full transition-all duration-300 ${
                  playerHP < 50 
                    ? 'bg-gradient-to-r from-red-600 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' 
                    : 'bg-gradient-to-r from-emerald-500 to-green-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                }`}
                style={{ width: `${hpPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* 8. Bottom Right: Ammo & Reload indicators */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3.5 z-10">
        
        {/* Reloading Overlay */}
        <AnimatePresence>
          {isReloading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="-skew-x-12 bg-red-950/45 border border-red-500/45 text-red-400 px-4 py-2 rounded-sm text-xs font-mono font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.25)]"
            >
              <RefreshCw className="w-4 h-4 animate-spin skew-x-12" /> 
              <span className="skew-x-12">TACTICAL RELOADING... ({Math.floor(reloadProgress * 100)}%)</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ammo Panel (Skewed & Holographic) */}
        <div className="-skew-x-[15deg] bg-neutral-950/90 border-2 border-yellow-500/45 p-4 rounded-sm flex items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.8)] w-[240px] relative">
          {/* Custom Brackets */}
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-yellow-400" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-yellow-400" />

          <div className="skew-x-[15deg] flex-1 text-right space-y-0.5">
            <span className="text-[10px] font-mono text-neutral-400 font-bold tracking-widest block uppercase">
              {weaponConfig.nameKo}
            </span>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className={`text-4xl font-display font-black italic tracking-tighter ${ammo === 0 ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]' : 'text-neutral-100'}`}>
                {ammo}
              </span>
              <span className="text-neutral-700 text-lg font-mono">/</span>
              <span className="text-neutral-400 text-sm font-mono font-bold">
                {maxAmmo}
              </span>
            </div>
          </div>
          
          <div className="skew-x-[15deg] w-12 h-12 rounded-sm bg-yellow-500/10 border border-yellow-500/40 flex items-center justify-center text-yellow-500 flex-shrink-0 shadow-[0_0_10px_rgba(234,179,8,0.15)]">
            <Crosshair className="w-6 h-6 animate-pulse" />
          </div>
        </div>
      </div>

      {/* 9. Top-Left Controls HUD Toggle */}
      <div className="absolute top-4 left-4 flex gap-2 z-10 pointer-events-auto">
        <button
          onClick={onExitGame}
          className="-skew-x-12 bg-neutral-950 border border-neutral-800 hover:border-red-500/50 px-3.5 py-2 rounded-sm text-[10px] font-tech font-bold text-neutral-400 hover:text-red-400 transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
        >
          <span className="skew-x-12 uppercase tracking-widest">교전 이탈 // EXIT GAME</span>
        </button>
      </div>

      {/* 10. Sliding status pill bottom-center */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div className="-skew-x-12 bg-neutral-950/70 backdrop-blur-md border border-neutral-800/80 px-5 py-2 rounded-sm flex items-center gap-4 shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
          <div className="skew-x-12 flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
            <kbd className="bg-neutral-900 border border-neutral-800 text-orange-400 px-1.5 py-0.2 rounded-sm font-black text-[9px]">C</kbd>
            <span className="font-bold tracking-wider uppercase">기동슬라이딩</span>
          </div>
          <div className="w-[1px] h-3 bg-neutral-800"></div>
          <div className="skew-x-12 flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
            <kbd className="bg-neutral-900 border border-neutral-800 text-orange-400 px-1.5 py-0.2 rounded-sm font-black text-[9px]">R</kbd>
            <span className="font-bold tracking-wider uppercase">탄재장전</span>
          </div>
          <div className="w-[1px] h-3 bg-neutral-800"></div>
          <div className="skew-x-12 flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
            <kbd className="bg-neutral-900 border border-neutral-800 text-orange-400 px-1.5 py-0.2 rounded-sm font-black text-[9px]">우클릭</kbd>
            <span className="font-bold tracking-wider uppercase">정밀정조준</span>
          </div>
        </div>
      </div>

      {/* 11. Red screen borders overlay when very low HP */}
      {playerHP <= 45 && (
        <div className="absolute inset-0 border-[8px] border-red-600/40 animate-pulse pointer-events-none z-15 shadow-[inset_0_0_40px_rgba(239,68,68,0.4)]" />
      )}
    </div>
  );
}
