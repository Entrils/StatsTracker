import { useEffect, useRef, useState } from "react";

export default function useChartMetricPill() {
  const [chartMetric, setChartMetric] = useState(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem("myProfile.chartMetric") || "all";
  });
  const chartToggleRef = useRef(null);
  const chartPillRefs = useRef({});
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("myProfile.chartMetric", chartMetric);
  }, [chartMetric]);

  useEffect(() => {
    const updatePill = () => {
      const container = chartToggleRef.current;
      const pill = chartPillRefs.current[chartMetric];
      if (!container || !pill) return;
      const cRect = container.getBoundingClientRect();
      const pRect = pill.getBoundingClientRect();
      setPillStyle({
        left: pRect.left - cRect.left,
        width: pRect.width,
      });
    };

    updatePill();
    window.addEventListener("resize", updatePill);
    return () => window.removeEventListener("resize", updatePill);
  }, [chartMetric]);

  return {
    chartMetric,
    setChartMetric,
    chartToggleRef,
    chartPillRefs,
    pillStyle,
  };
}
