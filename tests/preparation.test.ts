import { Kysely, sql } from 'kysely'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PostgresJSDialect } from '..'
import { CONNECTION_STRING } from './test-setup.js'

interface Database {
	preparation_test: { value: number }
}

for (const prepare of [true, false]) {
	describe(`postgres.js preparation (prepare: ${prepare})`, () => {
		let client: ReturnType<typeof postgres>
		let db: Kysely<Database>

		beforeEach(async () => {
			client = postgres(CONNECTION_STRING, { max: 1, prepare })
			db = new Kysely<Database>({
				dialect: new PostgresJSDialect({ postgres: client }),
			})
			await db.schema
				.createTable('preparation_test')
				.temporary()
				.addColumn('value', 'integer')
				.execute()
		})

		afterEach(async () => {
			await db.destroy()
		})

		it('should execute parameterless raw batches inside a transaction', async () => {
			await db.transaction().execute(async (trx) => {
				await sql`
					SET LOCAL transaction_timeout = '15s';
					SET LOCAL ROLE postgres;
				`.execute(trx)

				const { rows } = await sql<{ timeout: string; role: string }>`
					select current_setting('transaction_timeout') as timeout,
					       current_setting('role') as role
				`.execute(trx)

				expect(rows).toEqual([{ timeout: '15s', role: 'postgres' }])
			})
		})

		it.each([
			{
				name: 'parameterless select',
				query: (db: Kysely<Database>) =>
					db.selectFrom('preparation_test').selectAll().compile(),
			},
			{
				name: 'parameterless insert',
				query: (db: Kysely<Database>) =>
					db
						.insertInto('preparation_test')
						.values({ value: sql.lit(1) })
						.compile(),
			},
			{
				name: 'parameterless update',
				query: (db: Kysely<Database>) =>
					db
						.updateTable('preparation_test')
						.set({ value: sql.lit(2) })
						.compile(),
			},
			{
				name: 'parameterless delete',
				query: (db: Kysely<Database>) =>
					db.deleteFrom('preparation_test').compile(),
			},
			{
				name: 'parameterless merge',
				query: (db: Kysely<Database>) =>
					db
						.mergeInto('preparation_test as target')
						.using(
							db.selectNoFrom(sql.lit(1).as('value')).as('source'),
							'target.value',
							'source.value',
						)
						.whenNotMatched()
						.thenInsertValues({ value: sql.lit(1) })
						.compile(),
			},
			{
				name: 'parameterized select',
				query: (db: Kysely<Database>) =>
					db
						.selectFrom('preparation_test')
						.selectAll()
						.where('value', '=', 1)
						.compile(),
			},
			{
				name: 'parameterized raw query',
				query: (db: Kysely<Database>) => sql`select ${1}::integer`.compile(db),
			},
		])('should respect preparation and reuse for $name', async ({ query }) => {
			const compiledQuery = query(db)

			await db.executeQuery(compiledQuery)
			await db.executeQuery(compiledQuery)

			const statements = await client.unsafe(
				`select statement, (generic_plans + custom_plans)::integer as executions
				 from pg_prepared_statements where statement = $1`,
				[compiledQuery.sql],
			)

			expect(Array.from(statements)).toEqual(
				prepare ? [{ statement: compiledQuery.sql, executions: 2 }] : [],
			)
		})

		it('should leave parameterless raw queries and schema commands unprepared', async () => {
			await sql`select 1`.execute(db)

			const statements = await client.unsafe(
				`select statement from pg_prepared_statements
				 where statement = 'select 1' or statement like '%preparation_test%'`,
			)

			expect(Array.from(statements)).toEqual([])
		})
	})
}
