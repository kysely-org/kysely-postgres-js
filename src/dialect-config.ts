import type { AbortableOperationOptions, DatabaseConnection } from 'kysely'

export interface PostgresJSDialectConfig {
	/**
	 * A factory returning an instance of `postgres`'s `Sql` (returned by
	 * `postgres(...)`) or Bun's `SQL` class, to be used for connecting to the
	 * database outside of {@link postgres | `postgres`}'s pool to avoid waiting
	 * for an idle connection. You can pass `postgres` or `SQL` directly - both
	 * work when called without `new`.
	 *
	 * Control queries (e.g. `pg_cancel_backend`) are executed through it when
	 * using Kysely's `inflightQueryAbortStrategy`. The factory receives the
	 * main instance's resolved options, with `max` set to `1` - construct the
	 * control instance with the same library that created the main instance.
	 * Since both libraries' pools are lazy, the returned instance doesn't hold
	 * a connection until the first control query runs.
	 *
	 * When not provided, control queries are executed on a connection acquired
	 * from {@link postgres | `postgres`}'s pool, which might mean waiting for
	 * an idle connection.
	 */
	controlPostgres?:
		| ((options: PostgresJSSql['options']) => PostgresJSSql)
		| BunSqlClass

	/**
	 * Called every time a connection is acquired from the pool.
	 */
	onReserveConnection?: (
		connection: DatabaseConnection,
		options?: AbortableOperationOptions,
	) => Promise<void>

	/**
	 * An instance, or a factory returning an instance, of `postgres`'s `Sql` (returned by `postgres(...)`) or Bun's `SQL` class.
	 */
	readonly postgres:
		| PostgresJSSql
		| ((
				options?: AbortableOperationOptions,
		  ) => PostgresJSSql | Promise<PostgresJSSql>)
}

export interface PostgresJSSql {
	end(options?: { timeout?: number }): Promise<void>

	options: PostgresJSSqlOptions

	reserve(): Promise<PostgresJSReservedSql>
}

export interface PostgresJSSqlOptions {
	/**
	 * Bun.SQL only.
	 */
	adapter?: 'postgres' | 'mysql' | 'sqlite' | 'mariadb'
	max?: number
}

export interface BunSqlClass {
	new (options?: PostgresJSSqlOptions): PostgresJSSql
}

export interface PostgresJSReservedSql {
	release(): void
	unsafe(
		query: string,
		// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
		parameters?: any[],
		// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
		queryOptions?: any,
	): PostgresJSPendingQuery
}

export interface PostgresJSPendingQuery
	// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
	extends Promise<any[] & Iterable<any> & PostgresJSResultQueryMeta> {
	cancel: () => void

	// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
	cursor?: (rows?: number) => AsyncIterable<any[]>
	// | ((rows: number, cb: (rows: any[]) => void) => Promise<ExecutionResult>)
	// | ((cb: (row: [any]) => void) => Promise<ExecutionResult>)

	/**
	 * `postgres` only.
	 */
	state?: {
		pid: number
	}
}

interface PostgresJSResultQueryMeta {
	command: string
	count: number
}
