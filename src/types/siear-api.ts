export interface AppInfo {
  name: string
  version: string
  environment: 'development' | 'production'
}

export interface SiearApi {
  app: { getInfo: () => Promise<AppInfo> }
}
