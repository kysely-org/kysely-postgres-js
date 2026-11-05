import {
	type AbortableOperationOptions,
	CompiledQuery,
	type ControlConnectionProvider,
	type DatabaseConnection,
	PostgresDriver,
	QueryNode,
	type QueryResult,
} from 'kysely'
import type {
	BunSqlClass,
	PostgresJSDialectConfig,
	PostgresJSPendingQuery,
	PostgresJSReservedSql,
	PostgresJSSql,
	PostgresJSSqlOptions,
} from './dialect-config.js'
import { freeze } from './utils.js'

const RELEASE_CONNECTION_SYMBOL = Symbol('release')
const SESSION_KILLED_SYMBOL = Symbol('sessionKilled')

export class PostgresJSDriver extends PostgresDriver {
	readonly #config: PostgresJSDialectConfig
	#controlPostgres: PostgresJSSql | undefined
	#isBun: boolean | undefined
	#postgres: PostgresJSSql | undefined
	#sessionsKilled = false

	constructor(config: PostgresJSDialectConfig) {
		super({} as never)
		this.#config = freeze({ ...config })
	}

	override async acquireConnection(
		options?: AbortableOperationOptions,
	): Promise<PostgresJSConnection> {
		if (!this.#postgres) {
			throw new PostgresJSDialectError('missing underlying driver instance')
		}

		// Bun 1.4 introduced abort signal support in `reserve()`.
		const reservedConnection = await (this.#isBun
			? this.#postgres.reserve({ signal: options?.signal })
			: this.#postgres.reserve())

		const connection = new PostgresJSConnection(
			reservedConnection,
			this.#isBun,
			this.#controlPostgres,
		)

		await this.#config.onReserveConnection?.(connection, options)

		return connection
	}

	override async destroy(_options?: AbortableOperationOptions): Promise<void> {
		if (!this.#postgres) {
			return
		}

		// cleared before `end()` so a repeated `destroy()` is a no-op instead of
		// ending the pools twice.
		const controlPostgres = this.#controlPostgres
		const postgres = this.#postgres
		this.#controlPostgres = undefined
		this.#postgres = undefined

		// Bun SQL's pool cannot gracefully `end()` once a reserved connection's
		// session was killed via `pg_terminate_backend` - even when the killed
		// query settled cleanly beforehand - so we have to force-close.
		// `postgres` is unaffected: its pool stays cleanly endable.
		const endOptions =
			this.#isBun && this.#sessionsKilled ? { timeout: 0 } : undefined

		await Promise.all([
			postgres.end(endOptions),
			controlPostgres?.end(endOptions),
		])
	}

	override async init(options?: AbortableOperationOptions): Promise<void> {
		const { controlPostgres, postgres } = this.#config

		const instance = isPostgresJSSql(postgres)
			? postgres
			: await postgres(options)

		this.#postgres = this.#assertPostgres(instance)

		if (!controlPostgres) {
			return
		}

		const controlOptions = { ...this.#postgres.options, max: 1 }

		this.#controlPostgres = (controlPostgres as { prototype?: unknown })
			.prototype
			? new (controlPostgres as BunSqlClass)(controlOptions)
			: (controlPostgres as (options: PostgresJSSqlOptions) => PostgresJSSql)(
					controlOptions,
				)
	}

	override async releaseConnection(
		connection: DatabaseConnection,
		_options?: AbortableOperationOptions,
	): Promise<void> {
		this.#sessionsKilled ||= (connection as PostgresJSConnection)[
			SESSION_KILLED_SYMBOL
		]
		;(connection as PostgresJSConnection)[RELEASE_CONNECTION_SYMBOL]()
	}

	#assertPostgres(sql: PostgresJSSql): PostgresJSSql {
		if (typeof Bun === 'undefined') {
			this.#isBun = false

			return sql
		}

		const { adapter } = sql.options || {}

		if (!adapter) {
			this.#isBun = false

			return sql
		}

		if (adapter !== 'postgres') {
			throw new PostgresJSDialectError(
				`PostgresJSDialect only supports Bun SQL's PostgreSQL adapter, but the instance you passed to it resolved to the "${adapter}" adapter.`,
			)
		}

		this.#isBun = true

		return sql
	}
}

function isPostgresJSSql(thing: unknown): thing is PostgresJSSql {
	return typeof thing === 'function' && 'reserve' in thing
}

