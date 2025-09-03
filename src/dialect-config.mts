import type { DatabaseConnection } from 'kysely'

export interface PostgresJSDialectConfig {
	/**
	 * Called every time a connection is acquired from the pool.
	 */
	onReserveConnection?: (connection: DatabaseConnection) => Promise<void>

	/**
	 * An instance, or a factory returning an instance, of `postgres`'s `Sql` (returned by `postgres(...)`) or Bun's `SQL` class.
	 */
	readonly postgres:
		| PostgresJSSql
		| (() => PostgresJSSql | Promise<PostgresJSSql>)
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

interface PostgresJSPendingQuery
	// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
	extends Promise<any[] & Iterable<any> & PostgresJSResultQueryMeta> {
	// biome-ignore lint/suspicious/noExplicitAny: we wanna match widely, to be safe.
	cursor?: (rows?: number) => AsyncIterable<any[]>
	// | ((rows: number, cb: (rows: any[]) => void) => Promise<ExecutionResult>)
	// | ((cb: (row: [any]) => void) => Promise<ExecutionResult>)
}

interface PostgresJSResultQueryMeta {
	command: string
	count: number
}
