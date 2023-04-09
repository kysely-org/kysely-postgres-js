import type postgres from 'postgres'
import type {Options} from 'postgres'

export interface PostgresJSDialectConfig {
  options: Options<any>
  postgres: typeof postgres
}
