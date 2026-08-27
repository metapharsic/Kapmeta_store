-- Migration: Add version column to channel_item_mapping for optimistic locking
-- Date: 2026-08-27
-- Purpose: Phase 4 - Channel Item Status Real Tables

ALTER TABLE channel_item_mapping ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_channel_item_mapping_outlet_channel ON channel_item_mapping(outlet_id, channel_code);

INSERT INTO schema_migrations (version) VALUES ('0019_add_channel_item_mapping_version') ON CONFLICT DO NOTHING;
