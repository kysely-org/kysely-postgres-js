import {
	CompiledQuery,
	type DatabaseConnection,
	type Driver,
	type QueryResult,
	type TransactionSettings,
} from 'kysely'
import type {
	PostgresJSDialectConfig,
	PostgresJSReservedSql,
	PostgresJSSql,
} from './dialect-config.mjs'
import { freeze } from './utils.mjs'

export class PostgresJSDriver implements Driver {
	readonly #config: PostgresJSDialectConfig
	#postgres: PostgresJSSql | undefined

	constructor(config: PostgresJSDialectConfig) {
		this.#config = freeze({ ...config })
	}

	async acquireConnection(): Promise<PostgresJSConnection> {
		// biome-ignore lint/style/noNonNullAssertion: `init` ran at this point.
		const reservedConnection = await this.#postgres!.reserve()

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

	async init(): Promise<void> {
		const { postgres } = this.#config

		this.#postgres = isPostgresJSSql(postgres) ? postgres : await postgres()
	}

	async rollbackTransaction(connection: PostgresJSConnection): Promise<void> {
		await connection.rollbackTransaction()
	}

	async releaseConnection(connection: PostgresJSConnection): Promise<void> {
		connection.releaseConnection()
	}

	async destroy(): Promise<void> {
		// biome-ignore lint/style/noNonNullAssertion: `init` ran at this point.
		await this.#postgres!.end()
	}
}

function isPostgresJSSql(thing: unknown): thing is PostgresJSSql {
	return typeof thing === 'function' && 'reserve' in thing
}

class PostgresJSConnection implements DatabaseConnection {
	readonly #reservedConnection: PostgresJSReservedSql

	constructor(reservedConnection: PostgresJSReservedSql) {
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
		const result = await this.#reservedConnection.unsafe(compiledQuery.sql, [
			...compiledQuery.parameters,
		])

		const { command, count } = result

		return {
			numAffectedRows:
				command === 'INSERT' ||
				command === 'UPDATE' ||
				command === 'DELETE' ||
				command === 'MERGE'
					? BigInt(count)
					: undefined,
			rows: Array.from(result.values()),
		}
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
			.unsafe(compiledQuery.sql, [...compiledQuery.parameters])
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
