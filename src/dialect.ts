import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
} from 'kysely'

import {PostgresJSDriver} from './driver.js'
import type {PostgresJSDialectConfig} from './types.js'
import {freeze} from './utils.js'

export class PostgresJSDialect implements Dialect {
  readonly #config: PostgresJSDialectConfig

  constructor(config: PostgresJSDialectConfig) {
    this.#config = freeze({...config})
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter()
  }

  createDriver(): Driver {
    return new PostgresJSDriver(this.#config)
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new PostgresIntrospector(db)
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler()
  }
}
