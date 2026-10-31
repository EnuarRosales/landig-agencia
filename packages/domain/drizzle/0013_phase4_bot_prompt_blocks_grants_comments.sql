-- Hand-written migration (drizzle-kit --custom). Applies after 0012_phase4_bot_prompt_blocks.sql (BOT-002 T-02).
--
-- Grants privileges and documents the versioned platform prompt blocks table.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
COMMENT ON TABLE admin.bot_prompt_blocks IS 'Versioned platform prompt blocks (es/en) composed at runtime by the attention engine; one active version per block_key (BOT-002 §3).';

