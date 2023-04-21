# kysely-postgres-js

![Powered by TypeScript](https://img.shields.io/badge/powered%20by-typescript-blue.svg)

[Kysely](https://github.com/koskimas/kysely) dialect for [PostgreSQL](https://www.postgresql.org/) using the [Postgres.js](https://github.com/porsager/postgres) client under the hood.

## Installation

#### NPM 7+

```bash
npm i kysely-postgres-js
```

#### NPM <7

```bash
npm i kysely-postgres-js kysely postgres
```

#### Yarn

```bash
yarn add kysely-postgres-js kysely postgres
```

#### PNPM

```bash
pnpm add kysely-postgres-js kysely postgres
```

### Deno

This package uses/extends some [Kysely](https://github.com/koskimas/kysely) types and classes, which are imported using its NPM package name -- not a relative file path or CDN url. It also uses [Postgres.js] which is imported using its NPM package name -- not a relative file path or CDN url.

To fix that, add an [`import_map.json`](https://deno.land/manual@v1.26.1/linking_to_external_code/import_maps) file.

```json
{
  "imports": {
    "kysely": "https://cdn.jsdelivr.net/npm/kysely@0.23.5/dist/esm/index.js",
    "postgres": "https://deno.land/x/postgres@3.3.4"
  }
}
```

## Usage

```ts
import {Kysely} from 'kysely'
import {PostgresJSDialect} from 'kysely-postgres-js'
import postgres from 'postgres'

interface Database {
  person: {
    id: GeneratedAlways<number>
    first_name: string | null
    last_name: string | null
    age: number
  }
}

const db = new Kysely<Database>({
  dialect: new PostgresJSDialect({
    connectionString: 'postgres://admin@localhost:5434/test',
    options: {
      max: 10,
    },
    postgres,
  }),
})

// or...

const db = new Kysely<Database>({
  dialect: new PostgresJSDialect({
    options: {
      database: 'test',
      host: 'localhost',
      max: 10,
      port: 5434,
      user: 'admin',
    },
    postgres,
  }),
})
```

## Caveats

### Single connection

[Postgres.js](https://github.com/porsager/postgres) doesn't provide single connection getter method/s. To get a single connection, you have to create an instance with a pool that has at most one connection (`max: 1`). This is not aligned with Kysely's current design. As a result, `db.connection()` will not work as expected when using a pool with more than one connection.
If you need to use a single connection, you should instantiate a new `Kysely`
instance with a pool that has at most one connection.

### Transactions

For transactions, this dialect creates additional pools with at most one connection, so `db.transaction().execute(...)` will work as expected. Keep in mind, this means that total number of connections to the database might exceed the pool size passed to Kysely initially.

## License

MIT License, see `LICENSE`
