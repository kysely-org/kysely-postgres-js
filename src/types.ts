import type postgres from 'postgres'
import type {Options} from 'postgres'

export type PostgresJSDialectConfig =
  | {
      connectionString: string
      options?: Options<any>
      postgres: typeof postgres
    }
  | {
      options: Options<any>
      postgres: typeof postgres
    }
