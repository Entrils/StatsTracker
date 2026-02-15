import { useState } from "react";

export default function useChartMetricPill() {
  const [chartMetric, setChartMetric] = useState("all");

  return {
    chartMetric,
    setChartMetric,
  };
}
