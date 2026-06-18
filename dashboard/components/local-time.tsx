"use client";

import React from "react";
import { useEffect, useState } from "react";

type LocalTimeProps = {
  iso: string;
  className?: string;
};

export function LocalTime({ iso, className }: LocalTimeProps) {
  const [formatted, setFormatted] = useState(iso);

  useEffect(() => {
    const date = new Date(iso);
    setFormatted(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date),
    );
  }, [iso]);

  return (
    <time className={className} dateTime={iso} suppressHydrationWarning>
      {formatted}
    </time>
  );
}
