import type {Sql} from 'postgres'

import type {PostgresJSDialectConfig} from './types'

export function freeze<T>(obj: T): Readonly<T> {
  return Object.freeze(obj)
}

export function createPostgres(config: PostgresJSDialectConfig): Sql {
  return 'connectionString' in config
    ? config.postgres(config.connectionString, config.options)
    : config.postgres(config.options)
}
