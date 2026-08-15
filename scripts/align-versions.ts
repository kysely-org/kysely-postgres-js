/**
 * This script aligns the jsr.json version with the package.json version, and
 * the kysely import with the installed kysely version, so JSR publishes use
 * the same versions as npm.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jsrJson from '../jsr.json' with { type: 'json' }
import pkgJson from '../package.json' with { type: 'json' }

const __dirname = dirname(fileURLToPath(import.meta.url))

const { devDependencies, version } = pkgJson

writeFileSync(
	join(__dirname, '../jsr.json'),
	`${JSON.stringify(
		{
			...jsrJson,
			imports: {
				kysely: `jsr:@kysely/kysely@${devDependencies.kysely.replace('^', '')}`,
			},
			version,
		},
		null,
		2,
	)}\n`,
)
