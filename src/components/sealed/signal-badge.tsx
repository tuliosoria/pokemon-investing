import type { Signal, Confidence } from "@/lib/types/sealed";
import { getSignalBg, getConfidenceBg } from "@/lib/domain/sealed-forecast";

export function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span
      className={`inline-flex min-w-[5rem] items-center justify-center rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] shadow-[0_8px_20px_rgba(0,0,0,0.2)] ${getSignalBg(signal)}`}
    >
      {signal}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getConfidenceBg(confidence)}`}
    >
      {confidence} confidence
    </span>
  );
}
