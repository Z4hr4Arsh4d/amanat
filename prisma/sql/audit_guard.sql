-- F4.3 Tamper resistance: the database itself refuses UPDATE/DELETE on AuditLog.
CREATE OR REPLACE FUNCTION amanat_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (F4.3)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON "AuditLog";
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION amanat_audit_immutable();
