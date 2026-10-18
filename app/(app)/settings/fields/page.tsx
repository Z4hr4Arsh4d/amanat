// P1 owns. F2.2 / F2.3 custom fields settings.
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { ui } from "@/components/ui/styles";
import { FieldsClient } from "./FieldsClient";

export default async function FieldsPage() {
  const ctx = await requireUserPage();
  if (!can(ctx, "pipeline.configure")) return <NoAccess what="manage custom fields" />;
  const db = scoped(ctx);
  const [fields, pipelines] = await Promise.all([
    db.fieldDef.findMany({
      where: { deletedAt: null }, orderBy: [{ entity: "asc" }, { order: "asc" }, { label: "asc" }],
      select: { id: true, entity: true, label: true, key: true, type: true, options: true, pipelineId: true },
    }),
    db.pipeline.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  return (
    <section className="space-y-6">
      <div>
        <h1 className={ui.h1}>Custom fields</h1>
        <p className={ui.muted}>
          Add your own fields to contacts, companies and opportunities. New fields show up on every form right away.
          Opportunity fields can be shared by all pipelines or belong to one pipeline.
        </p>
      </div>
      <FieldsClient fields={fields} pipelines={pipelines} />
    </section>
  );
}
