import Order from "../models/Order";
import Distributor from "../models/Distributor";
import Rider, { IRider } from "../models/Rider";

// DEL-02: no lat/lng exists anywhere in the system (Distributor only has
// city_id), so city-match is used as the distance signal instead of real
// geodistance. Current active-order count for the distributor models load.
export async function calculateEDT(distributorId: string, patientCityId?: string | null): Promise<Date> {
  const distributor = await Distributor.findById(distributorId).select("city_id").lean();
  const sameCity = !!(distributor && patientCityId && String((distributor as any).city_id) === String(patientCityId));

  const activeLoad = await Order.countDocuments({
    "distributor_info.distributor_id": distributorId,
    "delivery.delivery_status": { $in: ["scheduled", "out_for_delivery"] },
  });

  const baseHours = sameCity ? 3 : 8;
  const loadPenaltyHours = Math.min(activeLoad * 0.5, 6);
  const totalHours = baseHours + loadPenaltyHours;

  return new Date(Date.now() + totalHours * 60 * 60 * 1000);
}

// DEL-04: no rider geolocation exists either, so "nearest-available" is
// approximated as least-busy — whichever active rider for this distributor
// currently has the fewest in-flight (scheduled/out_for_delivery) orders.
export async function autoAssignRider(distributorId: string): Promise<IRider | null> {
  const riders = await Rider.find({ distributor_id: distributorId, status: "active" }).lean();
  if (riders.length === 0) return null;

  const riderIds = riders.map((r) => r._id);
  const activeCounts = await Order.aggregate([
    {
      $match: {
        "delivery.rider_id": { $in: riderIds },
        "delivery.delivery_status": { $in: ["scheduled", "out_for_delivery"] },
      },
    },
    { $group: { _id: "$delivery.rider_id", count: { $sum: 1 } } },
  ]);
  const countMap = new Map<string, number>(activeCounts.map((c: any) => [String(c._id), c.count]));

  riders.sort((a: any, b: any) => (countMap.get(String(a._id)) || 0) - (countMap.get(String(b._id)) || 0));
  return riders[0] as unknown as IRider;
}
