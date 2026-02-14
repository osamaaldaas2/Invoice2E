-- Migration 033: Add storage bucket RLS policies (MEDIUM)
-- Problem: batch-inputs bucket has no RLS policies on objects.
-- Fix: Add policies so authenticated users can only access their own files.
-- Storage paths follow pattern: {user_id}/{batch_job_id}/...

-- Users can only upload to their own directory
CREATE POLICY "Users can upload to own directory"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'batch-inputs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can only read their own files
CREATE POLICY "Users can read own files"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'batch-inputs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete their own files
CREATE POLICY "Users can delete own files"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'batch-inputs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
