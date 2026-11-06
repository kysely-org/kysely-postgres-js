import { type Generated, Kysely } from 'kysely'
import postgres from 'postgres'
import postgres4 from 'postgres4'
import { isBun } from 'std-env'

import {
	PostgresJSDialect,
	type PostgresJSDialectConfig,
	type PostgresJSSql,
} from '..'

export const CONNECTION_STRING =
	'postgres://postgres:postgres@localhost:5432/main'

export const SUPPORTED_DIALECTS = ['v3', 'v4', 'bun'] as const

/**
 * The `postgres` module for a postgres.js dialect. v4 is typed as v3, so tests
 * can treat both the same.
 */
export function getPostgresJs(
	dialect: (typeof SUPPORTED_DIALECTS)[number],
): typeof postgres {
	return dialect === 'v4' ? (postgres4 as unknown as typeof postgres) : postgres
}

const getDialect = (
	dialect: (typeof SUPPORTED_DIALECTS)[number],
	config?: Omit<PostgresJSDialectConfig, 'postgres'>,
) =>
	(
		({
			bun: isBun
				? new PostgresJSDialect({
						...config,
						postgres: () =>
							import('bun').then(
								(mod) =>
									new mod.SQL(CONNECTION_STRING) as unknown as PostgresJSSql,
							),
					})
				: undefined,
			v3: new PostgresJSDialect({
				...config,
				postgres: () =>
					postgres(CONNECTION_STRING, {
						onnotice() {},
					}),
			}),
			v4: new PostgresJSDialect({
				...config,
				postgres: () =>
					postgres4(CONNECTION_STRING, {
						onnotice() {},
					}) as unknown as PostgresJSSql,
			}),
		}) as const
	)[dialect]

export interface TestContext {
	db: Kysely<Database>
}

export interface Database {
	person: {
		id: Generated<string>
		name: string
	}
}

export async function initTest(
	dialect: (typeof SUPPORTED_DIALECTS)[number],
	config?: Omit<PostgresJSDialectConfig, 'postgres'>,
): Promise<TestContext> {
	// biome-ignore lint/style/noNonNullAssertion: we will handle it elsewhere.
	return { db: new Kysely({ dialect: getDialect(dialect, config)! }) }
}

/**
 * Bun >= 1.3.13 has a regression where an `AbortSignal.timeout` signal never
 * aborts once all of its abort listeners have been removed - the backing timer
 * is garbage-collected when the listener count drops to zero. Kysely adds and
 * removes a listener per execution stage, so such signals die before the query
 * stage. Signals backed by `AbortController` are unaffected, so we mimic
 * `AbortSignal.timeout` with one on affected Bun versions.
 */
export function timeoutSignal(milliseconds: number): AbortSignal {
	if (isBun && Bun.semver.satisfies(Bun.version, '>=1.3.13')) {
		const controller = new AbortController()

		setTimeout(
			() =>
				controller.abort(
					new DOMException('The operation timed out.', 'TimeoutError'),
				),
			milliseconds,
		)

		return controller.signal
	}

	return AbortSignal.timeout(milliseconds)
}

export async function resetState(): Promise<void> {
	const sql = postgres(CONNECTION_STRING, { max: 1 })

	await sql.unsafe(
		`
	  drop table if exists person;
	  create table person (id uuid primary key default gen_random_uuid(), name varchar(255) unique not null);
	  insert into person (id, name) values ('48856ed4-9f1f-4111-ba7f-6092a1be96eb', 'moshe'), ('28175ebc-02ec-4c87-9a84-b3d25193fefa', 'haim'), ('cbbffbea-47d5-40ec-a98d-518b48e2bb5d', 'rivka'), ('d2b76f94-1a33-4b8c-9226-7d35390b1112', 'henry');
	`,
		[],
		{ prepare: false },
	)

	await sql.end()
}
