export const FORCE = "force" as const
export const ENSURE = "ensure" as const
export const SKIP = "skip" as const
export const CHECK = "check" as const
export const FETCH = "fetch" as const
export const OFF = "off" as const

/**
 * Shared action-state type.
 *
 * Core exports common states above, but plugins are free to define additional
 * states for their own actions.
 */
export type StepState = string
