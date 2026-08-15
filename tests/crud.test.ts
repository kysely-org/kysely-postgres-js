import { setTimeout } from 'node:timers/promises'
import { sql } from 'kysely'
import { isBun } from 'std-env'
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'
import {
	initTest,
	resetState,
	SUPPORTED_DIALECTS,
	type TestContext,
} from './test-setup.js'

for (const dialect of SUPPORTED_DIALECTS) {
	describe.skipIf(dialect === 'bun' && !isBun)(dialect, () => {
		let ctx: TestContext

		beforeAll(async () => {
			ctx = await initTest(dialect)
		})

		beforeEach(async () => {
			await resetState()
		})

		afterAll(async () => {
			await ctx.db.destroy()
		})

		it('should execute select queries', async () => {
			const result = await ctx.db.selectFrom('person').selectAll().execute()

			expect(result).toMatchInlineSnapshot(`
				[
				  {
				    "id": "48856ed4-9f1f-4111-ba7f-6092a1be96eb",
				    "name": "moshe",
				  },
				  {
				    "id": "28175ebc-02ec-4c87-9a84-b3d25193fefa",
				    "name": "haim",
				  },
				  {
				    "id": "cbbffbea-47d5-40ec-a98d-518b48e2bb5d",
				    "name": "rivka",
				  },
				  {
				    "id": "d2b76f94-1a33-4b8c-9226-7d35390b1112",
				    "name": "henry",
				  },
				]
			`)
		})

		it('should execute insert queries - no returning', async () => {
			const result = await ctx.db
				.insertInto('person')
				.values({ name: 'johnny' })
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				InsertResult {
				  "insertId": undefined,
				  "numInsertedOrUpdatedRows": 1n,
				}
			`)
		})

		it('should execute insert queries - with returning', async () => {
			const result = await ctx.db
				.insertInto('person')
				.values({
					id: 'c260ee08-5c8a-4ed8-8415-575af63f22da',
					name: 'duncan',
				})
				.returning('id')
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				{
				  "id": "c260ee08-5c8a-4ed8-8415-575af63f22da",
				}
			`)
		})

		it('should execute update queries - no returning', async () => {
			const result = await ctx.db
				.updateTable('person')
				.set('name', 'alex')
				.where('name', '=', 'moshe')
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				UpdateResult {
				  "numChangedRows": undefined,
				  "numUpdatedRows": 1n,
				}
			`)
		})

		it('should execute update queries - with returning', async () => {
			const result = await ctx.db
				.updateTable('person')
				.set('name', 'alex')
				.where('name', '=', 'moshe')
				.returning('id')
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				{
				  "id": "48856ed4-9f1f-4111-ba7f-6092a1be96eb",
				}
			`)
		})

		it('should execute delete queries - no returning', async () => {
			const result = await ctx.db
				.deleteFrom('person')
				.where('id', '=', '48856ed4-9f1f-4111-ba7f-6092a1be96eb')
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				DeleteResult {
				  "numDeletedRows": 1n,
				}
			`)
		})

		it('should execute delete queries - with returning', async () => {
			const result = await ctx.db
				.deleteFrom('person')
				.where('id', '=', '48856ed4-9f1f-4111-ba7f-6092a1be96eb')
				.returning('name')
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				{
				  "name": "moshe",
				}
			`)
		})

		it('should execute merge queries - no returning', async () => {
			const result = await ctx.db
				.mergeInto('person as target')
				.using('person as source', (jb) =>
					jb
						.onRef('source.name', '!=', 'target.name')
						.on((eb) =>
							eb(
								eb.fn('left', ['source.name', eb.val(1)]),
								'=',
								eb.fn('left', ['target.name', eb.val(1)]),
							),
						),
				)
				.whenMatched()
				.thenDelete()
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				MergeResult {
				  "numChangedRows": 2n,
				}
			`)
		})

		it('should execute merge queries - with returning', async () => {
			const result = await ctx.db
				.mergeInto('person as target')
				.using('person as source', (jb) =>
					jb
						.onRef('source.name', '!=', 'target.name')
						.on((eb) =>
							eb(
								eb.fn('left', ['source.name', eb.val(1)]),
								'=',
								eb.fn('left', ['target.name', eb.val(1)]),
							),
						),
				)
				.whenMatched()
				.thenDelete()
				.returningAll()
				.executeTakeFirstOrThrow()

			expect(result).toMatchInlineSnapshot(`
				{
				  "id": "28175ebc-02ec-4c87-9a84-b3d25193fefa",
				  "name": "haim",
				}
			`)
		})

		it.skipIf(dialect === 'bun')(
			'should stream select queries: exhaust',
			async () => {
				const items = []

				const iterator = ctx.db.selectFrom('person').selectAll().stream()

				for await (const item of iterator) {
					items.push(item)
				}

				expect(items).toMatchInlineSnapshot(`
					[
					  {
					    "id": "48856ed4-9f1f-4111-ba7f-6092a1be96eb",
					    "name": "moshe",
					  },
					  {
					    "id": "28175ebc-02ec-4c87-9a84-b3d25193fefa",
					    "name": "haim",
					  },
					  {
					    "id": "cbbffbea-47d5-40ec-a98d-518b48e2bb5d",
					    "name": "rivka",
					  },
					  {
					    "id": "d2b76f94-1a33-4b8c-9226-7d35390b1112",
					    "name": "henry",
					  },
					]
				`)
			},
		)

		it.skipIf(dialect === 'bun')(
			'should stream select queries: break',
			async () => {
				const items = []

				const iterator = ctx.db.selectFrom('person').selectAll().stream()

				for await (const item of iterator) {
					items.push(item)

					break
				}

				expect(items).toMatchInlineSnapshot(`
						[
						  {
						    "id": "48856ed4-9f1f-4111-ba7f-6092a1be96eb",
						    "name": "moshe",
						  },
						]
					`)
			},
		)

		it('should execute normally when passed a non-aborted signal', async () => {
			const result = await ctx.db
				.selectFrom('person')
				.selectAll()
				.execute({ signal: new AbortController().signal })

			expect(result).toHaveLength(4)
		})

		it('should reject immediately when the signal is already aborted', async () => {
			const controller = new AbortController()
			const reason = new Error('aborted before execution')
			controller.abort(reason)
			vi.spyOn(console, 'error').mockImplementation(() => {})

			await expect(
				ctx.db
					.selectFrom('person')
					.selectAll()
					.execute({ signal: controller.signal }),
			).rejects.toBe(reason)
		})

		it('should abort a slow query promptly instead of waiting for it to finish', async () => {
			const start = Date.now()

			await expect(
				sql`select pg_sleep(0.5)`.execute(ctx.db, {
					signal: AbortSignal.timeout(50),
				}),
			).rejects.toThrow()

			expect(Date.now() - start).toBeLessThan(400)
		})

		it.skipIf(dialect === 'bun')(
			"should cancel the query on the database side when inflightQueryAbortStrategy is 'cancel query'",
			async () => {
				await expect(
					sql`update person set name = 'cancelled' from (select pg_sleep(0.5)) as delay where name = 'moshe'`.execute(
						ctx.db,
						{
							signal: AbortSignal.timeout(50),
							inflightQueryAbortStrategy: 'cancel query',
						},
					),
				).rejects.toSatisfy((error) => {
					expect(error).toBeInstanceOf(DOMException)
					expect(error).toMatchObject({
						name: 'TimeoutError',
						__kysely_timing__: 'during query execution',
					})
					return true
				})

				// give the sleep plenty of time to finish, in case the update
				// wasn't actually cancelled on the database side.
				await setTimeout(700)

				const person = await ctx.db
					.selectFrom('person')
					.select('name')
					.where('id', '=', '48856ed4-9f1f-4111-ba7f-6092a1be96eb')
					.executeTakeFirstOrThrow()

				expect(person.name).toBe('moshe')
			},
		)

		it.skipIf(dialect !== 'bun')(
			"should throw, in the background, instead of silently no-op-ing when inflightQueryAbortStrategy is 'cancel query'",
			async () => {
				const consoleErrorSpy = vi
					.spyOn(console, 'error')
					.mockImplementation(() => {})

				await expect(
					sql`update person set name = 'cancelled' from (select pg_sleep(0.5)) as delay where name = 'moshe'`.execute(
						ctx.db,
						{
							signal: AbortSignal.timeout(50),
							inflightQueryAbortStrategy: 'cancel query',
						},
					),
				).rejects.toSatisfy((error) => {
					expect(error).toBeInstanceOf(DOMException)
					expect(error).toMatchObject({
						name: 'TimeoutError',
						message: 'The operation timed out.',
					})
					return true
				})

				// the background inflight-query-abort-handler failure is only
				// reported asynchronously, after the execute() call above
				// already rejected due to the abort signal.
				await setTimeout(100)

				expect(consoleErrorSpy).toHaveBeenCalledWith(
					expect.stringContaining(
						'Cancelling in-flight queries is not supported when running on Bun',
					),
				)

				consoleErrorSpy.mockRestore()

				// give the sleep plenty of time to finish, since Bun can't
				// actually cancel it on the database side.
				await setTimeout(700)

				const person = await ctx.db
					.selectFrom('person')
					.select('name')
					.where('id', '=', '48856ed4-9f1f-4111-ba7f-6092a1be96eb')
					.executeTakeFirstOrThrow()

				expect(person.name).toBe('cancelled')
			},
		)

		it.skipIf(dialect === 'bun')(
			'should stream normally when passed a non-aborted signal',
			async () => {
				const items = []

				const iterator = ctx.db
					.selectFrom('person')
					.selectAll()
					.stream({ signal: new AbortController().signal })

				for await (const item of iterator) {
					items.push(item)
				}

				expect(items).toHaveLength(4)
			},
		)

		it('should reject immediately when streaming with an already aborted signal', async () => {
			const controller = new AbortController()
			const reason = new Error('aborted before streaming')
			controller.abort(reason)

			const iterator = ctx.db
				.selectFrom('person')
				.selectAll()
				.stream({ signal: controller.signal })

			await expect(iterator.next()).rejects.toBe(reason)
		})
	})
}
