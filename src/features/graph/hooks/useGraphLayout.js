// src/features/graph/hooks/useGraphLayout.js
import { useMemo } from "react";
import {
  computeFullTreeLayout,
  computeCompactTreeLayout,
  computeFamilyLayout,
  computeFamilyEdges,
  NODE_DIMENSIONS,
} from "../utils/layoutAlgorithms";

export function useGraphLayout({
  viewMode,
  displayMode, // 'expanded' or 'compact'
  focusedFamily,
  enrichedPeople,
  families,
  peopleMap,
  childToFamilies,
}) {
  // Full tree layout (expanded)
  const fullTreeLayout = useMemo(() => {
    if (viewMode !== "full" || enrichedPeople.length === 0) {
      return { positions: new Map(), generations: [], edges: [] };
    }

    // Always use compact layout
    return computeCompactTreeLayout(enrichedPeople, families, peopleMap, childToFamilies);
  }, [viewMode, displayMode, enrichedPeople, families, peopleMap, childToFamilies]);

  // Family view layout
  const familyLayout = useMemo(() => {
    if (!focusedFamily || viewMode !== "family") {
      return { positions: new Map(), family: null, personId: null };
    }

    return computeFamilyLayout(focusedFamily, families, peopleMap, childToFamilies);
  }, [focusedFamily, families, viewMode, peopleMap, childToFamilies]);

  // Active layout
  const activeLayout = viewMode === "family" ? familyLayout : fullTreeLayout;

  // Canvas bounds
  const canvasBounds = useMemo(() => {
    if (activeLayout.positions.size === 0) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    }

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    // Use position width/height from layout (compact mode)
    activeLayout.positions.forEach((pos) => {
      const width = pos.width || NODE_DIMENSIONS.WIDTH;
      const height = pos.height || NODE_DIMENSIONS.HEIGHT;
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + width);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + height);
    });

    if (!isFinite(minX)) minX = 0;
    if (!isFinite(maxX)) maxX = 1000;
    if (!isFinite(minY)) minY = 0;
    if (!isFinite(maxY)) maxY = 1000;

    // Use minimal padding to ensure all content is visible
    // Add just enough padding to show edges and prevent clipping
    const padding = 5;
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
    };
  }, [activeLayout.positions]);

  // Edges
  const edges = useMemo(() => {
    if (viewMode === "full") return fullTreeLayout.edges || [];
    if (viewMode === "family") return computeFamilyEdges(familyLayout, peopleMap);
    return [];
  }, [viewMode, fullTreeLayout, familyLayout, peopleMap]);

  return {
    activeLayout,
    canvasBounds,
    edges,
  };
}