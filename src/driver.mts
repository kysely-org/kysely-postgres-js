import {
	type AbortableOperationOptions,
	type CompiledQuery,
	type DatabaseConnection,
	PostgresDriver,
	type QueryResult,
} from 'kysely'
import type {
	PostgresJSDialectConfig,
	PostgresJSPendingQuery,
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

	override async acquireConnection(
		options?: AbortableOperationOptions,
	): Promise<PostgresJSConnection> {
		// biome-ignore lint/style/noNonNullAssertion: `init` ran at this point.
		const reservedConnection = await this.#postgres!.reserve()

		const connection = new PostgresJSConnection(reservedConnection)

		await this.#config.onReserveConnection?.(connection, options)

		return connection
	}

	override async destroy(_options?: AbortableOperationOptions): Promise<void> {
		// biome-ignore lint/style/noNonNullAssertion: `init` ran at this point.
		await this.#postgres!.end()
	}

	override async init(options?: AbortableOperationOptions): Promise<void> {
		const { postgres } = this.#config

		this.#postgres = isPostgresJSSql(postgres)
			? postgres
			: await postgres(options)
	}

	override async releaseConnection(
		connection: DatabaseConnection,
		_options?: AbortableOperationOptions,
	): Promise<void> {
		;(connection as PostgresJSConnection)[RELEASE_CONNECTION_SYMBOL]()
	}
}

function isPostgresJSSql(thing: unknown): thing is PostgresJSSql {
	return typeof thing === 'function' && 'reserve' in thing
}

class PostgresJSConnection implements DatabaseConnection {
	readonly #reservedConnection: PostgresJSReservedSql
	#pendingQuery: PostgresJSPendingQuery | undefined

	constructor(reservedConnection: PostgresJSReservedSql) {
		this.#reservedConnection = reservedConnection
	}

	async cancelQuery(): Promise<void> {
		if (typeof this.#pendingQuery?.cancel === 'function') {
			this.#pendingQuery.cancel()
		}
	}

	async executeQuery<R>(
		compiledQuery: CompiledQuery<unknown>,
	): Promise<QueryResult<R>> {
		const pendingQuery = this.#reservedConnection.unsafe(compiledQuery.sql, [
			...compiledQuery.parameters,
		])

		this.#pendingQuery = pendingQuery

		try {
			const result = await pendingQuery

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
		} finally {
			this.#pendingQuery = undefined
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

		this.#pendingQuery = query

		const cursor = query.cursor(chunkSize)

		try {
			for await (const rows of cursor) {
				yield { rows }
			}
		} finally {
			this.#pendingQuery = undefined
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
