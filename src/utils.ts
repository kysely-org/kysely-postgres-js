export function freeze<T>(obj: T): Readonly<T> {
  return Object.freeze(obj)
}
