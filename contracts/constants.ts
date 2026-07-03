export const Session = {
  cookieName: "kedi_token",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
  phoneExists: "Phone number already registered",
  invalidCredentials: "Invalid phone or password",
  accountPending: "Account pending admin approval",
  accountSuspended: "Account has been suspended",
} as const;

export const Paths = {
  login: "/login",
  signup: "/signup",
} as const;

// ── KEDI ROLE DEFINITIONS ──
export type KediRole = typeof KEDI_ROLES[number];

export const KEDI_ROLES = [
  "super_admin",
  "admin",
  "shipment_creator",
  "branch_manager",
  "logistics_officer",
  "driver",
  "warehouse_supply",
  "unassigned",
] as const;

export const ROLE_LABELS: Record<KediRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  shipment_creator: "Shipment Creator",
  branch_manager: "Branch Manager",
  logistics_officer: "Logistics Officer",
  driver: "Driver",
  warehouse_supply: "Warehouse Supply",
  unassigned: "Unassigned (Pending)",
};

export const ROLE_COLORS: Record<KediRole, string> = {
  super_admin: "bg-red-100 text-red-700",
  admin: "bg-orange-100 text-orange-700",
  shipment_creator: "bg-blue-100 text-blue-700",
  branch_manager: "bg-purple-100 text-purple-700",
  logistics_officer: "bg-indigo-100 text-indigo-700",
  driver: "bg-green-100 text-green-700",
  warehouse_supply: "bg-yellow-100 text-yellow-700",
  unassigned: "bg-gray-100 text-gray-500",
};

// ── SHIPMENT STATUS ──
export const SHIPMENT_STATUSES = [
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
] as const;

export const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  labeled: "Labeled",
  assigned_to_3pl: "Assigned to 3PL",
  waiting_driver_pickup: "Waiting Pickup",
  picked_up: "Picked Up",
  at_3pl: "At 3PL",
  waiting_3pl_pickup: "Waiting 3PL Pickup",
  picked_up_by_3pl: "Picked Up by 3PL",
  tpl_confirmed: "3PL Confirmed",
  in_transit_with_3pl: "In Transit",
  partially_delivered: "Partially Delivered",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  labeled: "bg-blue-50 text-blue-700",
  assigned_to_3pl: "bg-indigo-50 text-indigo-700",
  waiting_driver_pickup: "bg-yellow-50 text-yellow-700",
  picked_up: "bg-blue-100 text-blue-700",
  at_3pl: "bg-purple-50 text-purple-700",
  waiting_3pl_pickup: "bg-amber-50 text-amber-700",
  picked_up_by_3pl: "bg-teal-50 text-teal-700",
  tpl_confirmed: "bg-green-50 text-green-700",
  in_transit_with_3pl: "bg-sky-50 text-sky-700",
  partially_delivered: "bg-orange-50 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

// ── 3PL OPTIONS ──
export const TPL_PICKUP_TYPES = [
  { value: "kedi_driver_drop", label: "KEDI Driver will drop at 3PL office" },
  { value: "tpl_pickup_direct", label: "3PL will pick up directly from warehouse" },
] as const;

// ── BRANCH CODES FOR TRACKING IDs ──
// Format: KEDI-[2-LETTER-CODE][YY][MM] e.g. KEDI-PH2606
export const BRANCH_TRACKING_CODES: Record<string, string> = {
  "Abeokuta": "AB",
  "Akure": "AR",
  "Benin": "BN",
  "Onitsha": "ON",
  "Bauchi": "BC",
  "Bayelsa": "BY",
  "PH": "PH",
  "Enugu": "EN",
  "Ilorin": "IL",
  "Osogbo": "OS",
  "Ibadan": "IB",
  "Kano": "KN",
  "Kaduna": "KD",
  "Kedi-Abuja": "AB",
  "Yola": "YL",
  "Ikeja": "IK",
  "Apapa": "AP",
  "Uyo": "UY",
  "Lagos HQ": "LH",
};

// ── ALL BRANCHES ──
export const BRANCHES = [
  { name: "Abeokuta", city: "Abeokuta" },
  { name: "Akure", city: "Akure" },
  { name: "Benin", city: "Benin City" },
  { name: "Onitsha", city: "Onitsha" },
  { name: "Bauchi", city: "Bauchi" },
  { name: "Bayelsa", city: "Yenagoa" },
  { name: "PH", city: "Port Harcourt" },
  { name: "Enugu", city: "Enugu" },
  { name: "Ilorin", city: "Ilorin" },
  { name: "Osogbo", city: "Osogbo" },
  { name: "Ibadan", city: "Ibadan" },
  { name: "Kano", city: "Kano" },
  { name: "Kaduna", city: "Kaduna" },
  { name: "Kedi-Abuja", city: "Abuja" },
  { name: "Yola", city: "Yola" },
  { name: "Ikeja", city: "Ikeja, Lagos" },
  { name: "Apapa", city: "Apapa, Lagos" },
  { name: "Uyo", city: "Uyo" },
];
