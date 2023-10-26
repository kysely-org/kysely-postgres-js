import type {Sql} from 'postgres'

export interface PostgresJSDialectConfig {
  readonly postgres: Sql
}
