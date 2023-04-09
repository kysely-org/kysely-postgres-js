import type {CompiledQuery, DatabaseConnection, QueryResult, TransactionSettings} from 'kysely'
import type {Sql} from 'postgres'

import {PostgresJSDialectError} from './errors.js'
import type {PostgresJSDialectConfig} from './types.js'
import {freeze} from './utils.js'

export class PostgresJSConnection implements DatabaseConnection {
  readonly #config: PostgresJSDialectConfig
  #sql: Sql
  #transaction?: Sql

  constructor(config: PostgresJSDialectConfig, sql: Sql) {
    this.#config = freeze({...config})
    this.#sql = sql
  }

  async beginTransaction(settings: TransactionSettings): Promise<void> {
    if (this.#transaction) {
      throw new PostgresJSDialectError('transaction already begun!')
    }

    const {isolationLevel} = settings

    this.#transaction = this.#config.postgres({...this.#config.options, max: 1})

    const statement = `start transaction${isolationLevel ? ` ${isolationLevel}` : ''}`

    await this.#transaction.unsafe(statement)
  }

  async commitTransaction(): Promise<void> {
    if (!this.#transaction) {
      throw new PostgresJSDialectError('no transaction to commit!')
    }

    await this.#transaction`commit`

    this.#releaseTransaction()
  }

  async executeQuery<R>(compiledQuery: CompiledQuery<unknown>): Promise<QueryResult<R>> {
    const result = await this.#resolveExecutor().unsafe<R[]>(compiledQuery.sql, compiledQuery.parameters.slice() as any)

    const rows = Array.from(result.values())

    if (['INSERT', 'UPDATE', 'DELETE'].includes(result.command)) {
      const numAffectedRows = BigInt(result.count)

      return {numAffectedRows, rows}
    }

    return {rows}
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.#transaction) {
      throw new PostgresJSDialectError('no transaction to rollback!')
    }

    await this.#transaction`rollback`

    this.#releaseTransaction()
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery<unknown>,
    chunkSize: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new PostgresJSDialectError('chunkSize must be a positive integer')
    }

    const cursor = this.#resolveExecutor()
      .unsafe<R[]>(compiledQuery.sql, compiledQuery.parameters.slice() as any)
      .cursor(chunkSize)

    for await (const rows of cursor) {
      yield {rows}
    }
  }

  #resolveExecutor(): Sql {
    return this.#transaction || this.#sql
  }

  #releaseTransaction(): void {
    if (this.#transaction) {
      this.#transaction.end()
      this.#transaction = undefined
    }
  }
}
