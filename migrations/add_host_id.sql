-- Migration: اضافه کردن ستون host_id به جدول tables
-- اجرا در Supabase SQL Editor

ALTER TABLE tables ADD COLUMN IF NOT EXISTS host_id BIGINT;

-- تایید
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'tables' AND column_name = 'host_id';
