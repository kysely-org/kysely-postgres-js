export class PostgresJSDialectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PostgresJSDialectError'
  }
}
