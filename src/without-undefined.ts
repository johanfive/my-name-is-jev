/**
 * A copy of the object without its `undefined` properties.
 * Optional facts stay absent instead of showing up as `undefined` in what Jev and the cache see.
 */
export function withoutUndefined<T extends object>(
  object: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
