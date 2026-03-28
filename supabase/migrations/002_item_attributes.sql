-- =====================================================================
-- MIGRATION 002: Item Attributes
-- Run in Supabase SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS item_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id UUID NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ranking_id, item_name)
);

-- Enable RLS
ALTER TABLE item_attributes ENABLE ROW LEVEL SECURITY;

-- Users can manage attributes on their own rankings
CREATE POLICY "Users can manage own item attributes"
  ON item_attributes
  FOR ALL
  USING (
    ranking_id IN (SELECT id FROM rankings WHERE user_id = auth.uid())
  )
  WITH CHECK (
    ranking_id IN (SELECT id FROM rankings WHERE user_id = auth.uid())
  );

-- Public rankings' attributes are readable by all
CREATE POLICY "Public ranking attributes are readable"
  ON item_attributes
  FOR SELECT
  USING (
    ranking_id IN (SELECT id FROM rankings WHERE is_public = true)
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_item_attributes_ranking ON item_attributes(ranking_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_item_attributes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER item_attributes_updated_at
  BEFORE UPDATE ON item_attributes
  FOR EACH ROW
  EXECUTE FUNCTION update_item_attributes_updated_at();
