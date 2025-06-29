// types.ts defines interfaces for what valid storage looks like
// you shouldn't need to touch this unless you need to save something completely new to chrome storage!

export interface Intent {
  intent: string
  url: string
  accepted?: string
  whitelistTime?: number  // The time in minutes that was selected for this visit
}

export interface Storage {
  // feature toggles
  isEnabled?: boolean
  enableBlobs?: boolean
  enable3D?: boolean

  // lists
  blockedSites?: string[]
  activeSites?: string[]  // Sites where reflect is currently active
  intentList?: { [key: string]: Intent }
  customMessage?: string
  whitelistedSites?: { [key: string]: string }

  // misc config
  numIntentEntries?: number
  whitelistTime?: number

  predictionThreshold?: number
  minIntentLength?: number
}
