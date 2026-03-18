import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const password = req.headers.get('x-reconciler-password')
  if (password !== process.env.RECONCILER_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const body = await req.json()
  const { action, ...params } = body

  try {
    if (action === 'merge_contacts') {
      const { data, error } = await supabase.rpc('merge_contacts', {
        p_survivor_id: params.survivor_id,
        p_loser_id: params.loser_id,
        p_field_overrides: params.field_overrides || {},
        p_merged_by: params.merged_by || 'unknown',
      })
      if (error) throw error
      return Response.json(data)
    }

    if (action === 'merge_children') {
      const { data, error } = await supabase.rpc('merge_children', {
        p_survivor_id: params.survivor_id,
        p_loser_id: params.loser_id,
        p_field_overrides: params.field_overrides || {},
        p_merged_by: params.merged_by || 'unknown',
      })
      if (error) throw error
      return Response.json(data)
    }

    if (action === 'dismiss_duplicate') {
      const ids = [params.record_a_id, params.record_b_id].sort()
      const { error } = await supabase.from('dismissed_duplicates').insert({
        entity_type: params.entity_type,
        record_a_id: ids[0],
        record_b_id: ids[1],
        dismissed_by: params.dismissed_by || 'unknown',
      })
      if (error) throw error
      return Response.json({ success: true })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return Response.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
