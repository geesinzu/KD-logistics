import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  int,
  bigint,
  date,
  json,
  decimal,
} from "drizzle-orm/mysql-core";

// ── USERS ──
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", [
    "super_admin",
    "admin",
    "shipment_creator",
    "branch_manager",
    "logistics_officer",
    "driver",
    "warehouse_supply",
    "unassigned",
  ]).default("unassigned").notNull(),
  status: mysqlEnum("status", ["pending", "active", "suspended"]).default("pending").notNull(),
  branchId: bigint("branch_id", { mode: "number", unsigned: true }),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  lastLoginAt: timestamp("last_login_at"),
  profilePicture: text("profile_picture"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── BRANCHES ──
export const branches = mysqlTable("branches", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  city: varchar("city", { length: 50 }),
  address: text("address"),
  managerId: bigint("manager_id", { mode: "number", unsigned: true }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Branch = typeof branches.$inferSelect;

// ── THIRD PARTY LOGISTICS ──
export const thirdPartyLogistics = mysqlTable("third_party_logistics", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 100 }),
  address: text("address"),
  pickupOptions: mysqlEnum("pickup_options", ["both", "pickup_only", "dropoff_only"]).default("both").notNull(),
  contactPerson: varchar("contact_person", { length: 100 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ThirdPartyLogistics = typeof thirdPartyLogistics.$inferSelect;

// ── SHIPMENTS ──
export const shipments = mysqlTable("shipments", {
  id: serial("id").primaryKey(),
  trackingId: varchar("tracking_id", { length: 20 }).unique(),
  qrCodeToken: varchar("qr_code_token", { length: 255 }).unique(),

  // Creator
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  creatorRole: varchar("creator_role", { length: 30 }),

  // Origin & Destination
  originBranchId: bigint("origin_branch_id", { mode: "number", unsigned: true }).notNull().default(4),
  destBranchId: bigint("dest_branch_id", { mode: "number", unsigned: true }).notNull(),

  // Recipient
  receiverName: varchar("receiver_name", { length: 100 }),
  receiverPhone: varchar("receiver_phone", { length: 20 }),

  // Initial details
  description: text("description"),
  estimatedItemCount: int("estimated_item_count"),
  priority: mysqlEnum("priority", ["normal", "urgent"]).default("normal").notNull(),

  // Warehouse input
  actualItemCount: int("actual_item_count"),
  itemDetails: text("item_details"),
  storageLocation: varchar("storage_location", { length: 200 }),
  warehouseOfficerId: bigint("warehouse_officer_id", { mode: "number", unsigned: true }),
  labeledAt: timestamp("labeled_at"),

  // 3PL Assignment
  tplId: bigint("tpl_id", { mode: "number", unsigned: true }),
  tplPickupType: mysqlEnum("tpl_pickup_type", ["kedi_driver_drop", "tpl_pickup_direct"]),
  assignedDriverId: bigint("assigned_driver_id", { mode: "number", unsigned: true }),
  logisticsOfficerId: bigint("logistics_officer_id", { mode: "number", unsigned: true }),
  assignedAt: timestamp("assigned_at"),
  estimatedDeliveryDate: date("estimated_delivery_date"),
  specialInstructions: text("special_instructions"),

  // 3PL Confirmation
  tplConfirmedQty: int("tpl_confirmed_qty"),
  tplCondition: mysqlEnum("tpl_condition", ["good", "partial", "damaged"]),
  tplConfirmedAt: timestamp("tpl_confirmed_at"),
  tplNotes: text("tpl_notes"),
  tplPhotos: json("tpl_photos"),

  // Status pipeline
  status: mysqlEnum("status", [
    "created",
    "labeled",
    "assigned_to_3pl",
    "waiting_driver_pickup",
    "picked_up",
    "at_3pl",
    "waiting_3pl_pickup",
    "picked_up_by_3pl",
    "tpl_confirmed",
    "in_transit_with_3pl",
    "partially_delivered",
    "delivered",
    "completed",
    "cancelled",
  ]).default("created").notNull(),

  // Delivery
  deliveredAt: timestamp("delivered_at"),
  deliveredQty: int("delivered_qty"),
  remainingQty: int("remaining_qty"),
  completedAt: timestamp("completed_at"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = typeof shipments.$inferInsert;

// ── TRACKING EVENTS ──
export const trackingEvents = mysqlTable("tracking_events", {
  id: serial("id").primaryKey(),
  shipmentId: bigint("shipment_id", { mode: "number", unsigned: true }).notNull(),
  eventType: mysqlEnum("event_type", [
    "created",
    "items_input",
    "label_generated",
    "assigned_to_3pl",
    "driver_pickup_scan",
    "driver_pickup_confirmed",
    "driver_dropoff_at_3pl",
    "tpl_pickup_from_warehouse",
    "tpl_receipt_confirmed",
    "tpl_location_update",
    "tpl_partial_delivery",
    "tpl_full_delivery",
    "delay_reported",
    "cancelled",
    "note_added",
  ]).notNull(),
  oldStatus: varchar("old_status", { length: 30 }),
  newStatus: varchar("new_status", { length: 30 }),
  location: varchar("location", { length: 200 }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  notes: text("notes"),
  qtyDelivered: int("qty_delivered"),
  qtyRemaining: int("qty_remaining"),
  photos: json("photos"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  actorRole: varchar("actor_role", { length: 30 }),
  actorType: mysqlEnum("actor_type", ["kedi_user", "tpl_user"]).default("kedi_user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TrackingEvent = typeof trackingEvents.$inferSelect;

// ── TPL USERS (3PL portal users) ──
export const tplUsers = mysqlTable("tpl_users", {
  id: serial("id").primaryKey(),
  tplId: bigint("tpl_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 100 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["tpl_admin", "tpl_staff"]).default("tpl_staff").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TplUser = typeof tplUsers.$inferSelect;

// ── ACTIVITY LOG ──
export const activityLog = mysqlTable("activity_log", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 30 }),
  entityId: bigint("entity_id", { mode: "number", unsigned: true }),
  details: json("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
