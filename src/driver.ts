import type {Driver, TransactionSettings} from 'kysely'
import type {Sql} from 'postgres'

import {PostgresJSConnection} from './connection.js'
import type {PostgresJSDialectConfig} from './types.js'
import {freeze} from './utils.js'

export class PostgresJSDriver implements Driver {
  readonly #config: PostgresJSDialectConfig
  readonly #sql: Sql

  constructor(config: PostgresJSDialectConfig) {
    this.#config = freeze({...config})
    this.#sql = this.#config.postgres(this.#config.options)
  }

  async init(): Promise<void> {
    // noop
  }

  async acquireConnection(): Promise<PostgresJSConnection> {
    return new PostgresJSConnection(this.#config, this.#sql)
  }

  async beginTransaction(connection: PostgresJSConnection, settings: TransactionSettings): Promise<void> {
    await connection.beginTransaction(settings)
  }

  async commitTransaction(connection: PostgresJSConnection): Promise<void> {
    await connection.commitTransaction()
  }

  async rollbackTransaction(connection: PostgresJSConnection): Promise<void> {
    await connection.rollbackTransaction()
  }

  async releaseConnection(_: PostgresJSConnection): Promise<void> {
    // noop
  }

  async destroy(): Promise<void> {
    await this.#sql.end()
  }
}
