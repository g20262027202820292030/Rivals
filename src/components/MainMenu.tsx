import React from 'react';
import { MapType } from '../types';
import { Play, Swords, Shield, Keyboard, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface MainMenuProps {
  onStartGame: (map: MapType) => void;
}

export default function MainMenu({ onStartGame }: MainMenuProps) {
  const [selectedMap, setSelectedMap] = React.useState<MapType>('ARENA');

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(35,12,12,0.8)_0%,_rgba(5,5,5,1)_100%)] text-white p-6 overflow-y-auto select-none font-sans cyber-scanlines">
      
      {/* Decorative cyber grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.015)_1px,_transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Title logo area */}
      <motion.div 
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="text-center mb-10 z-10"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-950/60 border border-red-500/30 text-red-400 rounded-sm text-xs font-mono tracking-widest uppercase mb-4 shadow-[0_0_15px_rgba(239,68,68,0.15)] -skew-x-12">
          <Zap className="w-3.5 h-3.5 animate-pulse" /> 
          <span className="skew-x-12">TACTICAL NEON PVE COMBAT ENGAGEMENT</span>
        </div>
        
        <h1 className="text-7xl md:text-9xl font-display font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-yellow-400 uppercase drop-shadow-[0_0_25px_rgba(239,68,68,0.7)] select-none">
          RIVALS 3D
        </h1>
        
        <p className="text-orange-400/80 font-tech font-bold text-sm md:text-base tracking-[0.25em] mt-3 uppercase">
          AI 봇을 상대로 5선승제의 전장과 아레나를 지배하라
        </p>
      </motion.div>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch z-10 pb-6">
        
        {/* Left Side: Map Selection */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="-skew-x-[10deg] border border-red-900/30 bg-neutral-950/85 p-6 flex flex-col justify-between shadow-[0_0_30px_rgba(0,0,0,0.8)] relative"
        >
          {/* Cybernetic Corner Brackets */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-red-500" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-red-500" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-red-500" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-red-500" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-red-500/20" />

          <div className="skew-x-[10deg] space-y-6">
            <h2 className="text-xl font-display font-black italic tracking-wider text-white flex items-center gap-2.5 uppercase border-b border-red-950/60 pb-3">
              <Swords className="w-5 h-5 text-red-500 filter drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" /> 
              <span>맵 선택 / MAP SELECTION</span>
            </h2>
            
            <div className="space-y-4">
              
              {/* Arena Option */}
              <button
                onClick={() => setSelectedMap('ARENA')}
                className={`w-full text-left p-4 transition-all border relative overflow-hidden group -skew-x-6 cursor-pointer ${
                  selectedMap === 'ARENA'
                    ? 'bg-red-950/40 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                    : 'bg-neutral-900/30 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="skew-x-6">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-xl rounded-full group-hover:bg-red-500/15 transition-all"></div>
                  <div className="font-tech font-bold text-lg flex items-center justify-between">
                    <span>아레나 (ARENA)</span>
                    {selectedMap === 'ARENA' && (
                      <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 tracking-widest uppercase">SELECTED</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 font-sans mt-2 leading-relaxed">
                    황금빛 모래와 대리석 기둥, 상자 장애물이 있는 원형 아레나. 근접 기동 및 빠른 연사 무기의 전술적 대치에 특화되어 있습니다.
                  </p>
                </div>
              </button>

              {/* Battlefield Option */}
              <button
                onClick={() => setSelectedMap('BATTLEFIELD')}
                className={`w-full text-left p-4 transition-all border relative overflow-hidden group -skew-x-6 cursor-pointer ${
                  selectedMap === 'BATTLEFIELD'
                    ? 'bg-red-950/40 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                    : 'bg-neutral-900/30 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="skew-x-6">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 blur-xl rounded-full group-hover:bg-orange-500/15 transition-all"></div>
                  <div className="font-tech font-bold text-lg flex items-center justify-between">
                    <span>전장 (BATTLEFIELD)</span>
                    {selectedMap === 'BATTLEFIELD' && (
                      <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 tracking-widest uppercase">SELECTED</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 font-sans mt-2 leading-relaxed">
                    전술 보호벽과 파괴된 무기 적재함 등 다양한 구조물들이 배치된 넓은 전장. 저격수들의 시야 확보 및 장거리 정밀 조준에 매우 유리합니다.
                  </p>
                </div>
              </button>

            </div>
          </div>

          <div className="skew-x-[10deg] mt-8">
            <button
              onClick={() => onStartGame(selectedMap)}
              className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 -skew-x-6 hover:skew-x-0 font-display font-black italic text-lg tracking-widest text-white shadow-[0_0_25px_rgba(239,68,68,0.45)] hover:shadow-[0_0_40px_rgba(249,115,22,0.6)] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 cursor-pointer uppercase"
            >
              <Play className="w-5 h-5 fill-current animate-pulse" /> 
              <span>전장 진입 / PLAY NOW</span>
            </button>
          </div>
        </motion.div>

        {/* Right Side: Instructions & Info */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="-skew-x-[10deg] border border-red-900/30 bg-neutral-950/85 p-6 flex flex-col justify-between shadow-[0_0_30px_rgba(0,0,0,0.8)] relative"
        >
          {/* Cybernetic Corner Brackets */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-red-500" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-red-500" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-red-500" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-red-500" />
          <div className="absolute top-0 right-1/2 translate-x-1/2 w-12 h-1 bg-red-500/20" />

          <div className="skew-x-[10deg]">
            <h2 className="text-xl font-display font-black italic tracking-wider text-white flex items-center gap-2.5 uppercase border-b border-red-950/60 pb-3">
              <Keyboard className="w-5 h-5 text-red-500 filter drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" /> 
              <span>전술 정보통제실 / CONTROLS</span>
            </h2>
            
            <div className="space-y-2.5 font-mono text-xs text-neutral-400 mt-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                <span className="text-neutral-300 font-tech">이동 (MOVE)</span>
                <span className="bg-neutral-900 border border-neutral-800 text-orange-400 px-2 py-0.5 text-[10px] font-bold">W, A, S, D</span>
              </div>
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                <span className="text-neutral-300 font-tech">점프 (JUMP)</span>
                <span className="bg-neutral-900 border border-neutral-800 text-orange-400 px-2 py-0.5 text-[10px] font-bold">SPACE / Q</span>
              </div>
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                <span className="text-neutral-300 font-tech">슬라이딩 기동 (SLIDE)</span>
                <span className="bg-neutral-900 border border-neutral-800 text-orange-400 px-2 py-0.5 text-[10px] font-bold">C (기동 중 점프 부스트)</span>
              </div>
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                <span className="text-neutral-300 font-tech">탄창 장전 (RELOAD)</span>
                <span className="bg-neutral-900 border border-neutral-800 text-orange-400 px-2 py-0.5 text-[10px] font-bold">R</span>
              </div>
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                <span className="text-neutral-300 font-tech">조준사격 (ADS / ZOOM)</span>
                <span className="bg-neutral-900 border border-neutral-800 text-orange-400 px-2 py-0.5 text-[10px] font-bold">우클릭 (HOLD)</span>
              </div>
              <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                <span className="text-neutral-300 font-tech">무장 사격 (SHOOT)</span>
                <span className="bg-neutral-900 border border-neutral-800 text-red-500 px-2 py-0.5 text-[10px] font-bold animate-pulse">좌클릭 (CLICK)</span>
              </div>
            </div>

            <div className="mt-5 p-3.5 bg-red-950/20 border border-red-950/60 rounded-sm space-y-1.5">
              <h3 className="text-xs font-display font-black text-red-400 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" /> 
                <span>전투 스펙 가이드 / SPECS</span>
              </h3>
              <ul className="list-none text-[11px] text-neutral-400 space-y-1 font-mono">
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-red-500 rounded-full" />
                  <span>초기 체력 한도: <strong className="text-white">150 HP</strong> (공통 사양)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-red-500 rounded-full" />
                  <span><strong className="text-red-400">돌격소총</strong>: 20발, 발당 12dmg, 정조준 0.7s, 탄퍼짐 2.0° → 0.1°</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-red-500 rounded-full" />
                  <span><strong className="text-orange-400">저격소총</strong>: 4발, 발당 50dmg, 정조준 1.1s, 탄퍼짐 10.0° → 0.1°</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-red-500 rounded-full" />
                  <span>매 라운드 전술 수립 시 무기 자유 교체, <strong className="text-yellow-400">5선승제</strong> 매치</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="skew-x-[10deg] mt-6 text-center text-[10px] text-neutral-500 font-mono leading-relaxed border-t border-neutral-900 pt-3">
            ※ 3D 가상 공간 렌더링에 필요한 마우스 제어를 위해 화면 중앙을 클릭하여 포인터를 인앱 고정하십시오. <kbd className="bg-neutral-900 border border-neutral-800 px-1 py-0.2 rounded text-neutral-400">ESC</kbd> 키로 해제할 수 있습니다.
          </div>
        </motion.div>

      </div>

      {/* Footer credits */}
      <div className="mt-8 text-[11px] text-neutral-600 font-mono tracking-[0.2em] uppercase z-10 flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500/30 animate-pulse rounded-full" />
        RIVALS 3D FPS SYSTEMS • OPERATIONAL SECURE CHANNEL
      </div>
    </div>
  );
}

