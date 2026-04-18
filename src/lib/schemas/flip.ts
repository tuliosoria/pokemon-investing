import { z } from "zod";

export const flipSchema = z.object({
  buyPrice: z.coerce.number().min(0.01, "Required"),
  sellPrice: z.coerce.number().min(0.01, "Required"),
  marketplaceFeePct: z.coerce.number().min(0).max(100),
  paymentFeePct: z.coerce.number().min(0).max(100),
  shippingCost: z.coerce.number().min(0),
  packingCost: z.coerce.number().min(0),
  taxAdjustment: z.coerce.number().min(0),
});

export type FlipFormValues = z.infer<typeof flipSchema>;
