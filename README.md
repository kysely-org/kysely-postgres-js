# kysely-postgres-js

![Powered by TypeScript](https://img.shields.io/badge/powered%20by-typescript-blue.svg)

[Kysely](https://github.com/koskimas/kysely) dialect for [PostgreSQL](https://www.postgresql.org/) using the [Postgres.js](https://github.com/porsager/postgres) client library under the hood (version >= 3.4).

This dialect should not be confused with Kysely's built-in PostgreSQL dialect, which uses the [pg](https://github.com/brianc/node-postgres) client library instead.

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
    "kysely": "https://cdn.jsdelivr.net/npm/kysely@0.26.3/dist/esm/index.js",
    "postgres": "https://deno.land/x/postgresjs@v3.4.0/mod.js"
  }
}
```

## Usage

```ts
import {type GeneratedAlways, Kysely} from 'kysely'
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
    postgres: postgres({
      database: 'test',
      host: 'localhost',
      max: 10,
      port: 5434,
      user: 'admin',
    }),
  }),
})
```

## License

MIT License, see `LICENSE`
