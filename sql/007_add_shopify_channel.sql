-- =============================================================
-- Add 'shopify' to the channel_type enum (platform list now:
-- facebook, line, lazada, shopee, tiktok, shopify).
-- Run as a standalone statement (ALTER TYPE ... ADD VALUE cannot run
-- inside a transaction block on older Postgres). Safe to re-run.
-- =============================================================
alter type channel_type add value if not exists 'shopify';
