import React from "react";
import Link from "next/link";

import { DashboardRange } from "@/lib/types";

const RANGES: DashboardRange[] = ["24h", "7d", "30d"];

type RangeTabsProps = {
  current: DashboardRange;
};

export function RangeTabs({ current }: RangeTabsProps) {
  return (
    <div className="range-tabs" aria-label="Range selector">
      {RANGES.map((range) => {
        const active = range === current;
        return (
          <Link
            key={range}
            className={active ? "range-tab active" : "range-tab"}
            href={`/?range=${range}`}
          >
            {range}
          </Link>
        );
      })}
    </div>
  );
}
