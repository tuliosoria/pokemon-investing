import type { SealedSetData } from "@/lib/types/sealed";
import { SEALED_PRODUCT_DESCRIPTIONS } from "@/lib/data/sealed-descriptions";

export interface DescriptionResult {
  text: string;
  source: "curated" | "templated";
}

export function buildDescription(set: SealedSetData): DescriptionResult {
  const curated = SEALED_PRODUCT_DESCRIPTIONS[set.id];
  if (curated) return { text: curated, source: "curated" };

  const parts: string[] = [];
  parts.push(`${set.name} is a ${set.productType} from ${set.releaseYear}.`);

  if (set.chaseCards?.length) {
    const chase = set.chaseCards.slice(0, 3).join(", ");
    parts.push(`Notable chase cards include ${chase}.`);
  }

  if (set.printRunLabel === "Limited") {
    parts.push(
      "Print run is reported as limited, which historically supports stronger price retention if collector demand persists.",
    );
  } else if (set.printRunLabel === "Overprinted") {
    parts.push(
      "This product was overprinted, so secondary supply remains plentiful and price upside depends heavily on a chase-card breakout.",
    );
  }

  const cs = set.factors.communityScore;
  if (typeof cs === "number") {
    if (cs >= 70) {
      parts.push(
        `Community engagement is strong (score ${cs}/100), suggesting durable collector demand.`,
      );
    } else if (cs <= 35) {
      parts.push(
        `Community engagement is muted (score ${cs}/100); price action will likely depend on broader market cycles rather than organic demand.`,
      );
    }
  }

  if (set.notes && set.notes.length > 0) {
    parts.push(set.notes);
  }

  parts.push(
    "Treat this as a speculative collectible, not a financial instrument: reprints, market cycles, and liquidity all materially affect outcomes.",
  );

  return { text: parts.join(" "), source: "templated" };
}
