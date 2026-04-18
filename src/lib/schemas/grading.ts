import { z } from "zod";

export const gradeEvSchema = z.object({
  rawCardValue: z.coerce.number().min(0.01, "Required"),
  gradingCost: z.coerce.number().min(0, "Must be ≥ 0"),
  psa10Value: z.coerce.number().min(0.01, "Required"),
  psa9Value: z.coerce.number().min(0.01, "Required"),
  psa8Value: z.coerce.number().min(0),
  probabilityPsa10: z.coerce.number().min(0).max(100),
  probabilityPsa9: z.coerce.number().min(0).max(100),
  probabilityPsa8: z.coerce.number().min(0).max(100),
  marketplaceFeePct: z.coerce.number().min(0).max(100),
  shippingCost: z.coerce.number().min(0),
  insuranceCost: z.coerce.number().min(0),
  taxAdjustment: z.coerce.number().min(0),
});

export type GradeEvFormValues = z.infer<typeof gradeEvSchema>;
