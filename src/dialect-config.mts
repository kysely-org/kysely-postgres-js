import type { AbortableOperationOptions, DatabaseConnection } from 'kysely'

export interface PostgresJSDialectConfig {
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
	end(): Promise<void>
	reserve(): Promise<PostgresJSReservedSql>
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
	/**
	 * Cancels this pending query on the database side, if supported. Present on
	 * both `postgres`'s pending queries and Bun's `SQL`, though as of Bun 1.3.1
	 * it doesn't actually cancel the in-flight query server-side.
	 */
	cancel?: () => void
	// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
	cursor?: (rows?: number) => AsyncIterable<any[]>
	// | ((rows: number, cb: (rows: any[]) => void) => Promise<ExecutionResult>)
	// | ((cb: (row: [any]) => void) => Promise<ExecutionResult>)
}

interface PostgresJSResultQueryMeta {
	command: string
	count: number
}
