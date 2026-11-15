-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0015_cell_phase7_crm_spec09.sql (SPEC-09 T-01).
--
-- Grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on contact_ratings and contact_addresses,
-- reaffirms RLS on contacts, and documents tables and columns.

GRANT ALL ON TABLE admin.contact_ratings TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.contact_ratings TO mocter_admin;
--> statement-breakpoint
GRANT ALL ON TABLE admin.contact_addresses TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.contact_addresses TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.contact_ratings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contact_ratings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_contact_ratings_isolation ON admin.contact_ratings;
--> statement-breakpoint
CREATE POLICY cell_contact_ratings_isolation ON admin.contact_ratings
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.contact_addresses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contact_addresses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_contact_addresses_isolation ON admin.contact_addresses;
--> statement-breakpoint
CREATE POLICY cell_contact_addresses_isolation ON admin.contact_addresses
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE admin.contact_ratings IS 'Immutable historical 1-5 star ratings and comments per contact under FORCE ROW LEVEL SECURITY (SPEC-09 §7.2).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_ratings.stars IS 'Rating score between 1 and 5 stars.';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_ratings.comment IS 'Optional evaluation note explaining the assigned rating.';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_ratings.rated_by_user_id IS 'Authenticated user UUID who submitted the rating (nullable for automated actors).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_ratings.rated_by_name IS 'Display name or identifier of the evaluator at rating time.';
--> statement-breakpoint
COMMENT ON TABLE admin.contact_addresses IS 'Multi-address book per contact with partial unique default address invariant under FORCE ROW LEVEL SECURITY (SPEC-09 §7.3).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_addresses.label IS 'Short descriptive label for the address such as Casa, Oficina or Bodega.';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_addresses.is_default IS 'Marks the unique primary shipping/contact address per contact enforced by partial unique index.';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.phone_secondary IS 'Optional secondary commercial phone number (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.company_name IS 'Optional company or business name associated with the contact (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.birth_date IS 'Optional birth date of the contact (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.preferred_channel IS 'Preferred communication channel for the contact, defaulting to whatsapp when mobile phone is available (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.last_channel IS 'Normalized omnichannel identifier of the most recent interaction (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.last_inbound_message_at IS 'Timestamp of the latest inbound customer message across any omnichannel inbox (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.last_whatsapp_inbound_at IS 'Timestamp of the latest inbound WhatsApp message used exclusively to compute Meta 24h free-form messaging window (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.current_rating_stars IS 'Cached latest 1-5 star rating for fast table sorting and filtering (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.current_rating_comment IS 'Cached comment from the latest contact rating (SPEC-09 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.converted_to_customer_at IS 'Timestamp when the prospect first transitioned to customer stage (SPEC-09 §7.1).';
