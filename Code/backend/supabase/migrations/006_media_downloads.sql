-- Bring artifacts table up to what the application expects.
-- Migration 004 created the base table; this adds all missing columns.

ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS filename      TEXT,
  ADD COLUMN IF NOT EXISTS bucket        TEXT,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url    TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_source_url
  ON public.artifacts (source_url)
  WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artifacts_conversation_id
  ON public.artifacts (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artifacts_deleted_at
  ON public.artifacts (deleted_at)
  WHERE deleted_at IS NOT NULL;
