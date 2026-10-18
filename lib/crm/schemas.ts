// P1 owns. Shared Zod pieces for CRM inputs (Q3).
import { z } from "zod";

export const Id = z.string().trim().min(1, "Missing id").max(64);
export const Version = z.number().int().min(0);
export const CustomIn = z.record(z.string(), z.unknown()).optional();
export const NullableId = Id.nullable().optional();
export const Currency = z.enum(["PKR", "USD"], "Currency must be PKR or USD");
export const Money = z.coerce.number("Value must be a number").min(0, "Value can't be negative").max(999_999_999_999, "Value is too large");
