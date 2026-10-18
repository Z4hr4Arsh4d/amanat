// P2 owns. Filter JSON → Prisma where (F2.6). Fields are whitelisted per entity (no injection).
export type FilterOp = "eq" | "neq" | "in" | "has" | "gt" | "lt" | "between" | "contains";
export type Filter = { field: string; op: FilterOp; value: unknown };
