import { useEffect, useRef, useState } from "react";

export default function useActivityLayout(activity) {
  const activityGridWrapRef = useRef(null);
  const [activityLayout, setActivityLayout] = useState({
    cellSize: 18,
    gap: 6,
  });

  useEffect(() => {
    const updateLayout = () => {
      if (!activity || !activityGridWrapRef.current) return;
      const containerWidth = activityGridWrapRef.current.clientWidth;
      const maxCell = 18;
      const maxGap = 6;
      const minCell = 10;
      const minGap = 2;
      const desiredWidth =
        activity.weeks * maxCell + Math.max(0, activity.weeks - 1) * maxGap;
      if (desiredWidth <= 0 || containerWidth <= 0) return;
      if (containerWidth >= desiredWidth) {
        setActivityLayout({ cellSize: maxCell, gap: maxGap });
        return;
      }

      const weeks = Math.max(1, activity.weeks);
      const scale = containerWidth / desiredWidth;
      let gap = Math.max(minGap, Math.floor(maxGap * scale));
      let cellSize = Math.floor(
        (containerWidth - Math.max(0, weeks - 1) * gap) / weeks
      );

      if (cellSize < minCell) {
        gap = Math.max(
          minGap,
          Math.floor((containerWidth - weeks * minCell) / Math.max(1, weeks - 1))
        );
        cellSize = Math.floor(
          (containerWidth - Math.max(0, weeks - 1) * gap) / weeks
        );
      }

      cellSize = Math.min(maxCell, Math.max(minCell, cellSize));
      gap = Math.min(maxGap, Math.max(minGap, gap));
      setActivityLayout({ cellSize, gap });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [activity]);

  return { activityGridWrapRef, activityLayout };
}
