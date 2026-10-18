"use server";
// P2 owns. Public lead form submit (F3.1). No login, so this is the one place we touch the DB without a user.
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { act } from "@/lib/core/action";
import { HttpError } from "@/lib/core/errors";
import * as timeline from "@/lib/crm/timeline";
import { findOrCreateContact, normalizePhone } from "@/lib/leads/contact";
import { intake } from "@/lib/leads/intake";
import { rateLimited } from "@/lib/leads/ratelimit";

const Form = z.object({
  slug: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2, "Please enter your name.").max(100, "Your name is too long."),
  phone: z.string().trim().min(1, "Please enter your phone number.").max(30, "That phone number is too long."),
  email: z.union([z.literal(""), z.string().trim().email("That email address does not look right.").max(200)]),
  message: z.string().trim().max(2000, "Your message is too long. Please keep it under 2000 characters.").optional(),
  website: z.string().max(200).optional(), // honeypot: real people leave this empty
});

export async function submitLeadForm(input: z.input<typeof Form>) {
  return act(async () => {
    const data = Form.parse(input);
    if (data.website) return null; // a bot filled the hidden field: pretend it worked

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    if (rateLimited(`form:${ip}`)) throw new HttpError(429, "Too many requests. Please wait a minute and try again.");

    const ws = await prisma.workspace.findUnique({ where: { slug: data.slug }, select: { id: true } });
    if (!ws) throw new HttpError(404, "This form is not available. Check the link you were given.");

    const phone = normalizePhone(data.phone);
    if (!phone) throw new HttpError(422, "That phone number does not look right. Include your area or country code.");

    const contact = await findOrCreateContact({ workspaceId: ws.id, name: data.name, phone, email: data.email || null });
    await intake({ workspaceId: ws.id, contactId: contact.id, source: "WEB_FORM" });
    if (data.message) {
      await timeline.add({
        workspaceId: ws.id, actorId: null, type: "note", contactId: contact.id,
        summary: `Message from web form: ${data.message}`,
      });
    }
    return null;
  });
}
