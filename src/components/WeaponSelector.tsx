import React from 'react';
import { WeaponType, WEAPON_CONFIGS } from '../types';
import { Crosshair, Swords, Eye, Zap, Shield, Target } from 'lucide-react';
import { motion } from 'motion/react';

interface WeaponSelectorProps {
  round: number;
  playerScore: number;
  enemyScore: number;
  onSelect: (weapon: WeaponType) => void;
}

export default function WeaponSelector({ round, playerScore, enemyScore, onSelect }: WeaponSelectorProps) {
  const [hoveredWeapon, setHoveredWeapon] = React.useState<WeaponType | null>(null);

  const configs = [
    {
      type: 'ASSAULT_RIFLE' as WeaponType,
      config: WEAPON_CONFIGS.ASSAULT_RIFLE,
      desc: '우수한 자동 연사성능과 조절이 용이한 탄퍼짐을 지원하는 돌격 자동 소총. 중근거리 전술 제압 사격에 적합합니다.',
      stats: [
        { label: '화력 (DAMAGE)', val: '12 / 발', bar: 12 / 50 },
        { label: '탄 소지한도 (CAPACITY)', val: '20발', bar: 20 / 20 },
        { label: '연사 비율 (FIRE RATE)', val: '매우 빠름 (Auto)', bar: 0.9 },
        { label: '정조준 속도 (ADS)', val: '0.7초', bar: 1 - 0.7 / 1.5 },
        { label: '기동성 오차 (SPREAD)', val: '2도 (밀착형)', bar: 1 - 2 / 10 },
      ],
      color: 'from-red-500 to-orange-600',
      glowColor: 'rgba(239, 68, 68, 0.45)',
      badgeColor: 'bg-red-950/40 text-red-400 border-red-500/30',
      accentColor: 'text-red-500',
      icon: <Swords className="w-5 h-5 text-red-500 filter drop-shadow-[0_0_3px_rgba(239,68,68,0.5)]" />,
    },
    {
      type: 'SNIPER_RIFLE' as WeaponType,
      config: WEAPON_CONFIGS.SNIPER_RIFLE,
      desc: '극도의 초고배율 줌 렌즈와 치명적인 단발 위력을 장착한 정밀 저격 소총. 원거리 표적을 1격에 침묵시킵니다.',
      stats: [
        { label: '화력 (DAMAGE)', val: '50 / 발', bar: 50 / 50 },
        { label: '탄 소지한도 (CAPACITY)', val: '4발', bar: 4 / 20 },
        { label: '연사 비율 (FIRE RATE)', val: '느림 (Bolt-action)', bar: 0.2 },
        { label: '정조준 속도 (ADS)', val: '1.1초', bar: 1 - 1.1 / 1.5 },
        { label: '기동성 오차 (SPREAD)', val: '10도 (지향불가)', bar: 1 - 10 / 10 },
      ],
      color: 'from-cyan-500 to-blue-600',
      glowColor: 'rgba(6, 182, 212, 0.45)',
      badgeColor: 'bg-cyan-950/40 text-cyan-400 border-cyan-500/30',
      accentColor: 'text-cyan-400',
      icon: <Eye className="w-5 h-5 text-cyan-400 filter drop-shadow-[0_0_3px_rgba(6,182,212,0.5)]" />,
    },
    {
      type: 'RPG' as WeaponType,
      config: WEAPON_CONFIGS.RPG,
      desc: '강력한 폭발 피해를 입히는 로켓 발사기입니다. 직격 시 100, 스플래시로 50의 데미지를 줍니다.',
      stats: [
        { label: '화력 (DAMAGE)', val: '100 / 50', bar: 1.0 },
        { label: '탄 소지한도 (CAPACITY)', val: '1발 (Single)', bar: 0.1 },
        { label: '정조준 속도 (ADS)', val: '0.4초', bar: 1 - 0.4 / 1.5 },
        { label: '기동성 (MOBILITY)', val: '-15%', bar: 0.3 },
      ],
      color: 'from-purple-500 to-fuchsia-600',
      glowColor: 'rgba(168, 85, 247, 0.45)',
      badgeColor: 'bg-purple-950/40 text-purple-400 border-purple-500/30',
      accentColor: 'text-purple-400',
      icon: <Zap className="w-5 h-5 text-purple-400 filter drop-shadow-[0_0_3px_rgba(168,85,247,0.5)]" />,
    },
  ];

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(35,12,12,0.85)_0%,_rgba(5,5,5,1)_100%)] text-white p-6 font-sans select-none cyber-scanlines">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.012)_1px,_transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Score and Round Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 z-10"
      >
        <div className="text-xs font-mono text-orange-400/80 tracking-[0.25em] uppercase mb-3 font-bold">
          TACTICAL LOADOUT SELECTION // ROUND {round}
        </div>
        
        <div className="flex items-center justify-center gap-8 text-2xl font-black font-mono tracking-wider -skew-x-6">
          <div className="flex flex-col items-center bg-neutral-950/90 border border-red-500/20 px-6 py-2.5 shadow-[0_0_15px_rgba(239,68,68,0.1)] relative">
            <div className="absolute top-0 left-0 w-2 h-1 bg-red-500" />
            <span className="text-[10px] text-red-400 font-bold tracking-widest uppercase mb-1">PLAYER</span>
            <span className="text-4xl text-red-500 font-black italic drop-shadow-[0_0_5px_rgba(239,68,68,0.4)]">{playerScore}</span>
          </div>
          
          <div className="text-neutral-600 font-light text-3xl">:</div>
          
          <div className="flex flex-col items-center bg-neutral-950/90 border border-cyan-500/20 px-6 py-2.5 shadow-[0_0_15px_rgba(6,182,212,0.1)] relative">
            <div className="absolute top-0 right-0 w-2 h-1 bg-cyan-500" />
            <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase mb-1">ENEMY AI</span>
            <span className="text-4xl text-cyan-400 font-black italic drop-shadow-[0_0_5px_rgba(6,182,212,0.4)]">{enemyScore}</span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs text-yellow-500 font-tech font-bold mt-5 uppercase tracking-wider bg-yellow-500/10 border border-yellow-500/20 px-3.5 py-1 rounded-sm">
          <Target className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
          <span>목표: 적군보다 먼저 5선승을 쟁취하여 교전을 승리하십시오!</span>
        </div>
      </motion.div>

      {/* Weapon Cards Grid */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch z-10">
        {configs.map((item, idx) => {
          const isHovered = hoveredWeapon === item.type;
          return (
            <motion.div
              key={item.type}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.15 }}
              onMouseEnter={() => setHoveredWeapon(item.type)}
              onMouseLeave={() => setHoveredWeapon(null)}
              onClick={() => onSelect(item.type)}
              className={`cursor-pointer -skew-x-[10deg] border bg-neutral-950/90 p-6 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group ${
                isHovered
                  ? 'border-white/40 scale-[1.01]'
                  : 'border-neutral-800/80 hover:border-neutral-700'
              }`}
              style={{
                boxShadow: isHovered ? `0 0 35px ${item.glowColor}` : '0 10px 30px rgba(0,0,0,0.6)',
              }}
            >
              {/* Tactical Corners */}
              <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-neutral-700 group-hover:border-white transition-colors" />
              <div className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-neutral-700 group-hover:border-white transition-colors" />
              <div className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-neutral-700 group-hover:border-white transition-colors" />
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-neutral-700 group-hover:border-white transition-colors" />

              {/* Glowing Top Colored Bar */}
              <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${item.color}`} />

              {/* Content Wrapper (Skewed back so text is straight) */}
              <div className="skew-x-[10deg] h-full flex flex-col justify-between">
                
                <div>
                  {/* Badge & Technical Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[9px] font-mono tracking-widest uppercase px-2.5 py-0.5 rounded-sm border ${item.badgeColor} font-bold`}>
                      {item.type === 'ASSAULT_RIFLE' ? 'AUTOMATIC ENGAGEMENT' : 'HIGH DAMAGE TACTICAL'}
                    </span>
                    {item.icon}
                  </div>

                  {/* Weapon Name */}
                  <h3 className="text-3xl font-display font-black italic tracking-tight mb-2 group-hover:text-yellow-400 transition-colors uppercase">
                    {item.config.nameKo}
                    <span className="text-[11px] block text-neutral-500 font-mono font-normal mt-1 uppercase tracking-wider">
                      {item.config.name} // CALIBER SPECIFIED
                    </span>
                  </h3>

                  {/* Weapon Description */}
                  <p className="text-xs text-neutral-400 font-sans leading-relaxed mb-6">
                    {item.desc}
                  </p>

                  {/* Skewed Stats Bars */}
                  <div className="space-y-3.5">
                    {item.stats.map((stat, sIdx) => (
                      <div key={sIdx} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-neutral-500 font-bold uppercase">{stat.label}</span>
                          <span className="text-neutral-100 font-black">{stat.val}</span>
                        </div>
                        
                        {/* Skewed Tech Progress Bar Container */}
                        <div className="h-2 w-full bg-neutral-900 border border-neutral-850 overflow-hidden -skew-x-12">
                          <div 
                            className={`h-full bg-gradient-to-r ${item.color} transition-all duration-700`}
                            style={{ 
                              width: `${stat.bar * 100}%`,
                              filter: isHovered ? 'drop-shadow(0 0 5px rgba(255,255,255,0.3))' : 'none',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selection Action Button */}
                <div className="mt-8 pt-4 border-t border-neutral-900">
                  <div className={`w-full py-3.5 -skew-x-6 group-hover:skew-x-0 font-display font-black italic text-sm tracking-widest text-center transition-all border uppercase cursor-pointer ${
                    isHovered
                      ? `bg-gradient-to-r ${item.color} text-white border-transparent shadow-[0_0_15px_rgba(255,255,255,0.2)]`
                      : 'bg-neutral-950/70 text-neutral-500 border-neutral-850 hover:border-neutral-700'
                  }`}>
                    <span className="inline-block skew-x-6 group-hover:skew-x-0 transition-transform">
                      {item.config.nameKo} 장비 승인 (SELECT WEAPON)
                    </span>
                  </div>
                </div>

              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Selector footer info */}
      <div className="mt-10 text-[11px] text-neutral-600 font-mono text-center flex items-center gap-2 z-10 uppercase tracking-widest">
        <Crosshair className="w-4 h-4 text-orange-500/40 animate-pulse" /> 
        <span>전장에 배치되면 즉시 우클릭(Hold)으로 정조준하여 정밀 사격을 실행하십시오.</span>
      </div>
    </div>
  );
}
