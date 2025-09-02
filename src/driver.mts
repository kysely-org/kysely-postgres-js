import {
	CompiledQuery,
	type DatabaseConnection,
	type Driver,
	type QueryResult,
	type TransactionSettings,
} from 'kysely'
import type { ReservedSql } from 'postgres'
import type { PostgresJSDialectConfig } from './dialect-config.mjs'
import { freeze } from './utils.mjs'

export class PostgresJSDriver implements Driver {
	readonly #config: PostgresJSDialectConfig

	constructor(config: PostgresJSDialectConfig) {
		this.#config = freeze({ ...config })
	}

	async init(): Promise<void> {
		// noop
	}

	async acquireConnection(): Promise<PostgresJSConnection> {
		const reservedConnection = await this.#config.postgres.reserve()

		return new PostgresJSConnection(reservedConnection)
	}

	async beginTransaction(
		connection: PostgresJSConnection,
		settings: TransactionSettings,
	): Promise<void> {
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

class PostgresJSConnection implements DatabaseConnection {
	readonly #reservedConnection: ReservedSql

	constructor(reservedConnection: ReservedSql) {
		this.#reservedConnection = reservedConnection
	}

	async beginTransaction(settings: TransactionSettings): Promise<void> {
		const { isolationLevel } = settings

		const compiledQuery = CompiledQuery.raw(
			isolationLevel
				? `start transaction isolation level ${isolationLevel}`
				: 'begin',
		)

		await this.executeQuery(compiledQuery)
	}

	async commitTransaction(): Promise<void> {
		await this.executeQuery(CompiledQuery.raw('commit'))
	}

	async executeQuery<R>(
		compiledQuery: CompiledQuery<unknown>,
	): Promise<QueryResult<R>> {
		const result = await this.#reservedConnection.unsafe<R[]>(
			compiledQuery.sql,
			[...compiledQuery.parameters] as never,
		)

		const rows = Array.from(result.values())

		if (['INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(result.command)) {
			const numAffectedRows = BigInt(result.count)

			return { numAffectedRows, rows }
		}

		return { rows }
	}

	releaseConnection(): void {
		this.#reservedConnection.release()
	}

	async rollbackTransaction(): Promise<void> {
		await this.executeQuery(CompiledQuery.raw('rollback'))
	}

	async *streamQuery<R>(
		compiledQuery: CompiledQuery<unknown>,
		chunkSize: number,
	): AsyncIterableIterator<QueryResult<R>> {
		if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
			throw new PostgresJSDialectError('chunkSize must be a positive integer')
		}

		const cursor = this.#reservedConnection
			.unsafe<R[]>(compiledQuery.sql, [...compiledQuery.parameters] as never)
			.cursor(chunkSize)

		for await (const rows of cursor) {
			yield { rows }
		}
	}
}

export class PostgresJSDialectError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'PostgresJSDialectError'
	}
}
