import {
	type CompiledQuery,
	type DatabaseConnection,
	PostgresDriver,
	type QueryResult,
} from 'kysely'
import type {
	PostgresJSDialectConfig,
	PostgresJSReservedSql,
	PostgresJSSql,
} from './dialect-config.mjs'
import { freeze } from './utils.mjs'

const RELEASE_CONNECTION_SYMBOL = Symbol('release')

export class PostgresJSDriver extends PostgresDriver {
	readonly #config: PostgresJSDialectConfig
	#postgres: PostgresJSSql | undefined

	constructor(config: PostgresJSDialectConfig) {
		super({} as never)
		this.#config = freeze({ ...config })
	}

	override async acquireConnection(): Promise<PostgresJSConnection> {
		// biome-ignore lint/style/noNonNullAssertion: `init` ran at this point.
		const reservedConnection = await this.#postgres!.reserve()

		const connection = new PostgresJSConnection(reservedConnection)

		await this.#config.onReserveConnection?.(connection)

		return connection
	}

	override async destroy(): Promise<void> {
		// biome-ignore lint/style/noNonNullAssertion: `init` ran at this point.
		await this.#postgres!.end()
	}

	override async init(): Promise<void> {
		const { postgres } = this.#config

		this.#postgres = isPostgresJSSql(postgres) ? postgres : await postgres()
	}

	override async releaseConnection(
		connection: DatabaseConnection,
	): Promise<void> {
		;(connection as PostgresJSConnection)[RELEASE_CONNECTION_SYMBOL]()
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

	async *streamQuery<R>(
		compiledQuery: CompiledQuery<unknown>,
		chunkSize: number,
	): AsyncIterableIterator<QueryResult<R>> {
		if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
			throw new PostgresJSDialectError('chunkSize must be a positive integer')
		}

		const query = this.#reservedConnection.unsafe(compiledQuery.sql, [
			...compiledQuery.parameters,
		])

		if (typeof query.cursor !== 'function') {
			throw new Error(
				'PostgresJSDialect detected the instance you passed to it does not support streaming.',
			)
		}

		const cursor = query.cursor(chunkSize)

		for await (const rows of cursor) {
			yield { rows }
		}
	}

	[RELEASE_CONNECTION_SYMBOL](): void {
		this.#reservedConnection.release()
	}
}

export class PostgresJSDialectError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'PostgresJSDialectError'
	}
}
