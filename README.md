![A Kysely-branded yellow duck canoeing with a Postgres.js-branded grey elephant in the river](./assets/banner.png)

[![NPM Version](https://img.shields.io/npm/v/kysely-postgres-js?style=flat&label=latest)](https://github.com/kysely-org/kysely-postgres-js/releases/latest)
[![Tests](https://github.com/kysely-org/kysely-postgres-js/actions/workflows/test.yml/badge.svg)](https://github.com/kysely-org/kysely-postgres-js)
[![License](https://img.shields.io/github/license/kysely-org/kysely-postgres-js?style=flat)](https://github.com/kysely-org/kysely-postgres-js/blob/main/LICENSE)
[![Issues](https://img.shields.io/github/issues-closed/kysely-org/kysely-postgres-js?logo=github)](https://github.com/kysely-org/kysely-postgres-js/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc)
[![Pull Requests](https://img.shields.io/github/issues-pr-closed/kysely-org/kysely-postgres-js?label=PRs&logo=github&style=flat)](https://github.com/kysely-org/kysely-postgres-js/pulls?q=is%3Apr+is%3Aopen+sort%3Aupdated-desc)
![GitHub contributors](https://img.shields.io/github/contributors/kysely-org/kysely-postgres-js)
[![Downloads](https://img.shields.io/npm/dw/kysely-postgres-js?logo=npm)](https://www.npmjs.com/package/kysely-postgres-js)

###### Join the discussion ⠀⠀⠀⠀⠀⠀⠀

[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=flat&logo=discord&logoColor=white)](https://discord.gg/xyBJ3GwvAm)
[![Bluesky](https://img.shields.io/badge/Bluesky-0285FF?style=flat&logo=Bluesky&logoColor=white)](https://bsky.app/profile/kysely.dev)

`kysely-postgres-js` offers a [Kysely](https://github.com/koskimas/kysely) dialect for [PostgreSQL](https://www.postgresql.org/) that supports the [Postgres.js](https://github.com/porsager/postgres) client library (version >= 3.4) and [Bun](https://bun.com/)'s (version >= 1.2) [SQL](https://bun.com/docs/api/sql) native binding.

This dialect should not be confused with [Kysely](https://github.com/koskimas/kysely)'s core [PostgreSQL](https://www.postgresql.org/) dialect, which supports the significantly more adopted [pg](https://github.com/brianc/node-postgres) client library and [Neon](https://neon.com)'s WebSockets [Pool](https://neon.com/docs/serverless/serverless-driver#use-the-driver-over-websockets) instead. Both of these dialects are maintained by members of the [Kysely](https://github.com/koskimas/kysely) core team and are production ready.

## Installation

### Node.js

```bash
npm install kysely-postgres-js postgres kysely
```

```bash
pnpm add kysely-postgres-js postgres kysely
```

```bash
yarn add kysely-postgres-js postgres kysely
```

### Other runtimes

```bash
deno add npm:kysely-postgres-js npm:postgres npm:kysely
```

```bash
bun add kysely-postgres-js kysely
```

## Usage

### Node.js

```ts
import { type GeneratedAlways, Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
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

const people = await db.selectFrom("person").selectAll().execute();
```

### Bun

```ts
import { SQL } from 'bun'
import { type GeneratedAlways, Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'

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
    postgres: new SQL({
      database: 'test',
      host: 'localhost',
      max: 10,
      port: 5434,
      user: 'admin',
    }),
  }),
})

const people = await db.selectFrom("person").selectAll().execute();
```