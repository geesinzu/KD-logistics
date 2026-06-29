import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { shipments, trackingEvents, branches, thirdPartyLogistics } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery } from "./middleware";

// Extract tracking ID from message (format: KEDI-XX2606###)
function extractTrackingId(text: string): string | null {
  const match = text.match(/KEDI-[A-Z]{2}\d{6}\d{3,4}/i);
  return match ? match[0].toUpperCase() : null;
}

// Detect question intent
function detectIntent(text: string): "track" | "delivery_date" | "status" | "location" | "general" {
  const lower = text.toLowerCase();
  if (lower.includes("when") && (lower.includes("deliver") || lower.includes("arrive"))) return "delivery_date";
  if (lower.includes("where") || lower.includes("location") || lower.includes("reach")) return "location";
  if (lower.includes("status") || lower.includes("progress") || lower.includes("how far")) return "status";
  if (lower.includes("track") || lower.includes("find") || lower.includes("shipment")) return "track";
  return "general";
}

function formatDate(date: Date | null): string {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString("en-NG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const chatRouter = createRouter({
  // AI Chat endpoint
  ask: publicQuery
    .input(z.object({
      message: z.string().min(1),
      phone: z.string().optional(), // optional: for authenticated users
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const trackingId = extractTrackingId(input.message);
      const intent = detectIntent(input.message);

      // If no tracking ID found, ask for it
      if (!trackingId) {
        return {
          reply: "Hello! I'm KEDI's shipment assistant. To help you track a shipment, please provide the tracking ID (e.g., KEDI-EN2606284). How can I help you today?",
          quickActions: ["Check my shipment", "When will my shipment arrive?", "Where is my shipment?"],
        };
      }

      // Look up shipment
      const shipmentResult = await db.select().from(shipments)
        .where(eq(shipments.trackingId, trackingId))
        .limit(1);

      if (!shipmentResult[0]) {
        return {
          reply: `I couldn't find a shipment with tracking ID **${trackingId}**. Please double-check the tracking ID and try again.`,
          quickActions: ["Try another tracking ID"],
        };
      }

      const s = shipmentResult[0];

      // Get related info
      const destBranch = s.destBranchId
        ? await db.select().from(branches).where(eq(branches.id, s.destBranchId)).limit(1)
        : [];
      const tpl = s.tplId
        ? await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, s.tplId)).limit(1)
        : [];
      const recentEvents = await db.select().from(trackingEvents)
        .where(eq(trackingEvents.shipmentId, s.id))
        .orderBy(desc(trackingEvents.createdAt))
        .limit(3);

      const branchName = destBranch[0]?.name || "Unknown";
      const tplName = tpl[0]?.name || "Not assigned yet";
      const estimatedDate = s.estimatedDeliveryDate
        ? formatDate(new Date(s.estimatedDeliveryDate))
        : "Not set";

      // Build response based on intent
      let reply = "";

      switch (intent) {
        case "delivery_date":
          reply = `**Shipment ${trackingId}**\n\n`;
          reply += `📅 **Estimated Delivery:** ${estimatedDate}\n`;
          reply += `📍 **Destination:** ${branchName}\n`;
          reply += `🚚 **Handler:** ${tplName}\n`;
          reply += `📊 **Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n\n`;
          if (recentEvents[0]) {
            reply += `**Latest Update:** ${recentEvents[0].notes || "No details"} (${formatDate(recentEvents[0].createdAt)})`;
          }
          break;

        case "location":
          reply = `**Shipment ${trackingId} - Current Location**\n\n`;
          reply += `📊 **Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
          reply += `🚚 **Handler:** ${tplName}\n`;
          reply += `📍 **Destination:** ${branchName}\n\n`;
          if (recentEvents[0]) {
            const ev = recentEvents[0];
            reply += `**Last Update:** ${ev.notes || "Status updated"}\n`;
            if (ev.location) reply += `**Location:** ${ev.location}\n`;
            reply += `**Time:** ${formatDate(ev.createdAt)}`;
          } else {
            reply += `No tracking updates yet. The shipment is being processed.`;
          }
          break;

        case "status":
          reply = `**Shipment ${trackingId} - Status Update**\n\n`;
          reply += `📊 **Current Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
          reply += `📦 **Items:** ${s.actualItemCount || 0} cartons\n`;
          reply += `📍 **To:** ${branchName}\n`;
          reply += `🚚 **3PL Partner:** ${tplName}\n`;
          reply += `📅 **Est. Delivery:** ${estimatedDate}\n\n`;
          if (recentEvents.length > 0) {
            reply += `**Recent Activity:**\n`;
            recentEvents.forEach(ev => {
              reply += `- ${ev.notes || ev.eventType} (${formatDate(ev.createdAt)})\n`;
            });
          }
          break;

        default:
          reply = `**Shipment ${trackingId}**\n\n`;
          reply += `📊 **Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
          reply += `📦 **Items:** ${s.actualItemCount || 0} cartons\n`;
          reply += `📍 **Destination:** ${branchName}\n`;
          reply += `🚚 **3PL Partner:** ${tplName}\n`;
          reply += `📅 **Est. Delivery:** ${estimatedDate}\n`;
          reply += `👤 **Recipient:** ${s.receiverName || "Not specified"}\n\n`;
          if (recentEvents[0]) {
            reply += `**Latest Update:** ${recentEvents[0].notes || "Status updated"} (${formatDate(recentEvents[0].createdAt)})`;
          }
          break;
      }

      return {
        reply,
        quickActions: [
          `When will ${trackingId} arrive?`,
          `Where is ${trackingId}?`,
          `Status of ${trackingId}`,
          "Track another shipment",
        ],
        shipment: {
          id: s.id,
          trackingId: s.trackingId,
          status: s.status,
          destinationBranch: branchName,
          estimatedDeliveryDate: estimatedDate,
          tplName,
        },
      };
    }),
});
