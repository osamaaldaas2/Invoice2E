import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authorization';
import { createAdminClient } from '@/lib/supabase.server';
import { handleApiError } from '@/lib/api-helpers';

/** Administrative queue. Completion records a reviewed, externally executed action;
 * it does not pretend that changing request status erases financial records. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await createAdminClient()
      .from('gdpr_requests')
      .select('*')
      .eq('request_type', 'erasure')
      .in('status', ['pending', 'in_progress', 'failed'])
      .order('requested_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ success: true, requests: data });
  } catch (error) {
    return handleApiError(error, 'Deletion request queue failed');
  }
}

const reviewSchema = z.object({
  id: z.uuid(),
  status: z.enum(['in_progress', 'completed', 'rejected', 'failed']),
  notes: z.string().trim().min(20).max(5000),
  executionConfirmed: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const parsed = reviewSchema.safeParse(await request.json());
    if (
      !parsed.success ||
      (parsed.data.status === 'completed' && !parsed.data.executionConfirmed)
    ) {
      return NextResponse.json(
        { error: 'Provide a review record and confirm execution before completion' },
        { status: 400 }
      );
    }
    const { id, status, notes } = parsed.data;
    const { data, error } = await createAdminClient()
      .from('gdpr_requests')
      .update({
        status,
        notes,
        processed_by: admin.id,
        completed_at: ['completed', 'rejected'].includes(status) ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('request_type', 'erasure')
      .in('status', ['pending', 'in_progress', 'failed'])
      .select('id,status')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: 'Request is missing or already closed' }, { status: 409 });
    return NextResponse.json({ success: true, request: data });
  } catch (error) {
    return handleApiError(error, 'Deletion request review failed');
  }
}
