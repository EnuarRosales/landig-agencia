-- Hand-written migration (drizzle-kit --custom). Applies after 0014_tidy_juggernaut.sql (AI-001 T-02).
--
-- Grants privileges and documents the AI configuration assistant catalog and versioned master prompts.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.ai_assist_fields IS 'Catalog of assisted textarea and text attributes available for AI improvement across all subscription plans (AI-001 §3.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.ai_assist_prompts IS 'Versioned master prompts, input hints, output constraints and evaluation examples per assisted field; exactly one active version per field_key (AI-001 §3.2).';

