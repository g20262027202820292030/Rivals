import React, { useState } from 'react';
import { GameState, MapType, WeaponType } from './types';
import MainMenu from './components/MainMenu';
import WeaponSelector from './components/WeaponSelector';
import GameHUD from './components/GameHUD';
import ThreeGame from './components/ThreeGame';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ShieldAlert, Award, Swords, ArrowRight, RotateCcw } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    stage: 'MENU',
    selectedMap: 'ARENA',
    playerScore: 0,
    enemyScore: 0,
    currentRound: 1,
    playerWeapon: null,
    roundWinner: null,
    matchWinner: null,
  });

  // Track the actual running gameplay variables from ThreeGame to feed into GameHUD
  const [hudStats, setHudStats] = useState({
    playerHP: 150,
    ammo: 20,
    maxAmmo: 20,
    isAiming: false,
    aimProgress: 0,
    isReloading: false,
    reloadProgress: 0,
    hitActive: false,
    damageFlashActive: false,
    isSliding: false,
    isSlideCooldown: false,
    primaryWeapon: 'ASSAULT_RIFLE' as WeaponType,
  });

  const [isLocked, setIsLocked] = useState(false);

  const startNewGame = (map: MapType) => {
    setGameState({
      stage: 'WEAPON_SELECT',
      selectedMap: map,
      playerScore: 0,
      enemyScore: 0,
      currentRound: 1,
      playerWeapon: null,
      roundWinner: null,
      matchWinner: null,
    });
  };

  const handleWeaponSelect = (weapon: WeaponType) => {
    setGameState((prev) => ({
      ...prev,
      playerWeapon: weapon,
      stage: 'PLAYING',
    }));
  };

  const handleRoundComplete = (winner: 'PLAYER' | 'ENEMY') => {
    // Unlock mouse cursor when round completes
    document.exitPointerLock?.();

    setGameState((prev) => {
      const nextPlayerScore = winner === 'PLAYER' ? prev.playerScore + 1 : prev.playerScore;
      const nextEnemyScore = winner === 'ENEMY' ? prev.enemyScore + 1 : prev.enemyScore;
      const isMatchOver = nextPlayerScore >= 5 || nextEnemyScore >= 5;

      return {
        ...prev,
        playerScore: nextPlayerScore,
        enemyScore: nextEnemyScore,
        roundWinner: winner,
        stage: isMatchOver ? 'MATCH_END' : 'ROUND_END',
        matchWinner: isMatchOver ? (nextPlayerScore >= 5 ? 'PLAYER' : 'ENEMY') : null,
      };
    });
  };

  const proceedToNextRound = () => {
    setGameState((prev) => ({
      ...prev,
      currentRound: prev.currentRound + 1,
      playerWeapon: null,
      roundWinner: null,
      stage: 'WEAPON_SELECT',
    }));
  };

  const handleExitToMenu = () => {
    document.exitPointerLock?.();
    setGameState({
      stage: 'MENU',
      selectedMap: 'ARENA',
      playerScore: 0,
      enemyScore: 0,
      currentRound: 1,
      playerWeapon: null,
      roundWinner: null,
      matchWinner: null,
    });
  };

  return (
    <div id="game-app-root" className="relative w-screen h-screen overflow-hidden bg-black text-white select-none">
      
      {/* Stage: MAIN MENU */}
      {gameState.stage === 'MENU' && (
        <MainMenu onStartGame={startNewGame} />
      )}

      {/* Stage: WEAPON SELECTION OVERLAY */}
      {gameState.stage === 'WEAPON_SELECT' && (
        <WeaponSelector
          round={gameState.currentRound}
          playerScore={gameState.playerScore}
          enemyScore={gameState.enemyScore}
          onSelect={handleWeaponSelect}
        />
      )}

      {/* Stage: ACTIVE PLAYING */}
      {gameState.stage === 'PLAYING' && gameState.playerWeapon && (
        <div className="absolute inset-0 w-full h-full">
          <ThreeGame
            mapType={gameState.selectedMap}
            weaponType={gameState.playerWeapon}
            round={gameState.currentRound}
            onRoundComplete={handleRoundComplete}
            isLocked={isLocked}
            setIsLocked={setIsLocked}
            updateHUD={setHudStats}
            onWeaponChange={(weapon) => {
              setGameState((prev) => ({
                ...prev,
                playerWeapon: weapon,
              }));
            }}
          />

          <GameHUD
            playerHP={hudStats.playerHP}
            maxHP={150}
            ammo={hudStats.ammo}
            maxAmmo={hudStats.maxAmmo}
            weaponType={gameState.playerWeapon}
            primaryWeapon={hudStats.primaryWeapon}
            isAiming={hudStats.isAiming}
            aimProgress={hudStats.aimProgress}
            isReloading={hudStats.isReloading}
            reloadProgress={hudStats.reloadProgress}
            playerScore={gameState.playerScore}
            enemyScore={gameState.enemyScore}
            round={gameState.currentRound}
            hitActive={hudStats.hitActive}
            damageFlashActive={hudStats.damageFlashActive}
            isSliding={hudStats.isSliding}
            isSlideCooldown={hudStats.isSlideCooldown}
            isLocked={isLocked}
            onExitGame={handleExitToMenu}
          />
        </div>
      )}

      {/* Stage: INTERMEDIATE ROUND END OVERLAY */}
      <AnimatePresence>
        {gameState.stage === 'ROUND_END' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(35,12,12,0.85)_0%,_rgba(5,5,5,1)_100%)] backdrop-blur-md cyber-scanlines"
          >
            {/* Grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.012)_1px,_transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 120 }}
              className="-skew-x-[10deg] border-2 border-red-500/40 bg-neutral-950/95 p-8 max-w-md w-full relative shadow-[0_0_40px_rgba(239,68,68,0.3)]"
            >
              {/* Cyber Brackets */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-red-500" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-red-500" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-red-500" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-red-500" />
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-orange-500"></div>
              
              {/* Skew-back inner */}
              <div className="skew-x-[10deg] text-center flex flex-col items-center">
                <span className="text-xs font-mono text-orange-400/80 tracking-[0.25em] uppercase block mb-3 font-bold">
                  TACTICAL FEEDBACK // ROUND {gameState.currentRound} COMPLETED
                </span>

                {gameState.roundWinner === 'PLAYER' ? (
                  <div className="text-emerald-400 flex flex-col items-center">
                    <div className="w-16 h-16 rounded-sm bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 mb-4 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                      <Award className="w-8 h-8 animate-bounce" />
                    </div>
                    <h2 className="text-4xl font-display font-black italic uppercase tracking-tighter mb-2">
                      라운드 승리!
                    </h2>
                    <p className="text-xs font-sans text-neutral-400 mb-6 max-w-xs leading-relaxed">
                      모든 적 인공지능 요원을 성공적으로 무력화시켰습니다. 완벽한 전술 기동이었습니다.
                    </p>
                  </div>
                ) : (
                  <div className="text-red-500 flex flex-col items-center">
                    <div className="w-16 h-16 rounded-sm bg-red-500/10 flex items-center justify-center border border-red-500/30 mb-4 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse">
                      <ShieldAlert className="w-8 h-8" />
                    </div>
                    <h2 className="text-4xl font-display font-black italic uppercase tracking-tighter mb-2">
                      라운드 패배
                    </h2>
                    <p className="text-xs font-sans text-neutral-400 mb-6 max-w-xs leading-relaxed">
                      경고: 플레이어 전사. 다음 세트 대기단계에서 저격과 무기 사거리를 보완하여 교전을 리드하십시오.
                    </p>
                  </div>
                )}

                {/* Score breakdown bar */}
                <div className="bg-neutral-950 border border-neutral-900 rounded-sm p-4 mb-8 w-full">
                  <div className="text-[10px] font-mono text-neutral-500 font-bold tracking-widest mb-3 uppercase">현재 누적 세트 스코어</div>
                  <div className="flex items-center justify-between text-xl font-mono font-black px-4">
                    <div className="flex flex-col items-start">
                      <span className="text-[10px] text-red-400 font-bold tracking-widest uppercase">PLAYER</span>
                      <span className="text-3xl text-red-500 font-display font-black italic drop-shadow-[0_0_3px_rgba(239,68,68,0.4)]">{gameState.playerScore}</span>
                    </div>
                    <div className="text-neutral-800 font-light text-2xl">:</div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">ENEMY AI</span>
                      <span className="text-3xl text-cyan-400 font-display font-black italic drop-shadow-[0_0_3px_rgba(6,182,212,0.4)]">{gameState.enemyScore}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={proceedToNextRound}
                  className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 -skew-x-6 hover:skew-x-0 font-display font-black italic text-sm tracking-widest flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(239,68,68,0.3)] text-white uppercase transition-all hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]"
                >
                  <span className="skew-x-6 hover:skew-x-0 transition-transform flex items-center gap-2">
                    다음 라운드 전술 수립 <ArrowRight className="w-4 h-4" />
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stage: FINAL MATCH COMPLETE OVERLAY */}
      <AnimatePresence>
        {gameState.stage === 'MATCH_END' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(35,12,12,0.9)_0%,_rgba(5,5,5,1)_100%)] backdrop-blur-md cyber-scanlines"
          >
            {/* Grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.015)_1px,_transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring' }}
              className="-skew-x-[10deg] border-2 border-red-500/50 bg-neutral-950/95 p-10 max-w-lg w-full relative shadow-[0_0_50px_rgba(239,68,68,0.4)] flex flex-col items-center"
            >
              {/* Cyber Brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-500" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500" />
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500"></div>

              {/* Skew-back inner */}
              <div className="skew-x-[10deg] text-center flex flex-col items-center w-full">
                {gameState.matchWinner === 'PLAYER' ? (
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-sm bg-yellow-500/10 flex items-center justify-center border border-yellow-500/30 mb-6 text-yellow-400 shadow-[0_0_30px_rgba(234,179,8,0.2)] animate-pulse">
                      <Trophy className="w-10 h-10" />
                    </div>
                    <h1 className="text-5xl md:text-6xl font-display font-black italic bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-orange-400 to-amber-500 uppercase tracking-tighter mb-3 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                      최종 매치 우승!
                    </h1>
                    <p className="text-neutral-400 text-xs font-sans max-w-sm mb-8 leading-relaxed">
                      로블록스 Rivals 최고의 에이전트 탄생! 무자비하게 몰아치는 정밀 인공지능 요원들의 집요한 공세를 격파하고 최종 승리의 자격을 입증했습니다.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-sm bg-red-500/10 flex items-center justify-center border border-red-500/30 mb-6 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-pulse">
                      <ShieldAlert className="w-10 h-10" />
                    </div>
                    <h1 className="text-5xl md:text-6xl font-display font-black italic bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-orange-500 to-yellow-400 uppercase tracking-tighter mb-3 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                      최종 매치 패배
                    </h1>
                    <p className="text-neutral-400 text-xs font-sans max-w-sm mb-8 leading-relaxed">
                      경고: 적 AI 에이전트들이 먼저 5선승을 획득했습니다. 슬라이딩 속도와 정조준 엄폐 기동을 개선하고 전장 전술을 보완하여 재도전하십시오.
                    </p>
                  </div>
                )}

                {/* Scoreboard block */}
                <div className="w-full bg-neutral-950 border border-neutral-900 rounded-sm p-6 mb-8 max-w-sm">
                  <div className="text-[10px] font-mono text-neutral-500 font-bold tracking-widest mb-4 uppercase">최종 세트 완결 통계</div>
                  <div className="grid grid-cols-3 items-center">
                    <div className="text-center">
                      <div className="text-[10px] text-red-400 font-mono font-bold tracking-widest uppercase mb-1.5">PLAYER</div>
                      <div className="text-4xl font-display font-black italic text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.4)]">{gameState.playerScore}</div>
                    </div>
                    <div className="text-neutral-800 text-3xl font-light font-mono">:</div>
                    <div className="text-center">
                      <div className="text-[10px] text-cyan-400 font-mono font-bold tracking-widest uppercase mb-1.5">ENEMY AI</div>
                      <div className="text-4xl font-display font-black italic text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.4)]">{gameState.enemyScore}</div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-4 w-full">
                  <button
                    onClick={() => startNewGame(gameState.selectedMap)}
                    className="flex-1 py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 -skew-x-6 hover:skew-x-0 transition-all font-display font-black italic text-sm tracking-widest flex items-center justify-center gap-2 cursor-pointer text-white uppercase shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_rgba(249,115,22,0.4)]"
                  >
                    <span className="skew-x-6 hover:skew-x-0 transition-transform flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" /> 다시 시작 (RETRY)
                    </span>
                  </button>
                  <button
                    onClick={handleExitToMenu}
                    className="flex-1 py-4 bg-neutral-950 border-2 border-neutral-850 hover:border-white text-neutral-400 hover:text-white -skew-x-6 hover:skew-x-0 transition-all font-display font-black italic text-sm tracking-widest flex items-center justify-center gap-2 cursor-pointer uppercase"
                  >
                    <span className="skew-x-6 hover:skew-x-0 transition-transform flex items-center gap-2">
                      <Swords className="w-4 h-4" /> 통제실로 (MENU)
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
