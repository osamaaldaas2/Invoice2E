-- Apply before deploying the matching application. Existing cookies must sign in again.
CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user ON public.auth_sessions(user_id);
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_sessions TO service_role;

CREATE FUNCTION public.resolve_active_session(p_session_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('role', u.role, 'email', u.email,
    'first_name', u.first_name, 'last_name', u.last_name)
  FROM auth_sessions s JOIN users u ON u.id = s.user_id
  WHERE s.id = p_session_id AND s.user_id = p_user_id
    AND s.expires_at > now() AND NOT coalesce(u.is_banned, false);
$$;

CREATE FUNCTION public.invalidate_user_sessions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    DELETE FROM auth_sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invalidate_user_sessions AFTER UPDATE OF password_hash, is_banned
ON public.users FOR EACH ROW EXECUTE FUNCTION public.invalidate_user_sessions();

CREATE FUNCTION public.consume_password_reset(p_token_hash text, p_password_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t password_reset_tokens%ROWTYPE;
BEGIN
  SELECT * INTO t FROM password_reset_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Serialize different reset tokens for the same account before locking tokens.
  PERFORM 1 FROM users WHERE id=t.user_id FOR UPDATE;
  SELECT * INTO t FROM password_reset_tokens WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR t.used_at IS NOT NULL OR t.expires_at <= now() THEN RETURN false; END IF;
  UPDATE users SET password_hash = p_password_hash, updated_at = now() WHERE id = t.user_id;
  UPDATE password_reset_tokens SET used_at = now() WHERE user_id = t.user_id AND used_at IS NULL;
  RETURN true;
END; $$;

-- A business payment, not a delivery event, is the unit of idempotency.
CREATE TABLE public.payment_credit_receipts (
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  payment_id text NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, payment_id), UNIQUE (transaction_id)
);
ALTER TABLE public.payment_credit_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_credit_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_credit_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_credit_receipts TO service_role;

CREATE FUNCTION public.settle_payment_credits(
  p_user_id uuid, p_amount integer, p_event_id text, p_provider text,
  p_event_type text, p_payment_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t payment_transactions%ROWTYPE; balance integer;
BEGIN
  IF p_amount <= 0 OR p_payment_id IS NULL OR p_provider NOT IN ('stripe','paypal') THEN
    RAISE EXCEPTION 'Invalid payment parameters';
  END IF;
  SELECT * INTO STRICT t FROM payment_transactions
    WHERE user_id = p_user_id AND payment_method = p_provider AND
      ((p_provider = 'stripe' AND stripe_session_id = p_payment_id) OR
       (p_provider = 'paypal' AND paypal_order_id = p_payment_id)) FOR UPDATE;
  IF t.credits_purchased <> p_amount THEN RAISE EXCEPTION 'Payment credits mismatch'; END IF;
  IF t.payment_status = 'completed' OR EXISTS (
    SELECT 1 FROM payment_credit_receipts WHERE transaction_id = t.id
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;
  IF t.payment_status NOT IN ('pending','processing') THEN
    RAISE EXCEPTION 'Payment is not payable';
  END IF;
  -- Preserve delivery markers from older deployments when a status write failed.
  IF EXISTS (SELECT 1 FROM webhook_events WHERE provider = p_provider
      AND event_id IN (p_event_id, 'verify_' || p_payment_id)) THEN
    UPDATE payment_transactions SET payment_status = 'completed', updated_at = now() WHERE id = t.id;
    INSERT INTO payment_credit_receipts VALUES (p_provider, p_payment_id, t.id, p_user_id, now());
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;
  INSERT INTO payment_credit_receipts VALUES (p_provider, p_payment_id, t.id, p_user_id, now());
  INSERT INTO user_credits(user_id, available_credits, used_credits) VALUES (p_user_id,p_amount,0)
    ON CONFLICT(user_id) DO UPDATE SET available_credits = user_credits.available_credits + EXCLUDED.available_credits,
      updated_at = now() RETURNING available_credits INTO balance;
  INSERT INTO credit_transactions(user_id, amount, transaction_type, source, reference_id, balance_after, idempotency_key)
    VALUES (p_user_id,p_amount,'credit',p_provider,p_payment_id,balance,'payment:' || p_provider || ':' || p_payment_id);
  INSERT INTO webhook_events(event_id,provider,event_type,user_id,credits_added)
    VALUES(p_event_id,p_provider,p_event_type,p_user_id,p_amount);
  UPDATE payment_transactions SET payment_status='completed',updated_at=now() WHERE id=t.id;
  RETURN jsonb_build_object('success',true,'already_processed',false,'new_balance',balance);
END; $$;

-- Row lock, deduction and marker commit together. An RPC failure is never a paid job.
ALTER TABLE public.credit_transactions ALTER COLUMN source TYPE text;
-- Legacy batch_jobs has an update timestamp trigger but omitted its target column.
ALTER TABLE public.batch_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION public.deduct_batch_credits(p_job_id uuid, p_user_id uuid, p_amount integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j batch_jobs%ROWTYPE;
BEGIN
  SELECT * INTO STRICT j FROM batch_jobs WHERE id=p_job_id AND user_id=p_user_id FOR UPDATE;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF j.credits_deducted THEN RETURN true; END IF;
  IF NOT safe_deduct_credits(p_user_id,p_amount,('batch:deduct:' || p_job_id)::varchar,
      'batch:deduct:' || p_job_id) THEN RETURN false; END IF;
  UPDATE batch_jobs SET credits_deducted=true WHERE id=p_job_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.refund_credits_idempotent(
  p_user_id uuid, p_amount int, p_reason text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE balance integer; old_amount integer; old_user uuid;
BEGIN
  IF p_amount <= 0 OR nullif(p_idempotency_key,'') IS NULL THEN RAISE EXCEPTION 'Invalid refund'; END IF;
  -- Serialize by refund identity before checking the ledger (including cross-user collisions).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  SELECT amount,user_id INTO old_amount,old_user FROM credit_transactions WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF old_amount <> p_amount OR old_user <> p_user_id THEN RAISE EXCEPTION 'Refund identity mismatch'; END IF;
    RETURN jsonb_build_object('status','already_refunded');
  END IF;
  UPDATE user_credits SET available_credits=available_credits+p_amount,updated_at=now()
    WHERE user_id=p_user_id RETURNING available_credits INTO balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credits account missing'; END IF;
  INSERT INTO credit_transactions(user_id,amount,transaction_type,source,balance_after,idempotency_key)
    VALUES(p_user_id,p_amount,'refund',p_reason,balance,p_idempotency_key);
  RETURN jsonb_build_object('status','refunded','amount',p_amount);
END; $$;

-- Schedules are opt-in. Destructive policies need an entity-specific implementation.
CREATE TABLE IF NOT EXISTS public.retention_schedules (
  policy_id text PRIMARY KEY, entity_type text NOT NULL,
  action text NOT NULL CHECK (action = 'archive'),
  enabled boolean NOT NULL DEFAULT false, next_run_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retention_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_schedules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_schedules FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.retention_schedules TO service_role;
ALTER TABLE public.invoice_extractions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.invoice_conversions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
-- Clients may only submit a new request in its initial state.
DROP POLICY IF EXISTS gdpr_requests_insert ON public.gdpr_requests;
CREATE POLICY gdpr_requests_insert ON public.gdpr_requests FOR INSERT TO authenticated
  WITH CHECK (subject_id=auth.uid() AND status='pending' AND processed_by IS NULL
    AND completed_at IS NULL AND notes IS NULL);

-- Repair the conversion completion race for the signature used by the server.
CREATE OR REPLACE FUNCTION convert_invoice_with_credit_deduction(
    p_user_id UUID,
    p_conversion_id UUID,
    p_credits_cost INTEGER DEFAULT 1,
    p_validation_status TEXT DEFAULT NULL,
    p_validation_errors JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_available_credits INTEGER;
    v_updated_credits INTEGER;
    v_conversion_exists BOOLEAN;
    v_current_status TEXT;
BEGIN
    IF p_credits_cost <= 0 THEN RAISE EXCEPTION 'Invalid credit cost'; END IF;
    -- Serialize repeated conversion attempts before checking the completion marker.
    PERFORM 1 FROM invoice_conversions WHERE id=p_conversion_id AND user_id=p_user_id FOR UPDATE;
    -- 1. Check if conversion exists and belongs to user
    SELECT EXISTS(
        SELECT 1 FROM invoice_conversions
        WHERE id = p_conversion_id AND user_id = p_user_id
    ) INTO v_conversion_exists;

    IF NOT v_conversion_exists THEN
        RAISE EXCEPTION 'Conversion % not found for user %', p_conversion_id, p_user_id;
    END IF;

    -- 2. Check current status to prevent double deduction
    SELECT conversion_status INTO v_current_status
    FROM invoice_conversions
    WHERE id = p_conversion_id;

    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already completed');
    END IF;

    -- 3. Lock user credits row and check balance
    SELECT available_credits INTO v_available_credits
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_available_credits IS NULL THEN
        RAISE EXCEPTION 'User credits record not found';
    END IF;

    IF v_available_credits < p_credits_cost THEN
        RAISE EXCEPTION 'Insufficient credits: % available, % required', v_available_credits, p_credits_cost;
    END IF;

    -- 4. Deduct credits
    UPDATE user_credits
    SET available_credits = available_credits - p_credits_cost,
        used_credits = used_credits + p_credits_cost,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO v_updated_credits;

    -- 5. Update conversion status locally (including validation results if provided)
    UPDATE invoice_conversions
    SET conversion_status = 'completed',
        credits_used = p_credits_cost,
        validation_status = COALESCE(p_validation_status, validation_status),
        validation_errors = COALESCE(p_validation_errors, validation_errors),
        updated_at = NOW()
    WHERE id = p_conversion_id;

    -- 6. Log transaction
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (
        p_user_id,
        'deduct_credits_conversion',
        'invoice_conversions',
        p_conversion_id::text,
        jsonb_build_object(
            'cost', p_credits_cost,
            'remaining', v_updated_credits,
            'validation_status', p_validation_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'remaining_credits', v_updated_credits,
        'deducted', p_credits_cost
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'code', SQLSTATE
        );
END;
$$;

-- Restrict every privileged public function, including old overloads.
-- RLS helper predicates still need authenticated EXECUTE; they never mutate data.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    IF f.proname IN ('is_admin','is_super_admin') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
    END IF;
  END LOOP;
END; $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
