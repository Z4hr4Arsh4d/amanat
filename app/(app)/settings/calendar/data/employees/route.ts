// P3 owns. Employees for the booking dropdown, with "Not bookable" reasons (I3.7).
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { bookableEmployees } from "@/lib/integrations/appointments";

export const dynamic = "force-dynamic";
export const GET = handler(async () => Response.json({ items: await bookableEmployees(await requireUser()) }));
