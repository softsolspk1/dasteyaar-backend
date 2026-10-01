import mongoose from "mongoose";
import Doctor from "../models/Doctor";
import Product from "../models/Product";
import District from "../models/District";

export interface ReportFilterParams {
  teamId?: string | null;
  districtId?: string | null;
  kamId?: string | null;
  doctorId?: string | null;
  productId?: string | null;
  distributorId?: string | null;
}

function parseCommaSeparated(val?: string | null): string[] | null {
  if (!val) return null;
  const parts = val.split(",").filter(Boolean);
  return parts.length ? parts : null;
}

function toObjectIds(ids: string[]): mongoose.Types.ObjectId[] {
  return ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
}

/** Reads the six filter params shared by the phase-2 report endpoints from a request's query. */
export function parseReportFilterParams(query: Record<string, any>): ReportFilterParams {
  return {
    teamId: (query.teamId as string) || null,
    districtId: (query.districtId as string) || null,
    kamId: (query.kamId as string) || null,
    doctorId: (query.doctorId as string) || null,
    productId: (query.productId as string) || null,
    distributorId: (query.distributorId as string) || null,
  };
}

/**
 * Resolve team/district/doctor/distributor/kam/product filters into Mongo
 * match fragments for an Order query. Mirrors dasteyaar-admin's
 * lib/services/reportFilters.ts so both apps' reports behave identically
 * against the shared Order collection.
 *
 * - team/district/doctor narrow to a doctor id list (Doctor.team_id / district_id),
 *   matched against order.doctor_info.doctor_id.
 * - kam matches orders whose own kam_id is one of the given KAMs, OR whose
 *   doctor's district is owned by one of those KAMs (district.kam_id) - this
 *   covers agent/mobile-created orders that never set kam_id directly.
 * - product resolves productId(s) to product names. Returned separately as
 *   `itemMatch` (rather than folded into `match`) because callers that break
 *   a report down per-product (doctor-wise, product-wise, kam-wise) should
 *   apply it AFTER $unwind so only the selected product's row(s) survive;
 *   callers that report at the order level (patient/city/outlet-wise) should
 *   apply it as plain order-level containment, for which `itemMatch` also
 *   works unchanged since it's still just an `items.name` match.
 *
 * Returns `empty: true` when a filter can never match anything (e.g. a team
 * with zero doctors) - callers should short-circuit and return empty results
 * rather than running the query.
 */
export async function buildOrderFilterMatch(
  params: ReportFilterParams
): Promise<{ match: any; itemMatch: any; empty: boolean }> {
  const teamIds = parseCommaSeparated(params.teamId);
  const districtIds = parseCommaSeparated(params.districtId);
  const kamIds = parseCommaSeparated(params.kamId);
  const doctorIdsFilter = parseCommaSeparated(params.doctorId);
  const productIds = parseCommaSeparated(params.productId);
  const distributorIds = parseCommaSeparated(params.distributorId);

  const clauses: any[] = [];
  const empty = { match: null, itemMatch: null, empty: true };

  if (teamIds || districtIds || doctorIdsFilter) {
    const doctorQuery: any = {};
    if (teamIds) doctorQuery.team_id = { $in: teamIds };
    if (districtIds) doctorQuery.district_id = { $in: districtIds };
    if (doctorIdsFilter) doctorQuery._id = { $in: doctorIdsFilter };

    const doctors = await Doctor.find(doctorQuery).select("_id").lean();
    if (doctors.length === 0) return empty;
    clauses.push({ "doctor_info.doctor_id": { $in: doctors.map((d: any) => d._id) } });
  }

  if (distributorIds) {
    const validIds = toObjectIds(distributorIds);
    if (validIds.length === 0) return empty;
    clauses.push({ "distributor_info.distributor_id": { $in: validIds } });
  }

  if (kamIds) {
    const validKamIds = toObjectIds(kamIds);
    if (validKamIds.length === 0) return empty;
    const districtsForKams = await District.find({ kam_id: { $in: validKamIds } }).select("_id").lean();
    const districtIdsForKams = districtsForKams.map((d: any) => d._id);
    clauses.push({
      $or: [
        { kam_id: { $in: validKamIds } },
        { "doctor_info.district_id": { $in: districtIdsForKams } },
      ],
    });
  }

  let itemMatch: any = null;
  if (productIds) {
    const products = await Product.find({ _id: { $in: productIds } }).select("name").lean();
    const productNames = products.map((p: any) => p.name);
    if (productNames.length === 0) return empty;
    itemMatch = { "items.name": { $in: productNames } };
  }

  return { match: clauses.length ? { $and: clauses } : {}, itemMatch, empty: false };
}
