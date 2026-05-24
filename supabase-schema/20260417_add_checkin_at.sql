ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ;

UPDATE public.transactions
SET checkin_at = created_at
WHERE checkin_at IS NULL;

