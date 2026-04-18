import { z } from "zod";

export const sealedSchema = z.object({
  acquisitionPrice: z.coerce.number().min(0.01, "Required"),
  currentMarketPrice: z.coerce.number().min(0.01, "Required"),
  annualGrowthPct: z.coerce.number().min(-100).max(500),
  holdPeriodMonths: z.coerce.number().min(1).max(120),
  marketplaceFeePct: z.coerce.number().min(0).max(100),
  storageCost: z.coerce.number().min(0),
  shippingCost: z.coerce.number().min(0),
  taxAdjustment: z.coerce.number().min(0),
});

export type SealedFormValues = z.infer<typeof sealedSchema>;
