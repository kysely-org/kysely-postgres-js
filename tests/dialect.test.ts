import { Kysely, sql } from 'kysely'
import { isBun } from 'std-env'
import { describe, expect, it } from 'vitest'
import { PostgresJSDialect, type PostgresJSSql } from '..'
import type { Database } from './test-setup.js'

describe.skipIf(!isBun)('adapter validation (bun)', () => {
	it('should throw when the Bun `SQL` instance\'s resolved adapter is not "postgres"', async () => {
		const db = new Kysely<Database>({
			dialect: new PostgresJSDialect({
				postgres: () =>
					import('bun').then(
						(mod) =>
							new mod.SQL('sqlite://:memory:') as unknown as PostgresJSSql,
					),
			}),
		})

		await expect(sql`select 1`.execute(db)).rejects.toThrow(
			'PostgresJSDialect only supports Bun SQL\'s PostgreSQL adapter, but the instance you passed to it resolved to the "sqlite" adapter.',
		)
	})
})
