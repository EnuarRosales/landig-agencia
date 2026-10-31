-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0004_cell_phase3_crm_prospects.sql (CRM-001 T-02, DAT-001 §6.3, §6.8).
--
-- Grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on all Phase 3 CRM cell tables,
-- and documents tables and columns.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_contacts_isolation ON admin.contacts;
--> statement-breakpoint
CREATE POLICY cell_contacts_isolation ON admin.contacts
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.prospect_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.prospect_consents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_prospect_consents_isolation ON admin.prospect_consents;
--> statement-breakpoint
CREATE POLICY cell_prospect_consents_isolation ON admin.prospect_consents
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.privacy_notices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.privacy_notices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_privacy_notices_isolation ON admin.privacy_notices;
--> statement-breakpoint
CREATE POLICY cell_privacy_notices_isolation ON admin.privacy_notices
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.contact_memories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contact_memories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_contact_memories_isolation ON admin.contact_memories;
--> statement-breakpoint
CREATE POLICY cell_contact_memories_isolation ON admin.contact_memories
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON TABLE admin.contacts IS 'Authoritative multi-channel contacts and CRM prospects under FORCE ROW LEVEL SECURITY (CRM-001 §3.1, DAT-001 §6.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.prospect_consents IS 'Append-only audit trail of data treatment and commercial consents under Ley 1581 Habeas Data and FORCE ROW LEVEL SECURITY (CRM-001 §3.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.privacy_notices IS 'Tenant-scoped versioned privacy notice templates and published texts under FORCE ROW LEVEL SECURITY (CRM-001 §3.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.contact_memories IS 'Decoupled contact profiles and episodic memories with halfvec(1536) embeddings under FORCE ROW LEVEL SECURITY (CRM-001 §3.4, DAT-001 §6.3).';
