// Preserve existing offices' printed prefixes, keyed by their stable database code.
// New offices use their database code directly; no code change is needed.
const legacyPrefixes: Record<string, string> = {
  ABK: "AB", AKU: "AR", BEN: "BN", ONT: "ON", BCU: "BC", BYL: "BY",
  PHC: "PH", ENU: "EN", ILR: "IL", OSG: "OS", IBD: "IB", KAN: "KN",
  KAD: "KD", ABJ: "AB", YOL: "YL", IKE: "IK", APA: "AP", UYO: "UY", LHQ: "LH",
};
export function branchTrackingCode(code: string): string {
  return legacyPrefixes[code] ?? code;
}
