import {CompiledQuery, DeleteResult, InsertResult, UpdateResult, sql, type Kysely, type Transaction} from 'kysely'

import {
  CONFIGS,
  DEFAULT_DATA_SET,
  POOL_SIZE,
  TestConfig,
  clearDatabase,
  destroyTest,
  expect,
  forEach,
  initTest,
  insertDefaultDataSet,
  testSql,
  type Database,
  type Person,
  type TestContext,
} from './test-setup'

forEach(CONFIGS).describe('PostgresJSDialect: %s', (config: TestConfig) => {
  let ctx: TestContext
  const executedQueries: CompiledQuery[] = []

  before(async function () {
    ctx = await initTest(this, config.config, (event) => {
      if (event.level === 'query') {
        executedQueries.push(event.query)
      }
    })
  })

  beforeEach(async () => {
    await insertDefaultDataSet(ctx)
    executedQueries.length = 0
  })

  afterEach(async () => {
    await clearDatabase(ctx)
  })

  after(async () => {
    await destroyTest(ctx)
  })

  it('should select one column', async () => {
    const query = ctx.db.selectFrom('person').select('last_name').where('first_name', '=', 'Jennifer')

    testSql(query, {
      sql: 'select "last_name" from "person" where "first_name" = $1',
      parameters: ['Jennifer'],
    })

    const persons = await query.execute()

    expect(persons).to.have.length(1)
    expect(persons).to.eql([{last_name: 'Aniston'}])
  })

  it('should run multiple transactions in parallel', async () => {
    const threads = Array.from({length: 25}).map((_, index) => ({
      id: 1000000 + index + 1,
      fails: Math.random() < 0.5,
    }))

    const results = await Promise.allSettled(threads.map((thread) => executeThread(thread.id, thread.fails)))

    for (let i = 0; i < threads.length; ++i) {
      const [personExists, petExists] = await Promise.all([
        doesPersonExists(threads[i].id),
        doesPetExists(threads[i].id),
      ])

      if (threads[i].fails) {
        expect(personExists).to.equal(false)
        expect(petExists).to.equal(false)
        expect(results[i].status === 'rejected')
      } else {
        expect(personExists).to.equal(true)
        expect(petExists).to.equal(true)
        expect(results[i].status === 'fulfilled')
      }
    }

    async function executeThread(id: number, fails: boolean): Promise<void> {
      await ctx.db.transaction().execute(async (trx) => {
        await insertPerson(trx, id)
        await insertPet(trx, id)

        if (fails) {
          throw new Error()
        }
      })
    }
  })

  it('should set the transaction isolation level', async () => {
    await ctx.db
      .transaction()
      .setIsolationLevel('serializable')
      .execute(async (trx) => {
        await trx
          .insertInto('person')
          .values({
            first_name: 'Foo',
            last_name: 'Barson',
            gender: 'male',
          })
          .execute()
      })

    expect(
      executedQueries.map((it) => ({
        sql: it.sql,
        parameters: it.parameters,
      })),
    ).to.eql([
      {
        sql: 'start transaction isolation level serializable',
        parameters: [],
      },
      {
        sql: 'insert into "person" ("first_name", "last_name", "gender") values ($1, $2, $3)',
        parameters: ['Foo', 'Barson', 'male'],
      },
      {sql: 'commit', parameters: []},
    ])
  })

  it('should be able to start a transaction with a single connection', async () => {
    const result = await ctx.db.connection().execute((db) => {
      return db.transaction().execute((trx) => {
        return trx
          .insertInto('person')
          .values({
            first_name: 'Foo',
            last_name: 'Barson',
            gender: 'male',
          })
          .returning('first_name')
          .executeTakeFirstOrThrow()
      })
    })

    expect(result.first_name).to.equal('Foo')
  })

  it('should stream results', async () => {
    const males: unknown[] = []

    const stream = ctx.db
      .selectFrom('person')
      .select(['first_name', 'last_name', 'gender'])
      .where('gender', '=', 'male')
      .orderBy('first_name')
      .stream()

    for await (const male of stream) {
      males.push(male)
    }

    expect(males).to.have.length(2)
    expect(males).to.eql([
      {
        first_name: 'Arnold',
        last_name: 'Schwarzenegger',
        gender: 'male',
      },
      {
        first_name: 'Sylvester',
        last_name: 'Stallone',
        gender: 'male',
      },
    ])
  })

  it('should stream results with a specific chunk size', async () => {
    const males: unknown[] = []

    const stream = ctx.db
      .selectFrom('person')
      .select(['first_name', 'last_name', 'gender'])
      .where('gender', '=', 'male')
      .orderBy('first_name')
      .stream(1)

    for await (const male of stream) {
      males.push(male)
    }

    expect(males).to.have.length(2)
    expect(males).to.eql([
      {
        first_name: 'Arnold',
        last_name: 'Schwarzenegger',
        gender: 'male',
      },
      {
        first_name: 'Sylvester',
        last_name: 'Stallone',
        gender: 'male',
      },
    ])
  })

  it('should release connection on premature async iterator stop', async () => {
    for (let i = 0; i <= POOL_SIZE + 1; i++) {
      const stream = ctx.db.selectFrom('person').selectAll().stream()

      for await (const _ of stream) {
        break
      }
    }
  })

  it('should release connection on premature async iterator stop when using a specific chunk size', async () => {
    for (let i = 0; i <= POOL_SIZE + 1; i++) {
      const stream = ctx.db.selectFrom('person').selectAll().stream(1)

      for await (const _ of stream) {
        break
      }
    }
  })

  it('should insert multiple rows', async () => {
    const query = ctx.db.insertInto('person').values([
      {
        first_name: 'Foo',
        last_name: 'Bar',
        gender: 'other',
      },
      {
        first_name: 'Baz',
        last_name: 'Spam',
        gender: 'other',
      },
    ])

    testSql(query, {
      sql: 'insert into "person" ("first_name", "last_name", "gender") values ($1, $2, $3), ($4, $5, $6)',
      parameters: ['Foo', 'Bar', 'other', 'Baz', 'Spam', 'other'],
    })

    const result = await query.executeTakeFirst()

    expect(result).to.be.instanceOf(InsertResult)
    expect(result.numInsertedOrUpdatedRows).to.equal(2n)
    expect(result.insertId).to.be.undefined

    const inserted = await ctx.db.selectFrom('person').selectAll().orderBy('id', 'desc').limit(2).execute()

    expect(inserted).to.containSubset([
      {first_name: 'Foo', last_name: 'Bar', gender: 'other'},
      {first_name: 'Baz', last_name: 'Spam', gender: 'other'},
    ])
  })

  it('should insert a row and return data using `returning`', async () => {
    const result = await ctx.db
      .insertInto('person')
      .values({
        gender: 'other',
        first_name: ctx.db.selectFrom('person').select(sql<string>`max(first_name)`.as('max_first_name')),
        last_name: sql`concat(cast(${'Bar'} as varchar), cast(${'son'} as varchar))`,
      })
      .returning(['first_name', 'last_name', 'gender'])
      .executeTakeFirst()

    expect(result).to.eql({
      first_name: 'Sylvester',
      last_name: 'Barson',
      gender: 'other',
    })

    expect(await getNewestPerson(ctx.db)).to.eql({
      first_name: 'Sylvester',
      last_name: 'Barson',
    })
  })

  it('should insert multiple rows and stream returned results', async () => {
    const values = [
      {
        first_name: 'Moses',
        last_name: 'Malone',
        gender: 'male',
      },
      {
        first_name: 'Erykah',
        last_name: 'Badu',
        gender: 'female',
      },
    ] as const

    const stream = ctx.db.insertInto('person').values(values).returning(['first_name', 'last_name', 'gender']).stream()

    const people: Partial<Person>[] = []

    for await (const person of stream) {
      people.push(person)
    }

    expect(people).to.have.length(values.length)
    expect(people).to.eql(values)
  })

  it('should update one row', async () => {
    const query = ctx.db
      .updateTable('person')
      .set({first_name: 'Foo', last_name: 'Barson'})
      .where('gender', '=', 'female')

    testSql(query, {
      sql: 'update "person" set "first_name" = $1, "last_name" = $2 where "gender" = $3',
      parameters: ['Foo', 'Barson', 'female'],
    })

    const result = await query.executeTakeFirst()

    expect(result).to.be.instanceOf(UpdateResult)
    expect(result.numUpdatedRows).to.equal(1n)

    expect(
      await ctx.db
        .selectFrom('person')
        .select(['first_name', 'last_name', 'gender'])
        .orderBy('first_name')
        .orderBy('last_name')
        .execute(),
    ).to.eql([
      {first_name: 'Arnold', last_name: 'Schwarzenegger', gender: 'male'},
      {first_name: 'Foo', last_name: 'Barson', gender: 'female'},
      {first_name: 'Sylvester', last_name: 'Stallone', gender: 'male'},
    ])
  })

  it('should update some rows and return updated rows when `returning` is used', async () => {
    const query = ctx.db
      .updateTable('person')
      .set({last_name: 'Barson'})
      .where('gender', '=', 'male')
      .returning(['first_name', 'last_name'])

    testSql(query, {
      sql: 'update "person" set "last_name" = $1 where "gender" = $2 returning "first_name", "last_name"',
      parameters: ['Barson', 'male'],
    })

    const result = await query.execute()

    expect(result).to.have.length(2)
    expect(Object.keys(result[0]).sort()).to.eql(['first_name', 'last_name'])
    expect(result).to.containSubset([
      {first_name: 'Arnold', last_name: 'Barson'},
      {first_name: 'Sylvester', last_name: 'Barson'},
    ])
  })

  it('should update multiple rows and stream returned results', async () => {
    const stream = ctx.db
      .updateTable('person')
      .set({last_name: 'Nobody'})
      .returning(['first_name', 'last_name', 'gender'])
      .stream()

    const people: Partial<Person>[] = []

    for await (const person of stream) {
      people.push(person)
    }

    expect(people).to.have.length(DEFAULT_DATA_SET.length)
    expect(people).to.eql(
      DEFAULT_DATA_SET.map(({first_name, gender}) => ({
        first_name,
        last_name: 'Nobody',
        gender,
      })),
    )
  })

  it('should delete two rows', async () => {
    const query = ctx.db.deleteFrom('person').where('first_name', '=', 'Jennifer').orWhere('first_name', '=', 'Arnold')

    const result = await query.executeTakeFirst()

    expect(result).to.be.instanceOf(DeleteResult)
    expect(result.numDeletedRows).to.equal(2n)
  })

  it('should return deleted rows when `returning` is used', async () => {
    const query = ctx.db
      .deleteFrom('person')
      .where('gender', '=', 'male')
      .returning(['first_name', 'last_name as last'])

    testSql(query, {
      sql: 'delete from "person" where "gender" = $1 returning "first_name", "last_name" as "last"',
      parameters: ['male'],
    })

    const result = await query.execute()

    expect(result).to.have.length(2)
    expect(Object.keys(result[0]).sort()).to.eql(['first_name', 'last'])
    expect(result).to.containSubset([
      {first_name: 'Arnold', last: 'Schwarzenegger'},
      {first_name: 'Sylvester', last: 'Stallone'},
    ])
  })

  it('should delete all rows and stream returned results', async () => {
    const stream = ctx.db.deleteFrom('person').returning(['first_name', 'last_name', 'gender']).stream()

    const people: Partial<Person>[] = []

    for await (const person of stream) {
      people.push(person)
    }

    expect(people).to.have.length(DEFAULT_DATA_SET.length)
    expect(people).to.eql(
      DEFAULT_DATA_SET.map(({first_name, last_name, gender}) => ({
        first_name,
        last_name,
        gender,
      })),
    )
  })

  async function insertPet(trx: Transaction<Database>, ownerId: number): Promise<void> {
    await trx
      .insertInto('pet')
      .values({
        name: `Pet of ${ownerId}`,
        owner_id: ownerId,
        species: 'cat',
      })
      .execute()
  }

  async function insertPerson(trx: Transaction<Database>, id: number): Promise<void> {
    await trx
      .insertInto('person')
      .values({
        id: id,
        first_name: `Person ${id}`,
        last_name: null,
        gender: 'other',
      })
      .execute()
  }

  async function doesPersonExists(id: number): Promise<boolean> {
    return !!(await ctx.db
      .selectFrom('person')
      .select('id')
      .where('id', '=', id)
      .where('first_name', '=', `Person ${id}`)
      .executeTakeFirst())
  }

  async function doesPetExists(ownerId: number): Promise<boolean> {
    return !!(await ctx.db
      .selectFrom('pet')
      .select('id')
      .where('owner_id', '=', ownerId)
      .where('name', '=', `Pet of ${ownerId}`)
      .executeTakeFirst())
  }

  async function getNewestPerson(db: Kysely<Database>): Promise<Pick<Person, 'first_name' | 'last_name'> | undefined> {
    return await db
      .selectFrom('person')
      .select(['first_name', 'last_name'])
      .where('id', '=', db.selectFrom('person').select(sql<number>`max(id)`.as('max_id')))
      .executeTakeFirst()
  }
})
