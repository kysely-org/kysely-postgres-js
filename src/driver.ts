import {
	type AbortableOperationOptions,
	CompiledQuery,
	type ControlConnectionProvider,
	type DatabaseConnection,
	PostgresDriver,
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

		const reservedConnection = await this.#postgres.reserve()

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
		// `postgres` is unaffected: `killSession` cancels the in-flight query
		// first, so its pool stays cleanly endable.
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
		this.#pendingQuery = this.#reservedConnection.unsafe(compiledQuery.sql, [
			...compiledQuery.parameters,
		])

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
		if (this.#isBun) {
			if (!this.#pendingQuery) {
				return
			}

			return await this.#affectBackend('terminate', controlConnectionProvider)
		}

		// captured once - the field is cleared by `executeQuery`'s `finally` the
		// moment the query settles, while we keep needing the promise below.
		const pendingQuery = this.#pendingQuery

		if (!pendingQuery) {
			return
		}

		this.#pid ??= pendingQuery.state?.pid

		// terminating a busy `postgres` connection poisons its pool slot - the
		// in-flight query's state is never cleared on socket close, so the slot
		// can never reconnect and graceful `end()` hangs forever. cancelling
		// first lets the connection settle cleanly, and only then we terminate
		// the idle session.
		pendingQuery.cancel()

		// `cancel()` only *requests* cancellation - it fires a CancelRequest
		// over a separate throwaway socket, while the reserved connection's
		// internal in-flight query state is only cleared once the server's
		// response ("57014: canceling statement due to user request", which is
		// not ours to throw) arrives back on the data socket. the promise
		// settling is the one observable signal that this round trip completed
		// and the connection is idle and clean. terminating without waiting
		// races the two sockets - if `pg_terminate_backend` wins, the backend
		// dies mid-statement, and we've poisoned the slot after all.
		const wasCancelled = await pendingQuery.then(
			() => false,
			(error) => (error as { code?: unknown } | null)?.code === '57014',
		)

		// the query settled without our cancellation interrupting it - it either
		// beat the cancel and completed successfully, or failed on its own.
		// Kysely's core dialects don't kill the session once the query settled -
		// neither do we.
		if (!wasCancelled) {
			return
		}

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
		// after `pg_terminate_backend`, `postgres`'s pool has already moved the
		// dead connection to its closed queue. releasing it would move it back
		// to the open queue, and queries dispatched to it would then hang.
		if (this.#sessionKilled && !this.#isBun) {
			return
		}

		this.#reservedConnection.release()
	}
}

export class PostgresJSDialectError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'PostgresJSDialectError'
	}
}
