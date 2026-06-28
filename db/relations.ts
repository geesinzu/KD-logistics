import { relations } from "drizzle-orm";
import { users, branches, shipments, thirdPartyLogistics, trackingEvents, tplUsers } from "./schema";

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  createdShipments: many(shipments, { relationName: "createdShipments" }),
}));

export const branchesRelations = relations(branches, ({ many }) => ({
  shipments: many(shipments, { relationName: "destinationShipments" }),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  creator: one(users, { fields: [shipments.createdBy], references: [users.id] }),
  destinationBranch: one(branches, { fields: [shipments.destBranchId], references: [branches.id] }),
  warehouseOfficer: one(users, { fields: [shipments.warehouseOfficerId], references: [users.id] }),
  tpl: one(thirdPartyLogistics, { fields: [shipments.tplId], references: [thirdPartyLogistics.id] }),
  assignedDriver: one(users, { fields: [shipments.assignedDriverId], references: [users.id] }),
  logisticsOfficer: one(users, { fields: [shipments.logisticsOfficerId], references: [users.id] }),
  trackingEvents: many(trackingEvents),
}));

export const thirdPartyLogisticsRelations = relations(thirdPartyLogistics, ({ many }) => ({
  shipments: many(shipments),
  tplUsers: many(tplUsers),
}));

export const trackingEventsRelations = relations(trackingEvents, ({ one }) => ({
  shipment: one(shipments, { fields: [trackingEvents.shipmentId], references: [shipments.id] }),
}));

export const tplUsersRelations = relations(tplUsers, ({ one }) => ({
  tpl: one(thirdPartyLogistics, { fields: [tplUsers.tplId], references: [thirdPartyLogistics.id] }),
}));
