import type { HTMLAttributes } from "react";
import { getStellarExplorerUrl } from "@/lib/stellar";

export interface StellarAddressDisplayProps extends HTMLAttributes<HTMLDivElement> {
  /** Full Stellar address or transaction hash */
  value: string;
  /** 'address' shows a truncated account key; 'tx' links to explorer */
  type?: "address" | "tx";
  network?: string;
}

function truncate(s: string) {
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-8)}`;
}

export function StellarAddressDisplay({
  value,
  type = "address",
  network = "testnet",
  className,
  ...props
}: StellarAddressDisplayProps) {
  const display = truncate(value);

  if (type === "tx") {
    return (
      <div
        className={["inline-flex items-center gap-1", className ?? ""].join(
          " ",
        )}
        {...props}
      >
        <a
          href={getStellarExplorerUrl(value, network)}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          className="font-mono text-xs text-primary-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
        >
          {display}
        </a>
        {/* external link icon */}
        <svg
          className="w-3 h-3 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </div>
    );
  }

  return (
    <span
      title={value}
      className={[
        "font-mono text-xs text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded",
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {display}
    </span>
  );
}
