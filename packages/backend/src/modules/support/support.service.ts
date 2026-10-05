import { prisma } from "@advo/db";
import { conflict, notFound } from "../../common/errors.js";
import { audit } from "../../common/events.js";

const STATES = ["open", "pending", "resolved", "closed"] as const;
export type TicketState = (typeof STATES)[number];

export async function listOwnTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { ownerUserId: userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createTicket(userId: string, input: { subject: string; body: string }) {
  return prisma.supportTicket.create({
    data: { ownerUserId: userId, subject: input.subject, messages: { create: { authorUserId: userId, body: input.body } } },
    include: { messages: true },
  });
}

/** Owners may only reply to their own tickets; Admins may reply to any. */
export async function replyToTicket(actor: { id: string; role: string }, ticketId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || (actor.role !== "ADMIN" && ticket.ownerUserId !== actor.id)) notFound("Ticket not found");
  if (ticket.state === "closed") conflict("Ticket is closed");
  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId, authorUserId: actor.id, body } }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { state: actor.role === "ADMIN" ? "pending" : "open", ...(actor.role === "ADMIN" && !ticket.assignedAdminId ? { assignedAdminId: actor.id } : {}) },
    }),
  ]);
  return message;
}

export async function listAllTickets(state?: string) {
  return prisma.supportTicket.findMany({
    where: { state: state || undefined },
    include: { owner: { select: { id: true, name: true, email: true, role: true } }, messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function setTicketState(adminUserId: string, ticketId: string, state: string) {
  if (!STATES.includes(state as TicketState)) conflict("Unknown ticket state");
  const ticket = await prisma.supportTicket.update({ where: { id: ticketId }, data: { state } });
  await prisma.$transaction((tx) => audit(tx, { actorUserId: adminUserId, action: "support.state_changed", targetType: "SupportTicket", targetId: ticketId, metadata: { state } }));
  return ticket;
}
