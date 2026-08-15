import {
	type DatabaseIntrospector,
	type Dialect,
	type DialectAdapter,
	type Driver,
	type Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type QueryCompiler,
} from 'kysely'
import type { PostgresJSDialectConfig } from './dialect-config.js'
import { PostgresJSDriver } from './driver.js'
import { freeze } from './utils.js'

export class PostgresJSDialect implements Dialect {
	readonly #config: PostgresJSDialectConfig

	constructor(config: PostgresJSDialectConfig) {
		this.#config = freeze({ ...config })
	}

	createAdapter(): DialectAdapter {
		return new PostgresAdapter()
	}

	createDriver(): Driver {
		return new PostgresJSDriver(this.#config)
	}

	// biome-ignore lint/suspicious/noExplicitAny: this is fine.
	createIntrospector(db: Kysely<any>): DatabaseIntrospector {
		return new PostgresIntrospector(db)
	}

	createQueryCompiler(): QueryCompiler {
		return new PostgresQueryCompiler()
	}
}