class PostgresJSConnection implements DatabaseConnection {
	readonly #controlPostgres: PostgresJSSql | undefined
	readonly #isBun: boolean | undefined
	readonly #reservedConnection: PostgresJSReservedSql
	#pendingQuery: PostgresJSPendingQuery | undefined
	#pid: number | undefined
	#sessionKilled = false

	constructor(
		reservedConnection: PostgresJSReservedSql,
		isBun: boolean | undefined,
		controlPostgres: PostgresJSSql | undefined,
	) {
		this.#controlPostgres = controlPostgres
		this.#isBun = isBun
		this.#reservedConnection = reservedConnection
	}

	get [SESSION_KILLED_SYMBOL](): boolean {
		return this.#sessionKilled
	}

	async cancelQuery(
		controlConnectionProvider: ControlConnectionProvider,
	): Promise<void> {
		// Bun SQL's `cancel` is a placeholder right now.
		if (!this.#isBun) {
			return this.#pendingQuery?.cancel()
		}

		if (!this.#pendingQuery) {
			return
		}

		return await this.#affectBackend('cancel', controlConnectionProvider)
	}

	async collectSessionInfo(): Promise<void> {
		// postgres.js hands us the pid on pending queries.
		if (this.#pid != null || !this.#isBun) {
			return
		}

		const [{ pid }] = await this.#reservedConnection.unsafe(
			'select pg_backend_pid() as pid',
		)

		this.#pid = pid
	}

	async executeQuery<R>(
		compiledQuery: CompiledQuery<unknown>,
	): Promise<QueryResult<R>> {
		this.#pendingQuery = this.#reservedConnection.unsafe(
			compiledQuery.sql,
			[...compiledQuery.parameters],
			QueryNode.is(compiledQuery.query) || compiledQuery.parameters.length > 0
				? { prepare: true, simple: false }
				: undefined,
		)

		try {
			const result = await this.#pendingQuery

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

	async killSession(
		controlConnectionProvider: ControlConnectionProvider,
	): Promise<void> {
		if (!this.#pendingQuery) {
			return
		}

		// postgres.js hands us the pid on pending queries.
		this.#pid ??= this.#pendingQuery.state?.pid

		return await this.#affectBackend('terminate', controlConnectionProvider)
	}

	async *streamQuery<R>(
		compiledQuery: CompiledQuery<unknown>,
		chunkSize: number,
	): AsyncIterableIterator<QueryResult<R>> {
		// prefer we don't allow bun here to avoid surprises if and when
		// they add the cursor function.
		if (this.#isBun) {
			throw new PostgresJSDialectError(
				'streaming queries is not supported in Bun.SQL',
			)
		}

		if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
			throw new PostgresJSDialectError('chunkSize must be a positive integer')
		}

		this.#pendingQuery = this.#reservedConnection.unsafe(compiledQuery.sql, [
			...compiledQuery.parameters,
		])

		// biome-ignore lint/style/noNonNullAssertion: only Bun SQL lacks `cursor`, and we threw for Bun above.
		const cursor = this.#pendingQuery.cursor!(chunkSize)

		try {
			for await (const rows of cursor) {
				yield { rows }
			}
		} finally {
			this.#pendingQuery = undefined
		}
	}

	async #affectBackend(
		action: 'cancel' | 'terminate',
		controlConnectionProvider: ControlConnectionProvider,
	): Promise<void> {
		if (this.#pid == null) {
			throw new PostgresJSDialectError('pid missing for backend query')
		}

		// the pending query as of this moment. the control query is only fired
		// if this hasn't changed by the time we hold a control connection - a
		// change means another query took over the reserved connection. in
		// `postgres`'s kill flow this is already `undefined` - we settled the
		// query ourselves via cancel - and "still no pending query" passes the
		// same check.
		const pendingQuery = this.#pendingQuery

		const query = `select pg_${action}_backend(${this.#pid})`

		if (!this.#controlPostgres) {
			return await controlConnectionProvider(async (connection) => {
				if (this.#pendingQuery !== pendingQuery) {
					return
				}

				await connection.executeQuery(CompiledQuery.raw(query))

				if (action === 'terminate') {
					this.#sessionKilled = true
				}
			})
		}

		const controlConnection = await this.#controlPostgres.reserve()

		try {
			if (this.#pendingQuery !== pendingQuery) {
				return
			}

			await controlConnection.unsafe(query)

			if (action === 'terminate') {
				this.#sessionKilled = true
			}
		} finally {
			controlConnection.release()
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
