import type { MergeResult } from './types'

let sessionPassword = ''

export function setPassword(password: string) {
  sessionPassword = password
}

async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/merge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-reconciler-password': sessionPassword,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'API call failed')
  }
  return res.json()
}

export async function mergeContacts(
  survivorId: string, loserId: string, fieldOverrides: Record<string, string>, mergedBy: string
): Promise<MergeResult> {
  return callApi({ action: 'merge_contacts', survivor_id: survivorId, loser_id: loserId, field_overrides: fieldOverrides, merged_by: mergedBy })
}

export async function mergeChildren(
  survivorId: string, loserId: string, fieldOverrides: Record<string, string>, mergedBy: string
): Promise<MergeResult> {
  return callApi({ action: 'merge_children', survivor_id: survivorId, loser_id: loserId, field_overrides: fieldOverrides, merged_by: mergedBy })
}

export async function dismissDuplicate(
  entityType: 'neon_account' | 'child', recordAId: string, recordBId: string, dismissedBy: string
): Promise<void> {
  await callApi({ action: 'dismiss_duplicate', entity_type: entityType, record_a_id: recordAId, record_b_id: recordBId, dismissed_by: dismissedBy })
}

export async function validatePassword(password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reconciler-password': password },
      body: JSON.stringify({ action: 'validate' }),
    })
    return res.status !== 401
  } catch { return false }
}
