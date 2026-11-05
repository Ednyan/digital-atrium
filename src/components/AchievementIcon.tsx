// Each achievement's own icon (lib/achievements): drawn from its file in
// src/assets/achievements, <id>.svg -- a dark tile with the app's cut corner, lit
// from within in its family's colour, its symbol drawn in line over it and, where
// it's a step of a count, that step's diamonds along its foot. Edited there, in
// any vector editor, it's what the app shows. Not earned yet, it's grey and dim
// (index.css .achievement-icon-locked), as a locked one is shown.

import type { Achievement } from '../lib/achievements'

const FILES = import.meta.glob('../assets/achievements/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const fileOf = (id: string) => FILES[`../assets/achievements/${id}.svg`] ?? FILES['../assets/achievements/firstTrace.svg']

export default function AchievementIcon({ one, earned = true, size = 48, className = '' }: { one: Achievement; earned?: boolean; size?: number; className?: string }) {
  return (
    <img
      src={fileOf(one.id)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-achievement-icon={one.id}
      className={`achievement-icon shrink-0 ${earned ? '' : 'achievement-icon-locked'} ${className}`}
    />
  )
}
