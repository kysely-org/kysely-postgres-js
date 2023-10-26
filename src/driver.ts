import type {Driver, TransactionSettings} from 'kysely'

import {PostgresJSConnection} from './connection.js'
import type {PostgresJSDialectConfig} from './types.js'
import {freeze} from './utils.js'

export class PostgresJSDriver implements Driver {
  readonly #config: PostgresJSDialectConfig

  constructor(config: PostgresJSDialectConfig) {
    this.#config = freeze({...config})
  }

  async init(): Promise<void> {
    // noop
  }

  async acquireConnection(): Promise<PostgresJSConnection> {
    const reservedConnection = await this.#config.postgres.reserve()

    return new PostgresJSConnection(reservedConnection)
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

  async releaseConnection(connection: PostgresJSConnection): Promise<void> {
    connection.releaseConnection()
  }

  async destroy(): Promise<void> {
    await this.#config.postgres.end()
  }
}
