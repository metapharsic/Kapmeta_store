-- Migration: Add stock quantity column to item_availability table
-- Date: 2026-08-27
-- Purpose: Move 86/stock tracking from audit log to real table

ALTER TABLE item_availability ADD COLUMN IF NOT EXISTS stock_qty INTEGER DEFAULT 100;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_item_availability_item_channel ON item_availability(item_id, channel_id);

-- Insert version for schema tracking
INSERT INTO schema_migrations (version) VALUES ('0017_add_stock_to_item_availability') ON CONFLICT DO NOTHING;
