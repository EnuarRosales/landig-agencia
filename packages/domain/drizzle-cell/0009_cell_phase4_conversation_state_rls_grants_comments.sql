-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0008_cell_phase4_conversation_state.sql (BOT-002 T-06, DAT-001 §6.3, §6.8).

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.conversation_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.conversation_state FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_conversation_state_isolation ON admin.conversation_state;
--> statement-breakpoint
CREATE POLICY cell_conversation_state_isolation ON admin.conversation_state
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON TABLE admin.conversation_state IS 'Per-conversation attention engine state (city, name, active product, quantity, stage, last label) kept out of the prompt text under FORCE ROW LEVEL SECURITY (BOT-002 §5).';

