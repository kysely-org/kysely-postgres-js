import * as chai from 'chai'
import chaiSubset from 'chai-subset'
import {
  Kysely,
  sql,
  type ColumnType,
  type Compilable,
  type Generated,
  type InsertObject,
  type KyselyConfig,
  type KyselyPlugin,
  type Logger,
  type SchemaModule,
} from 'kysely'
import postgres from 'postgres'

import {PostgresJSDialect} from '../../src'

chai.use(chaiSubset)

export interface Person {
  id: Generated<number>
  first_name: string | null
  middle_name: ColumnType<string | null, string | undefined, string | undefined>
  last_name: string | null
  gender: 'male' | 'female' | 'other'
}

export interface Pet {
  id: Generated<number>
  name: string
  owner_id: number
  species: 'dog' | 'cat' | 'hamster'
}

export interface Toy {
  id: Generated<number>
  name: string
  price: number
  pet_id: number
}

export interface Database {
  person: Person
  pet: Pet
  toy: Toy
  'toy_schema.toy': Toy
}

interface PersonInsertParams extends InsertObject<Database, 'person'> {
  pets?: PetInsertParams[]
}

interface PetInsertParams extends Omit<Pet, 'id' | 'owner_id'> {
  toys?: Omit<Toy, 'id' | 'pet_id'>[]
}

export interface TestContext {
  config: KyselyConfig
  db: Kysely<Database>
}

const TEST_INIT_TIMEOUT = 5 * 60 * 1000

export const PLUGINS: KyselyPlugin[] = []

export const POOL_SIZE = 20

export const CONFIG: KyselyConfig = {
  dialect: new PostgresJSDialect({
    options: {
      database: 'test',
      host: 'localhost',
      max: POOL_SIZE,
      onnotice() {},
      port: 5434,
      user: 'admin',
    },
    postgres,
  }),
}

export async function initTest(ctx: Mocha.Context, log?: Logger): Promise<TestContext> {
  ctx.timeout(TEST_INIT_TIMEOUT)

  const db = await connect({
    ...CONFIG,
    log,
  })

  await createDatabase(db)

  return {config: CONFIG, db}
}

export async function destroyTest(ctx: TestContext): Promise<void> {
  await dropDatabase(ctx.db)
  await ctx.db.destroy()
}

export async function insertPersons(ctx: TestContext, insertPersons: PersonInsertParams[]): Promise<void> {
  for (const insertPerson of insertPersons) {
    const {pets, ...person} = insertPerson

    const {id} = await ctx.db
      .insertInto('person')
      .values({...person})
      .returning('id')
      .executeTakeFirstOrThrow()

    for (const insertPet of pets ?? []) {
      await insertPetForPerson(ctx, id, insertPet)
    }
  }
}

export const DEFAULT_DATA_SET: PersonInsertParams[] = [
  {
    first_name: 'Jennifer',
    last_name: 'Aniston',
    gender: 'female',
    pets: [{name: 'Catto', species: 'cat'}],
  },
  {
    first_name: 'Arnold',
    last_name: 'Schwarzenegger',
    gender: 'male',
    pets: [{name: 'Doggo', species: 'dog'}],
  },
  {
    first_name: 'Sylvester',
    last_name: 'Stallone',
    gender: 'male',
    pets: [{name: 'Hammo', species: 'hamster'}],
  },
]

export async function insertDefaultDataSet(ctx: TestContext): Promise<void> {
  await insertPersons(ctx, DEFAULT_DATA_SET)
}

export async function clearDatabase(ctx: TestContext): Promise<void> {
  await ctx.db.deleteFrom('toy').execute()
  await ctx.db.deleteFrom('pet').execute()
  await ctx.db.deleteFrom('person').execute()
}

export function testSql(query: Compilable, expected: {sql: string | string[]; parameters: any[]}): void {
  const expectedSql = Array.isArray(expected.sql) ? expected.sql.map((it) => it.trim()).join(' ') : expected.sql
  const sql = query.compile()

  chai.expect(expectedSql).to.equal(sql.sql)
  chai.expect(expected.parameters).to.eql(sql.parameters)
}

async function createDatabase(db: Kysely<Database>): Promise<void> {
  await dropDatabase(db)

  await createTableWithId(db.schema, 'person')
    .addColumn('first_name', 'varchar(255)')
    .addColumn('middle_name', 'varchar(255)')
    .addColumn('last_name', 'varchar(255)')
    .addColumn('gender', 'varchar(50)', (col) => col.notNull())
    .execute()

  await createTableWithId(db.schema, 'pet')
    .addColumn('name', 'varchar(255)', (col) => col.unique().notNull())
    .addColumn('owner_id', 'integer', (col) => col.references('person.id').onDelete('cascade').notNull())
    .addColumn('species', 'varchar(50)', (col) => col.notNull())
    .execute()

  await createTableWithId(db.schema, 'toy')
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('pet_id', 'integer', (col) => col.references('pet.id').notNull())
    .addColumn('price', 'double precision', (col) => col.notNull())
    .execute()

  await db.schema.createIndex('pet_owner_id_index').on('pet').column('owner_id').execute()
}

export function createTableWithId(schema: SchemaModule, tableName: string) {
  return schema
    .createTable(tableName)
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
}

async function connect(config: KyselyConfig): Promise<Kysely<Database>> {
  for (let i = 0; i < TEST_INIT_TIMEOUT; i += 1000) {
    let db: Kysely<Database> | undefined

    try {
      db = new Kysely<Database>(config)
      await sql`select 1`.execute(db)
      return db
    } catch (error) {
      console.error(error)

      if (db) {
        await db.destroy().catch((error) => error)
      }

      console.log('Waiting for the database to become available. Did you remember to run `docker-compose up`?')

      await sleep(1000)
    }
  }

  throw new Error('could not connect to database')
}

async function dropDatabase(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('toy').ifExists().execute()
  await db.schema.dropTable('pet').ifExists().execute()
  await db.schema.dropTable('person').ifExists().execute()
}

export const expect = chai.expect

async function insertPetForPerson(ctx: TestContext, personId: number, insertPet: PetInsertParams): Promise<void> {
  const {toys, ...pet} = insertPet

  const {id} = await ctx.db
    .insertInto('pet')
    .values({...pet, owner_id: personId})
    .returning('id')
    .executeTakeFirstOrThrow()

  for (const toy of toys ?? []) {
    await insertToysForPet(ctx, id, toy)
  }
}

async function insertToysForPet(ctx: TestContext, petId: number, toy: Omit<Toy, 'id' | 'pet_id'>): Promise<void> {
  await ctx.db
    .insertInto('toy')
    .values({...toy, pet_id: petId})
    .executeTakeFirst()
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis))
}
