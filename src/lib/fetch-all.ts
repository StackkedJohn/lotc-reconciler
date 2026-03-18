import { supabase } from './supabase'

const PAGE_SIZE = 1000

/**
 * Fetch all rows from a table, paginating past Supabase's default 1000-row limit.
 */
export async function fetchAll<T>(
  table: string,
  select: string
): Promise<T[]> {
  const all: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    all.push(...(data as unknown as T[]))

    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}
