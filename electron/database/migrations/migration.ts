export interface DatabaseMigration {
  version: number
  name: string
  sql: string
}
