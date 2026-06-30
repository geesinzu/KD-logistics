import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { shipments, trackingEvents, branches, thirdPartyLogistics } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery } from "./middleware";

// ── INTENT DETECTION ──
type Intent =
  | "track"
  | "delivery_date"
  | "status"
  | "location"
  | "count"
  | "delay"
  | "who_handler"
  | "greeting"
  | "help"
  | "complaint"
  | "how_to_create"
  | "how_to_assign"
  | "how_to_pickup"
  | "faq_shipping"
  | "faq_account"
  | "faq_roles"
  | "faq_3pl"
  | "thanks"
  | "goodbye"
  | "small_talk"
  | "general";

const KEYWORDS: Record<Intent, string[]> = {
  track: ["track", "find", "where is", "wheres", "locate", "search for", "look up", "check on", "any update on", "my shipment", "my order"],
  delivery_date: ["when", "delivery", "arrive", "coming", "reach", "how long", "expected", "estimate", "eta", "how soon", "when will", "arrival time", "delivery time"],
  status: ["status", "progress", "how far", "stage", "what is happening", "whats happening", "current state", "situation", "update", "any news"],
  location: ["where", "location", "city", "at", "currently", "which state", "which city", "position"],
  count: ["how many", "total", "count", "number of", "all shipments", "list of", "all my"],
  delay: ["delay", "late", "not arrived", "overdue", "behind", "behind schedule", "taking too long", "slow", "waiting too long", "when will it come"],
  who_handler: ["who", "which company", "which 3pl", "logistics", "handler", "carrier", "transporting", "driver", "assigned to"],
  greeting: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy", "yo", "sup", "what's up", "whats up", "hola"],
  help: ["help", "assist", "support", "how do i", "how to", "what can you do", "what do you do", "guide", "tutorial", "explain", "teach me"],
  complaint: ["complaint", "problem", "issue", "not working", "wrong", "error", "dispute", "angry", "frustrated", "bad", "terrible", "poor", "unhappy"],
  how_to_create: ["create shipment", "new shipment", "add shipment", "send goods", "how to create", "make shipment", "register shipment"],
  how_to_assign: ["assign 3pl", "assign driver", "logistics", "how to assign", "choose 3pl", "select logistics"],
  how_to_pickup: ["pickup", "scan qr", "how to scan", "driver pickup", "drop off", "collect"],
  faq_shipping: ["shipping", "parcel", "carton", "box", "package", "what can i ship", "items", "products", "prohibited", "allowed"],
  faq_account: ["password", "login", "cant login", "forgot", "reset", "change password", "account", "profile", "phone number"],
  faq_roles: ["roles", "who can", "permission", "admin", "warehouse", "logistics", "driver", "branch manager", "creator"],
  faq_3pl: ["3pl", "third party", "logistics partner", "s.generation", "knightpride", "emmbay", "courier"],
  thanks: ["thank", "thanks", "appreciate", "grateful", "nice", "awesome", "great", "good job", "well done"],
  goodbye: ["bye", "goodbye", "see you", "later", "cya", "talk soon", "take care"],
  small_talk: ["how are you", "hows it going", "whats your name", "who are you", "what are you", "are you human", "are you robot", "weather", "joke", "funny"],
  general: [],
};

function detectIntent(text: string): Intent {
  const lower = text.toLowerCase().trim();
  let bestMatch: Intent = "general";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = intent as Intent;
    }
  }

  // Override: if "when" + delivery words → delivery_date
  if (lower.includes("when") && (lower.includes("deliver") || lower.includes("arrive") || lower.includes("come") || lower.includes("reach"))) {
    bestMatch = "delivery_date";
  }
  // Override: if tracking ID pattern → track
  if (extractTrackingId(text)) bestMatch = "track";

  return bestMatch;
}

// ── TRACKING ID EXTRACTION ──
function extractTrackingId(text: string): string | null {
  // Match KEDI-XXYYMMDDNNN pattern
  const match = text.match(/KEDI-[A-Z]{2}\d{6,8}\d*/i);
  return match ? match[0].toUpperCase() : null;
}

