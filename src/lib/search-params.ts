import { stringifySearchWith } from "@tanstack/react-router"

/**
 * Every search value in this app is a plain string, such as a province code or
 * a civil date. TanStack's default serializer writes the code "31" as
 * `%2231%22` and reads `?provinsi=31` back as the number 31, so values stay text.
 * Links shared before this change still carry the JSON quotes; drop them.
 */
export function parseSearchValue(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
}

export function parseSearch(searchStr: string): Record<string, string> {
  const search: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(searchStr)) search[key] ??= parseSearchValue(value)
  return search
}

export const stringifySearch = stringifySearchWith(JSON.stringify)
