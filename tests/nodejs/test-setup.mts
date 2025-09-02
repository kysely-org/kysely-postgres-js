import { type Generated, Kysely } from 'kysely'
import postgres from 'postgres'

import { PostgresJSDialect } from '../..'

const CONNECTION_STRING = 'postgres://postgres:postgres@localhost:5432/main'

const DIALECTS = {
	v3: new PostgresJSDialect({
		postgres: () => postgres(CONNECTION_STRING),
	}),
} as const

export const SUPPORTED_DIALECTS = Object.keys(
	DIALECTS,
) as (keyof typeof DIALECTS)[]

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
	dialect: keyof typeof DIALECTS,
): Promise<TestContext> {
	return { db: new Kysely({ dialect: DIALECTS[dialect] }) }
}

export async function resetState(): Promise<void> {
	const sql = postgres(CONNECTION_STRING, { max: 1 })

	await sql`
	  drop table if exists person;
	  create table person (id uuid primary key default gen_random_uuid(), name varchar(255) unique not null);
	  insert into person (id, name) values ('48856ed4-9f1f-4111-ba7f-6092a1be96eb', 'moshe'), ('28175ebc-02ec-4c87-9a84-b3d25193fefa', 'haim'), ('cbbffbea-47d5-40ec-a98d-518b48e2bb5d', 'rivka'), ('d2b76f94-1a33-4b8c-9226-7d35390b1112', 'henry');
	`

	await sql.end()
}
