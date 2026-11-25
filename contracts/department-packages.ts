export const PACKAGE_SCAN_ROLES = [
  "super_admin",
  "admin",
  "logistics_officer",
  "warehouse_supply",
] as const;
export const PACKAGE_CREATE_SHIPMENT_ROLES = [
  "super_admin",
  "admin",
  "logistics_officer",
  "shipment_creator",
] as const;
export const PACKAGE_READ_ROLES = [
  ...new Set([
    ...PACKAGE_SCAN_ROLES,
    ...PACKAGE_CREATE_SHIPMENT_ROLES,
    "branch_manager",
    "department_staff",
  ]),
] as const;
export const PACKAGE_QR_PREFIX = "KEDI-PKG:";
export function packageStatus(p: {
  receivedBranchAt: unknown;
  shipmentId: number | null;
  receivedOfficeAt: unknown;
}) {
  return p.receivedBranchAt
    ? "Received by branch"
    : p.shipmentId
      ? "Included in shipment"
      : p.receivedOfficeAt
        ? "Received at logistics office"
        : "Submitted";
}
export function isDepartmentPackageCode(value: string) {
  return (
    value.startsWith(PACKAGE_QR_PREFIX) ||
    /^DP-\d+\s*\/\s*\d+$/i.test(value.trim())
  );
}
