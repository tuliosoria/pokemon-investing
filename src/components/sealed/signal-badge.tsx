import type { Signal, Confidence } from "@/lib/types/sealed";
import { getSignalBg, getConfidenceBg } from "@/lib/domain/sealed-forecast";

export function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${getSignalBg(signal)}`}
    >
      {signal === "Buy" && "● "}
      {signal === "Hold" && "◐ "}
      {signal === "Sell" && "○ "}
      {signal}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getConfidenceBg(confidence)}`}
    >
      {confidence} confidence
    </span>
  );
}
