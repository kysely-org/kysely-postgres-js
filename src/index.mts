/** biome-ignore-all lint/performance/noBarrelFile: we're in library context and need an entry point */
export { PostgresJSDialect } from './dialect.mjs'
export type { PostgresJSDialectConfig } from './dialect-config.mjs'
export {
	PostgresJSDialectError,
	PostgresJSDriver,
} from './driver.mjs'
