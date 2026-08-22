/** biome-ignore-all lint/performance/noBarrelFile: we're in library context and need an entry point */
export { PostgresJSDialect } from './dialect.js'
export type {
	PostgresJSDialectConfig,
	PostgresJSPendingQuery,
	PostgresJSReservedSql,
	PostgresJSSql,
	PostgresJSSqlOptions,
} from './dialect-config.js'
export {
	PostgresJSDialectError,
	PostgresJSDriver,
} from './driver.js'
