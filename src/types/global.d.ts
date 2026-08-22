import type { SiearApi } from './siear-api'

declare global {
  interface Window {
    siear: SiearApi
  }
}

export {}
