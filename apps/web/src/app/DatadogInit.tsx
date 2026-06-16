"use client";

import { useEffect } from "react";
import { initDatadog } from "@/lib/datadog";

export default function DatadogInit() {
  useEffect(() => {
    initDatadog();
  }, []);
  return null;
}
