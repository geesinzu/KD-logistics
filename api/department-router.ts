import { z } from "zod";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, asc, inArray, isNull, like } from "drizzle-orm";
import {
  departments,
  departmentStaff,
  departmentRequests as requests,
  departmentPackages as packages,
  departmentPackageEvents as events,
  branches,
  users,
  shipments,
  activityLog,
} from "@db/schema";
import {
  createRouter,
  staffQuery as rawStaffQuery,
  superAdminQuery as rawSuperAdminQuery,
  shipmentCreatorQuery as rawShipmentCreatorQuery,
} from "./middleware";
import { getDb } from "./queries/connection";
import {
  departmentsReady,
  requireDepartmentsReady,
  enableDepartments,
} from "./lib/department-schema";
import {
  PACKAGE_SCAN_ROLES,
  PACKAGE_READ_ROLES,
  PACKAGE_QR_PREFIX,
} from "@contracts/department-packages";
const staffQuery = rawStaffQuery.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    return {
      ...result,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Could not complete the department package operation. Please retry or contact Super Admin.",
      }),
    };
  return result;
});
const superAdminQuery = rawSuperAdminQuery.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    return {
      ...result,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Could not complete the department package operation. Please retry or contact Super Admin.",
      }),
    };
  return result;
});
const shipmentCreatorQuery = rawShipmentCreatorQuery.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    return {
      ...result,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Could not complete the department package operation. Please retry or contact Super Admin.",
      }),
    };
  return result;
});
const id = z.number().int().positive();
const feature = staffQuery.use(async ({ ctx, next }) => {
  if (!PACKAGE_READ_ROLES.some(r => r === ctx.user.role))
    throw new TRPCError({ code: "FORBIDDEN" });
  await requireDepartmentsReady();
  return next();
});
async function membership(userId: number) {
  const [row] = await getDb()
    .select({ id: departments.id, name: departments.name })
    .from(departmentStaff)
    .innerJoin(departments, eq(departments.id, departmentStaff.departmentId))
    .where(eq(departmentStaff.userId, userId));
  if (!row)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super Admin must assign your department.",
    });
  return row;
}
async function requestAccess(
  user: { id: number; role: string; branchId: number | null },
  requestId: number
) {
  const [row] = await getDb()
    .select()
    .from(requests)
    .where(eq(requests.id, requestId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (
    user.role === "department_staff" &&
    row.departmentId !== (await membership(user.id)).id
  )
    throw new TRPCError({ code: "NOT_FOUND" });
  if (user.role === "branch_manager" && row.destBranchId !== user.branchId)
    throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}
export const departmentRouter = createRouter({
  status: staffQuery.query(async () => ({ ready: await departmentsReady() })),
  enable: superAdminQuery.mutation(async () => {
    await enableDepartments();
    return { ready: true };
  }),
  context: feature.query(async ({ ctx }) => ({
    department:
      ctx.user.role === "department_staff"
        ? await membership(ctx.user.id)
        : null,
  })),
  departments: superAdminQuery.query(async () => {
    await requireDepartmentsReady();
    return getDb().select().from(departments).orderBy(asc(departments.name));
  }),
  createDepartment: superAdminQuery
    .input(z.object({ name: z.string().trim().min(2).max(100) }))
    .mutation(async ({ input }) => {
      await requireDepartmentsReady();
      const existing = await getDb()
        .select()
        .from(departments)
        .where(eq(departments.name, input.name));
      if (existing.length)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Department already exists.",
        });
      await getDb().insert(departments).values(input);
      return { success: true };
    }),
  staff: superAdminQuery.query(async () => {
    await requireDepartmentsReady();
    return getDb()
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        role: users.role,
        status: users.status,
        departmentId: departmentStaff.departmentId,
        department: departments.name,
      })
      .from(users)
      .leftJoin(departmentStaff, eq(departmentStaff.userId, users.id))
      .leftJoin(departments, eq(departments.id, departmentStaff.departmentId))
      .orderBy(asc(users.name));
  }),
  assignStaff: superAdminQuery
    .input(z.object({ userId: id, departmentId: id }))
    .mutation(async ({ input, ctx }) => {
      await requireDepartmentsReady();
      return getDb().transaction(async tx => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1)
          .for("update");
        if (
          !target ||
          target.id === ctx.user.id ||
          ["super_admin", "admin"].includes(target.role)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Choose a non-administrator staff account other than yourself.",
          });
        const [dep] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, input.departmentId));
        if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .insert(departmentStaff)
          .values(input)
          .onDuplicateKeyUpdate({ set: { departmentId: input.departmentId } });
        await tx
          .update(users)
          .set({ role: "department_staff", branchId: null })
          .where(eq(users.id, target.id));
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "assign_department_staff",
          entityType: "user",
          entityId: target.id,
          details: {
            departmentId: input.departmentId,
            previousRole: target.role,
          },
        });
        return { success: true };
      });
    }),
  setStaffStatus: superAdminQuery
    .input(z.object({ userId: id, status: z.enum(["active", "suspended"]) }))
    .mutation(async ({ input, ctx }) => {
      await requireDepartmentsReady();
      return getDb().transaction(async tx => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .for("update");
        if (!user || user.role !== "department_staff")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a department staff account.",
          });
        await membership(user.id);
        await tx
          .update(users)
          .set({ status: input.status })
          .where(eq(users.id, user.id));
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "department_staff_status",
          entityType: "user",
          entityId: user.id,
          details: { status: input.status },
        });
        return { success: true };
      });
    }),
  createStaff: superAdminQuery
    .input(
      z.object({
        departmentId: id,
        name: z.string().trim().min(2).max(100),
        phone: z.string().regex(/^\d{11}$/),
        password: z.string().min(12).max(100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireDepartmentsReady();
      const passwordHash = await bcrypt.hash(input.password, 12);
      return getDb().transaction(async tx => {
        const [dep] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, input.departmentId));
        if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phone, input.phone));
        if (existing)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Phone number already registered.",
          });
        const result = await tx.insert(users).values({
          name: input.name,
          phone: input.phone,
          passwordHash,
          role: "department_staff",
          status: "active",
          createdBy: ctx.user.id,
        });
        await tx.insert(departmentStaff).values({
          userId: Number(result[0].insertId),
          departmentId: input.departmentId,
        });
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "create_department_staff",
          entityType: "user",
          entityId: Number(result[0].insertId),
          details: { departmentId: input.departmentId },
        });
        return { success: true };
      });
    }),
  list: feature
    .input(
      z
        .object({
          search: z.string().trim().max(100).default(""),
          page: z.number().int().min(1).default(1),
        })
        .default({ search: "", page: 1 })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (ctx.user.role === "department_staff")
        conditions.push(
          eq(requests.departmentId, (await membership(ctx.user.id)).id)
        );
      if (ctx.user.role === "branch_manager") {
        if (!ctx.user.branchId) return [];
        conditions.push(eq(requests.destBranchId, ctx.user.branchId));
      }
      if (input.search)
        conditions.push(like(requests.description, `%${input.search}%`));
      const rows = await getDb()
        .select({
          request: requests,
          department: departments.name,
          branch: branches.name,
        })
        .from(requests)
        .innerJoin(departments, eq(requests.departmentId, departments.id))
        .innerJoin(branches, eq(requests.destBranchId, branches.id))
        .where(and(...conditions))
        .orderBy(desc(requests.id))
        .limit(30)
        .offset((input.page - 1) * 30);
      if (!rows.length) return [];
      const ps = await getDb()
        .select({
          id: packages.id,
          requestId: packages.requestId,
          packageNumber: packages.packageNumber,
          receivedOfficeAt: packages.receivedOfficeAt,
          shipmentId: packages.shipmentId,
          includedAt: packages.includedAt,
          receivedBranchAt: packages.receivedBranchAt,
          trackingId: shipments.trackingId,
        })
        .from(packages)
        .leftJoin(shipments, eq(packages.shipmentId, shipments.id))
        .where(
          inArray(
            packages.requestId,
            rows.map(r => r.request.id)
          )
        )
        .orderBy(asc(packages.packageNumber));
      return rows.map(r => ({
        ...r.request,
        department: r.department,
        branch: r.branch,
        packages: ps.filter(p => p.requestId === r.request.id),
      }));
    }),
  create: feature
    .input(
      z.object({
        destBranchId: id,
        description: z.string().trim().min(2).max(200),
        packageCount: z.number().int().min(1).max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "department_staff")
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "A department staff account creates its own package requests.",
        });
      const department = await membership(ctx.user.id);
      return getDb().transaction(async tx => {
        const [branch] = await tx
          .select()
          .from(branches)
          .where(eq(branches.id, input.destBranchId));
        if (!branch || branch.status !== "active")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose an active branch.",
          });
        const result = await tx.insert(requests).values({
          departmentId: department.id,
          destBranchId: input.destBranchId,
          description: input.description,
          createdBy: ctx.user.id,
        });
        const requestId = Number(result[0].insertId);
        for (let i = 1; i <= input.packageCount; i++) {
          const p = await tx
            .insert(packages)
            .values({ requestId, packageNumber: i, token: randomUUID() });
          await tx.insert(events).values({
            packageId: Number(p[0].insertId),
            actorId: ctx.user.id,
            action: "submitted",
          });
        }
        return { requestId };
      });
    }),
  detail: feature
    .input(z.object({ requestId: id }))
    .query(async ({ input, ctx }) => {
      const r = await requestAccess(ctx.user, input.requestId);
      const [dep] = await getDb()
        .select()
        .from(departments)
        .where(eq(departments.id, r.departmentId));
      const [branch] = await getDb()
        .select()
        .from(branches)
        .where(eq(branches.id, r.destBranchId));
      const ps = await getDb()
        .select({ package: packages, trackingId: shipments.trackingId })
        .from(packages)
        .leftJoin(shipments, eq(shipments.id, packages.shipmentId))
        .where(eq(packages.requestId, r.id))
        .orderBy(asc(packages.packageNumber));
      const history = ps.length
        ? await getDb()
            .select({
              id: events.id,
              packageId: events.packageId,
              action: events.action,
              note: events.note,
              at: events.createdAt,
              actor: users.name,
            })
            .from(events)
            .leftJoin(users, eq(events.actorId, users.id))
            .where(
              inArray(
                events.packageId,
                ps.map(p => p.package.id)
              )
            )
            .orderBy(asc(events.id))
        : [];
      // Department receives package records and a reference, never the shipment payload.
      return {
        ...r,
        department: dep?.name,
        branch: branch?.name,
        packages: ps.map(p => ({ ...p.package, trackingId: p.trackingId })),
        history,
      };
    }),
  cancel: feature
    .input(
      z.object({ requestId: id, reason: z.string().trim().max(500).optional() })
    )
    .mutation(async ({ input, ctx }) => {
      const r = await requestAccess(ctx.user, input.requestId);
      const operations = ["super_admin", "admin", "logistics_officer"].includes(
        ctx.user.role
      );
      if (
        !operations &&
        (ctx.user.role !== "department_staff" || r.createdBy !== ctx.user.id)
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      if (operations && (!input.reason || input.reason.length < 5))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Give a reason for returning or cancelling this package request.",
        });
      return getDb().transaction(async tx => {
        const [locked] = await tx
          .select()
          .from(requests)
          .where(eq(requests.id, r.id))
          .for("update");
        if (!locked || locked.cancelledAt) return { success: true };
        const ps = await tx
          .select()
          .from(packages)
          .where(eq(packages.requestId, r.id))
          .for("update");
        if (
          ps.some(
            p =>
              p.shipmentId ||
              p.receivedBranchAt ||
              (!operations && p.receivedOfficeAt)
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "After logistics receipt, contact the logistics office to resolve changes.",
          });
        if (!r.cancelledAt) {
          await tx
            .update(requests)
            .set({ cancelledAt: new Date() })
            .where(eq(requests.id, r.id));
          for (const p of ps)
            await tx.insert(events).values({
              packageId: p.id,
              actorId: ctx.user.id,
              action: "cancelled",
              note: input.reason,
            });
        }
        return { success: true };
      });
    }),
  scan: feature
    .input(z.object({ code: z.string().trim().min(1).max(150) }))
    .query(async ({ input, ctx }) => {
      if (
        !PACKAGE_SCAN_ROLES.some(r => r === ctx.user.role) &&
        ctx.user.role !== "branch_manager"
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const token = input.code.startsWith(PACKAGE_QR_PREFIX)
        ? input.code.slice(PACKAGE_QR_PREFIX.length)
        : input.code;
      const reference = /^DP-(\d+)\s*\/\s*(\d+)$/i.exec(input.code);
      const [p] = await getDb()
        .select()
        .from(packages)
        .where(
          reference
            ? and(
                eq(packages.requestId, Number(reference[1])),
                eq(packages.packageNumber, Number(reference[2]))
              )
            : eq(packages.token, token)
        );
      if (!p)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department package not found.",
        });
      const r = await requestAccess(ctx.user, p.requestId);
      return { requestId: r.id, packageId: p.id };
    }),
  receiveOffice: feature
    .input(z.object({ packageId: id }))
    .mutation(async ({ input, ctx }) => {
      if (!PACKAGE_SCAN_ROLES.some(r => r === ctx.user.role))
        throw new TRPCError({ code: "FORBIDDEN" });
      const [pre] = await getDb()
        .select()
        .from(packages)
        .where(eq(packages.id, input.packageId));
      if (!pre) throw new TRPCError({ code: "NOT_FOUND" });
      return getDb().transaction(async tx => {
        const [r] = await tx
          .select()
          .from(requests)
          .where(eq(requests.id, pre.requestId))
          .for("update");
        const [p] = await tx
          .select()
          .from(packages)
          .where(eq(packages.id, pre.id))
          .for("update");
        if (!r || r.cancelledAt || !p || p.shipmentId)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This request is cancelled or already included in a shipment.",
          });
        if (!p.receivedOfficeAt) {
          await tx
            .update(packages)
            .set({
              receivedOfficeAt: new Date(),
              receivedOfficeBy: ctx.user.id,
            })
            .where(eq(packages.id, p.id));
          await tx.insert(events).values({
            packageId: p.id,
            actorId: ctx.user.id,
            action: "received_office",
          });
        }
        return { success: true };
      });
    }),
  waiting: shipmentCreatorQuery
    .input(z.object({ branchId: id }))
    .query(async ({ input }) => {
      if (!(await departmentsReady())) return [];
      return getDb()
        .select({
          id: packages.id,
          requestId: requests.id,
          packageNumber: packages.packageNumber,
          description: requests.description,
          department: departments.name,
          receivedOfficeAt: packages.receivedOfficeAt,
        })
        .from(packages)
        .innerJoin(requests, eq(requests.id, packages.requestId))
        .innerJoin(departments, eq(departments.id, requests.departmentId))
        .where(
          and(
            eq(requests.destBranchId, input.branchId),
            isNull(requests.cancelledAt),
            isNull(packages.shipmentId)
          )
        )
        .orderBy(asc(packages.id))
        .limit(500);
    }),
  forShipment: feature
    .input(z.object({ shipmentId: id }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "department_staff")
        throw new TRPCError({ code: "FORBIDDEN" });
      const [shipment] = await getDb()
        .select()
        .from(shipments)
        .where(eq(shipments.id, input.shipmentId));
      if (!shipment) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role === "branch_manager" &&
        ctx.user.branchId !== shipment.destBranchId
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      return getDb()
        .select({
          id: packages.id,
          requestId: packages.requestId,
          packageNumber: packages.packageNumber,
          receivedBranchAt: packages.receivedBranchAt,
          description: requests.description,
          department: departments.name,
        })
        .from(packages)
        .innerJoin(requests, eq(requests.id, packages.requestId))
        .innerJoin(departments, eq(departments.id, requests.departmentId))
        .where(eq(packages.shipmentId, input.shipmentId))
        .orderBy(asc(packages.id));
    }),
  removeFromShipment: shipmentCreatorQuery
    .input(z.object({ packageId: id, shipmentId: id }))
    .mutation(async ({ input, ctx }) => {
      await requireDepartmentsReady();
      return getDb().transaction(async tx => {
        const [s] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.id, input.shipmentId))
          .for("update");
        if (
          !s ||
          !["created", "labeled"].includes(s.status) ||
          (ctx.user.role === "shipment_creator" && s.createdBy !== ctx.user.id)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the creator or operations team can remove packages before assignment or dispatch.",
          });
        const [p] = await tx
          .select()
          .from(packages)
          .where(eq(packages.id, input.packageId))
          .for("update");
        if (!p || p.shipmentId !== s.id || p.receivedBranchAt)
          throw new TRPCError({ code: "CONFLICT" });
        await tx
          .update(packages)
          .set({ shipmentId: null, includedAt: null, includedBy: null })
          .where(eq(packages.id, p.id));
        await tx.insert(events).values({
          packageId: p.id,
          actorId: ctx.user.id,
          action: "released",
          note: `Removed from shipment #${s.id} before dispatch.`,
        });
        return { success: true };
      });
    }),
  acknowledge: feature
    .input(z.object({ packageId: id }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "branch_manager" || !ctx.user.branchId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The destination branch confirms its own package receipt.",
        });
      const [pre] = await getDb()
        .select()
        .from(packages)
        .where(eq(packages.id, input.packageId));
      if (!pre?.shipmentId)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Package is not included in a shipment.",
        });
      return getDb().transaction(async tx => {
        // Lock shipment before package, in the same order as cancellation/deletion.
        const [s] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.id, pre.shipmentId!))
          .for("update");
        const [p] = await tx
          .select()
          .from(packages)
          .where(eq(packages.id, pre.id))
          .for("update");
        if (
          !s ||
          !p ||
          p.shipmentId !== s.id ||
          s.destBranchId !== ctx.user.branchId ||
          s.status === "cancelled"
        )
          throw new TRPCError({ code: "FORBIDDEN" });
        if (!p.receivedBranchAt) {
          await tx
            .update(packages)
            .set({
              receivedBranchAt: new Date(),
              receivedBranchBy: ctx.user.id,
            })
            .where(eq(packages.id, p.id));
          await tx.insert(events).values({
            packageId: p.id,
            actorId: ctx.user.id,
            action: "received_branch",
          });
        }
        return { success: true };
      });
    }),
});