function formatDate(date: Date | null | string): string {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString("en-NG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(date: Date | string | null): string {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

// ── FAQ RESPONSES ──
const FAQ_RESPONSES: Record<string, string> = {
  faq_shipping: `You can ship KEDI healthcare products including:\n\n• Health supplements & herbal products\n• Personal care items\n• Medical devices (small)\n• Marketing materials\n\nAll items must be properly packaged in cartons. Contact your warehouse officer for packaging guidelines.`,

  faq_account: `**Account Help:**\n\n• **Login issues?** Make sure your phone number is entered correctly (e.g., 08118018662)\n• **Forgot password?** Contact your Super Admin to reset it\n• **Update profile?** Go to Profile tab → tap camera icon to upload photo\n• **Change details?** Only Super Admin can update phone/role`,

  faq_roles: `**KEDI Logistics Roles:**\n\n• **Super Admin** — Full control, manages all users\n• **Admin** — Manages shipments, users, and 3PL assignments\n• **Shipment Creator** — Creates new shipment requests\n• **Warehouse Officer** — Processes items, generates QR labels\n• **Logistics Officer** — Assigns 3PL partners and drivers\n• **Driver** — Picks up from warehouse, drops at 3PL\n• **Branch Manager** — Views shipments coming to their branch\n• **3PL Partner** — External logistics (S.generation, Knightpride, Emmbay)`,

  faq_3pl: `**Our 3PL Partners:**\n\n🚚 **S.generation Logistics** — Drop-off only\n🚚 **Knightpride Logistics** — Pickup + Drop-off\n🚚 **Emmbay Logistics** — Pickup + Drop-off\n\nThe Logistics Officer assigns the appropriate 3PL based on the destination branch and service requirements.`,

  how_to_create: `**How to Create a Shipment:**\n\n1. Go to **Shipments** tab\n2. Tap **"New Shipment"** button\n3. Select the **destination branch** (18 branches available)\n4. Enter **recipient name** and optional description\n5. Submit — the shipment is now in "Created" status\n6. The Warehouse Officer will then process it and generate a QR label`,

  how_to_assign: `**How to Assign 3PL:**\n\n1. Go to **Shipments** tab\n2. Find a shipment with status **"Labeled"**\n3. Tap **"Assign to 3PL"**\n4. Select one of the 3 partners:\n   • S.generation Logistics\n   • Knightpride Logistics\n   • Emmbay Logistics\n5. Choose delivery method:\n   • **3PL picks up directly** → 3PL notified to come\n   • **KEDI driver drops off** → Select a driver\n6. Set estimated delivery date and submit`,

  how_to_pickup: `**How Drivers Pickup:**\n\n1. Driver logs in and goes to **Deliveries**\n2. Finds shipment with **"Scan to Pickup"** button\n3. Taps button → QR Scanner opens\n4. Scans the QR label or enters tracking ID\n5. Confirms quantity matches\n6. Status changes to **"Picked Up"**\n\n**For Drop-off:** Same process but scan at 3PL office.`,
};

// ── MAIN CHAT ROUTER ──
export const chatRouter = createRouter({
  ask: publicQuery
    .input(z.object({
      message: z.string().min(1),
      history: z.array(z.object({ sender: z.enum(["user", "bot"]), text: z.string() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const trackingId = extractTrackingId(input.message);
      const intent = detectIntent(input.message);

      // ── 1. SHIPMENT TRACKING (if tracking ID found) ──
      if (trackingId || intent === "track") {
        const searchId = trackingId || extractTrackingId(input.history?.slice(-3).map(h => h.text).join(" ") || "");

        if (searchId) {
          const shipmentResult = await db.select().from(shipments)
            .where(eq(shipments.trackingId, searchId))
            .limit(1);

          if (!shipmentResult[0]) {
            return {
              reply: `I couldn't find any shipment with tracking ID **${searchId}**. Please double-check the ID. Tracking IDs look like **KEDI-EN2606506**.`,
              suggestions: ["How do I find my tracking ID?", "Track another shipment", "Help"],
            };
          }

          const s = shipmentResult[0];
          const destBranch = s.destBranchId
            ? await db.select().from(branches).where(eq(branches.id, s.destBranchId)).limit(1)
            : [];
          const tpl = s.tplId
            ? await db.select().from(thirdPartyLogistics).where(eq(thirdPartyLogistics.id, s.tplId)).limit(1)
            : [];
          const recentEvents = await db.select().from(trackingEvents)
            .where(eq(trackingEvents.shipmentId, s.id))
            .orderBy(desc(trackingEvents.createdAt))
            .limit(5);

          const branchName = destBranch[0]?.name || "Unknown";
          const tplName = tpl[0]?.name || "Not assigned yet";
          const estDate = s.estimatedDeliveryDate
            ? formatDate(s.estimatedDeliveryDate)
            : "Not set yet";

          // Count items status
          const totalItems = s.actualItemCount || 0;
          const delivered = s.deliveredQty || 0;
          const remaining = s.remainingQty || (totalItems - delivered);

          // Build contextual reply based on intent
          let reply = `**📦 Shipment ${s.trackingId}**\n\n`;

          if (intent === "delivery_date") {
            reply += `📅 **Estimated Delivery:** ${estDate}\n`;
            reply += `📍 **Destination:** ${branchName}\n`;
            reply += `🚚 **Handler:** ${tplName}\n`;
            reply += `📊 **Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n\n`;
            if (totalItems > 0) {
              reply += `📦 **Items:** ${totalItems} total | ${delivered} delivered | ${remaining > 0 ? remaining + " remaining" : "All delivered"}\n\n`;
            }
            if (recentEvents[0]) {
              reply += `📝 **Latest:** ${recentEvents[0].notes || "Status updated"} (${timeAgo(recentEvents[0].createdAt)})`;
            }

            // Add delay warning if overdue
            if (s.estimatedDeliveryDate && new Date(s.estimatedDeliveryDate) < new Date() && s.status !== "delivered" && s.status !== "completed") {
              reply += `\n\n⚠️ **This shipment is past its estimated delivery date.** A delay may have been reported.`;
            }
          } else if (intent === "location") {
            const latestLoc = recentEvents.find(e => e.location);
            reply += `📊 **Current Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
            reply += `🚚 **Handler:** ${tplName}\n`;
            reply += `📍 **Destination:** ${branchName}\n`;
            if (latestLoc) {
              reply += `📌 **Last Known Location:** ${latestLoc.location}\n`;
            }
            reply += `\n**Activity Log:**\n`;
            recentEvents.forEach(ev => {
              reply += `- ${ev.notes || ev.eventType} (${timeAgo(ev.createdAt)})\n`;
            });
          } else if (intent === "delay") {
            if (s.estimatedDeliveryDate && new Date(s.estimatedDeliveryDate) < new Date() && s.status !== "delivered") {
              reply += `⚠️ Yes, this shipment is **delayed**.\n\n`;
              reply += `📅 Original estimate: ${estDate}\n`;
              reply += `📊 Current status: ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
              reply += `🚚 Handler: ${tplName}\n\n`;
              reply += `The 3PL partner may have reported a delay. Contact your logistics officer for more details.`;
            } else {
              reply += `✅ This shipment is **on track**.\n\n`;
              reply += `📅 Estimated delivery: ${estDate}\n`;
              reply += `📊 Status: ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
              reply += `🚚 Handler: ${tplName}`;
            }
          } else {
            // General/full info
            reply += `📊 **Status:** ${s.status.replace(/_/g, " ").toUpperCase()}\n`;
            reply += `📦 **Items:** ${totalItems} cartons`;
            if (delivered > 0) reply += ` | ${delivered} delivered`;
            if (remaining > 0) reply += ` | ${remaining} remaining`;
            reply += `\n📍 **Destination:** ${branchName}\n`;
            reply += `🚚 **3PL Partner:** ${tplName}\n`;
            reply += `📅 **Est. Delivery:** ${estDate}\n`;
            reply += `👤 **Recipient:** ${s.receiverName || "Not specified"}\n\n`;
            if (recentEvents[0]) {
              reply += `📝 **Latest Update:** ${recentEvents[0].notes || "Status updated"} (${timeAgo(recentEvents[0].createdAt)})`;
            }
          }

          return {
            reply,
            suggestions: [
              `When will ${s.trackingId} arrive?`,
              `Where is ${s.trackingId} now?`,
              `Is ${s.trackingId} delayed?`,
              "Track another",
              "Help",
            ],
          };
        }
      }

      // ── 2. SHIPMENT COUNT / LIST ──
      if (intent === "count") {
        const totalCount = await db.select({ count: sql<number>`count(*)` }).from(shipments);
        const byStatus: Record<string, number> = {};
        const all = await db.select({ status: shipments.status }).from(shipments);
        for (const s of all) {
          byStatus[s.status] = (byStatus[s.status] || 0) + 1;
        }

        let reply = `**📊 Shipment Overview**\n\n`;
        reply += `Total shipments: **${totalCount[0]?.count || 0}**\n\n`;
        if (byStatus["created"]) reply += `🟡 Created: ${byStatus["created"]}\n`;
        if (byStatus["labeled"]) reply += `🏷️ Labeled: ${byStatus["labeled"]}\n`;
        if (byStatus["assigned_to_3pl"]) reply += `🚚 Assigned to 3PL: ${byStatus["assigned_to_3pl"]}\n`;
        if (byStatus["picked_up"]) reply += `✅ Picked up: ${byStatus["picked_up"]}\n`;
        if (byStatus["in_transit_with_3pl"]) reply += `🛣️ In Transit: ${byStatus["in_transit_with_3pl"]}\n`;
        if (byStatus["delivered"]) reply += `📬 Delivered: ${byStatus["delivered"]}\n`;
        if (byStatus["completed"]) reply += `✅ Completed: ${byStatus["completed"]}\n`;

        return { reply, suggestions: ["View all shipments", "How to create shipment", "Help"] };
      }

      // ── 3. FAQ RESPONSES ──
      if (FAQ_RESPONSES[intent]) {
        return {
          reply: FAQ_RESPONSES[intent],
          suggestions: getSuggestionsForIntent(intent),
        };
      }

      // ── 4. WHO IS HANDLER ──
      if (intent === "who_handler") {
        return {
          reply: `To find out which 3PL or driver is handling a shipment, please provide the **tracking ID** (e.g., KEDI-EN2606506) and I'll look it up for you.`,
          suggestions: ["KEDI-EN2606506", "How to assign 3PL", "List of 3PL partners"],
        };
      }

      // ── 5. COMPLAINT ──
      if (intent === "complaint") {
        return {
          reply: `I'm sorry to hear you're having trouble. I'm here to help!\n\nPlease tell me more about the issue:\n\n• Is it about a **specific shipment**? Give me the tracking ID\n• Is it a **login/account** problem?\n• Is it a **bug** in the app?\n\nIf it's urgent, contact **Gbenga Adebayo (Super Admin)** at 08118018662.`,
          suggestions: ["Track a shipment", "Account help", "Report a bug"],
        };
      }

      // ── 6. GREETING ──
      if (intent === "greeting") {
        const greetings = [
          `Hello there! Welcome to KEDI Healthcare Logistics. I'm your virtual assistant. How can I help you today?`,
          `Hi! Ready to help with your logistics needs. What would you like to know?`,
          `Hey! I'm the KEDI Logistics assistant. Ask me about shipments, tracking, or how things work!`,
        ];
        return {
          reply: greetings[Math.floor(Math.random() * greetings.length)],
          suggestions: ["Track a shipment", "How does this work?", "How to create shipment"],
        };
      }

      // ── 7. SMALL TALK ──
      if (intent === "small_talk") {
        const lower = input.message.toLowerCase();
        if (lower.includes("how are you") || lower.includes("hows it going")) {
          return { reply: `I'm doing great, thanks for asking! Ready to help you track shipments and answer any logistics questions. How about you — how can I assist today?`, suggestions: ["Track a shipment", "Help", "How to create shipment"] };
        }
        if (lower.includes("name") || lower.includes("who are you")) {
          return { reply: `I'm **KEDI Assistant** — your virtual logistics helper! I can track shipments, check delivery dates, explain how the system works, and answer questions about KEDI Healthcare Logistics.`, suggestions: ["What can you do?", "Track a shipment"] };
        }
        if (lower.includes("joke") || lower.includes("funny")) {
          return { reply: `Why did the logistics manager bring a ladder to work? Because they wanted to reach new heights in delivery! 😄\n\nNow, how can I help you with your shipments?`, suggestions: ["Track a shipment", "Help"] };
        }
        return { reply: `I'm just a logistics bot, so I don't experience much — but I'm always here to help! 😊 What can I do for you today?`, suggestions: ["Track a shipment", "Help"] };
      }

      // ── 8. THANKS ──
      if (intent === "thanks") {
        const replies = [
          `You're very welcome! Glad I could help. Anything else I can assist with?`,
          `No problem at all! Happy to help. Need anything else?`,
          `Anytime! Let me know if you need more assistance.`,
        ];
        return {
          reply: replies[Math.floor(Math.random() * replies.length)],
          suggestions: ["Track a shipment", "Help", "Goodbye"],
        };
      }

      // ── 9. GOODBYE ──
      if (intent === "goodbye") {
        return {
          reply: `Goodbye! Have a great day. Remember — you can always come back to track your shipments or ask questions. Take care! 👋`,
          suggestions: [],
        };
      }

      // ── 10. HELP ──
      if (intent === "help") {
        return {
          reply: `**Here's what I can help you with:**\n\n📦 **Track Shipments** — Enter a tracking ID like KEDI-EN2606506\n\n📅 **Check Delivery** — Ask "When will my shipment arrive?"\n\n📊 **View Status** — Ask "What's the status of my shipment?"\n\n🚚 **Find Handler** — Ask "Who is delivering my shipment?"\n\n📋 **How-To Guides** — Ask how to create shipments, assign 3PL, or scan QR\n\n❓ **FAQs** — Ask about roles, accounts, 3PL partners, or shipping rules\n\nJust type your question naturally — I'll understand!`,
          suggestions: ["Track a shipment", "How to create shipment", "What are the roles?", "List of 3PL partners"],
        };
      }

      // ── 11. FALLBACK ──
      return {
        reply: `I'm not sure I understood that correctly. Let me help you!\n\nI can:\n• Track shipments (just enter the tracking ID)\n• Check delivery dates and status\n• Explain how KEDI Logistics works\n• Answer questions about your account\n\nWhat would you like to do?`,
        suggestions: ["Track a shipment", "How to create shipment", "Help", "List of 3PL partners"],
      };
    }),
});

// ── SUGGESTION HELPER ──
function getSuggestionsForIntent(intent: string): string[] {
  const map: Record<string, string[]> = {
    how_to_create: ["How to assign 3PL", "Track a shipment", "FAQ"],
    how_to_assign: ["How to create shipment", "List of 3PL partners", "Help"],
    how_to_pickup: ["How to create shipment", "Track a shipment", "FAQ"],
    faq_shipping: ["How to create shipment", "Track a shipment", "Help"],
    faq_account: ["How to login", "Contact admin", "Help"],
    faq_roles: ["How to create shipment", "How to assign 3PL", "Help"],
    faq_3pl: ["How to assign 3PL", "How to create shipment", "Help"],
  };
  return map[intent] || ["Track a shipment", "Help", "How to create shipment"];
}
