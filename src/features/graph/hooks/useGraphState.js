// src/features/graph/hooks/useGraphState.js
import { useState } from "react";

export function useGraphState() {
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [focusedFamily, setFocusedFamily] = useState(null);
  const [viewMode, setViewMode] = useState("full");
  const [displayMode, setDisplayMode] = useState("compact"); // 'compact' or 'expanded'
  const [canvasResetKey, setCanvasResetKey] = useState(0);

  const handleResetView = () => setCanvasResetKey((k) => k + 1);

  const handleBackToFull = () => {
    setViewMode("full");
    setFocusedFamily(null);
    setSelectedPerson(null);
    handleResetView();
  };

  const toggleDisplayMode = () => {
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));
    handleResetView();
  };

  const handlePersonClick = (person, families) => {
    // Always show the clicked person's individual family tree
    // (all ancestors up to gen 0 and all direct children)
    setSelectedPerson(person);
    setFocusedFamily(person.id); // Use person ID as focus
    setViewMode("family");
    handleResetView();
  };

  return {
    selectedPerson,
    setSelectedPerson,
    focusedFamily,
    setFocusedFamily,
    viewMode,
    setViewMode,
    displayMode,
    toggleDisplayMode,
    canvasResetKey,
    handleResetView,
    handleBackToFull,
    handlePersonClick,
  };
}