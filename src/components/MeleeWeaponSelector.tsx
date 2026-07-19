import React from 'react';
import { MeleeWeaponType } from '../types';
import { Swords, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface MeleeWeaponSelectorProps {
  round: number;
  onSelect: (weapon: MeleeWeaponType) => void;
}

export default function MeleeWeaponSelector({ round, onSelect }: MeleeWeaponSelectorProps) {
  const meleeOptions = [
    {
      type: 'FIST' as MeleeWeaponType,
      nameKo: '주먹',
      desc: '기본적인 근접 공격 수단입니다.',
      icon: <Swords className="w-8 h-8 text-neutral-400" />,
      color: 'from-neutral-700 to-neutral-900',
    },
    {
      type: 'SCYTHE' as MeleeWeaponType,
      nameKo: '낫',
      desc: '범위 공격이 가능하며 특수 대쉬 능력을 가진 위협적인 무기입니다.',
      icon: <Zap className="w-8 h-8 text-cyan-400" />,
      color: 'from-cyan-700 to-blue-900',
    },
  ];

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 text-white p-6">
      <h2 className="text-3xl font-black mb-10">근접 무기 선택 // ROUND {round}</h2>
      <div className="grid grid-cols-2 gap-8">
        {meleeOptions.map((item) => (
          <motion.button
            key={item.type}
            whileHover={{ scale: 1.05 }}
            onClick={() => onSelect(item.type)}
            className={`p-8 border-2 border-neutral-700 bg-gradient-to-br ${item.color} flex flex-col items-center gap-4`}
          >
            {item.icon}
            <span className="text-2xl font-bold">{item.nameKo}</span>
            <span className="text-sm text-neutral-300">{item.desc}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
