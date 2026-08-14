export const STATES = [
  'talking',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
] as const

export type OrbState = (typeof STATES)[number]
