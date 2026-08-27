-- Migration: Add outlet status tracking
-- Date: 2026-08-28
-- Purpose: Phase 7 - Store online/offline toggle persistence

CREATE TABLE IF NOT EXISTS outlet_status (
  outlet_id UUID PRIMARY KEY,
  is_online BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

INSERT INTO schema_migrations (version) VALUES ('0021_add_outlet_status') ON CONFLICT DO NOTHING;
