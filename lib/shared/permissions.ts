// APPEND-ONLY. Add new permission keys at the end. Never rename or remove.
export const PERMISSIONS = {
  "crm.view": "View CRM records",
  "crm.create": "Create CRM records",
  "crm.edit": "Edit CRM records",
  "crm.delete": "Delete CRM records",
  "crm.export": "Export CRM records",
  "opportunity.value.view": "See opportunity values",
  "pipeline.configure": "Configure pipelines and custom fields",
  "assignment.manage": "Manage assignment rules",
  "leads.reassign": "Reassign leads manually",
  "integrations.manage": "Connect, change or remove integrations",
  "audit.view": "View the audit history",
  "users.manage": "Invite users and manage roles",
  "dashboard.company": "See company-wide dashboard figures",
  "payments.request": "Create payment requests",
  "appointments.book": "Book appointments",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

// Default permissions for the seeded "Manager" and "Sales" roles.
export const MANAGER_DEFAULT: Permission[] = [
  "crm.view", "crm.create", "crm.edit", "crm.export", "opportunity.value.view",
  "leads.reassign", "dashboard.company", "payments.request", "appointments.book",
];
export const SALES_DEFAULT: Permission[] = [
  "crm.view", "crm.create", "crm.edit", "payments.request", "appointments.book",
];
