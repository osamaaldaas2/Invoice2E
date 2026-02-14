-- Migration 038: Add missing UPDATE policy on invoice_extractions
-- Problem: Table only has INSERT + SELECT policies. User-scoped clients
-- cannot update extractions (used in review, convert, batch-download routes).
-- RLS silently returns 0 rows on update, causing .single() to fail.

CREATE POLICY "extractions_update"
    ON invoice_extractions
    FOR UPDATE
    USING ((user_id)::text = (SELECT auth.uid())::text)
    WITH CHECK ((user_id)::text = (SELECT auth.uid())::text);
