import { sql } from 'kysely'
import { isBun } from 'std-env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	initTest,
	SUPPORTED_DIALECTS,
	type TestContext,
} from './test-setup.mjs'

for (const dialect of SUPPORTED_DIALECTS) {
	describe.skipIf(dialect === 'bun' && !isBun)(dialect, () => {
		let ctx: TestContext
		const onReserveConnectionSpy = vi.fn()

		beforeEach(async () => {
			ctx = await initTest(dialect, {
				onReserveConnection: onReserveConnectionSpy,
			})
		})

		afterEach(async () => {
			onReserveConnectionSpy.mockReset()
			await ctx.db.destroy()
		})

		it('should invoke `config.onReserveConnection` when a connection is reserved', async () => {
			await Promise.all([
				sql`select 1`.execute(ctx.db),
				sql`select 1`.execute(ctx.db),
			])

			expect(onReserveConnectionSpy).toHaveBeenCalledTimes(2)
		})
	})
}
