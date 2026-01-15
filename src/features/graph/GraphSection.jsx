// src/features/graph/GraphSection.jsx
import React from "react";
import { exportToSVG } from "../../utils/svgExport";
import { exportSvgStringToPdf } from "../../utils/pdfExport";
import { useGraphData } from "./hooks/useGraphData";
import { useGraphLayout } from "./hooks/useGraphLayout";
import { useGraphState } from "./hooks/useGraphState";
import Toolbar from "../../components/Toolbar";
import FamilyCanvas from "../../components/FamilyCanvas";
import PersonModal from "../../components/PersonModal";

async function fetchFontAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch font: " + url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function GraphSection() {
  // Load and parse data
  const {
    loading,
    error,
    peopleWithFlags,
    families,
    peopleMap,
    childToFamilies,
    spouseAttachments,
  } = useGraphData();

  // Manage view state
  const {
    selectedPerson,
    setSelectedPerson,
    focusedFamily,
    viewMode,
    displayMode,
    toggleDisplayMode,
    canvasResetKey,
    handleResetView,
    handleBackToFull,
    handlePersonClick,
  } = useGraphState();

  // Compute layout
  const { activeLayout, canvasBounds, edges } = useGraphLayout({
    viewMode,
    displayMode,
    focusedFamily,
    enrichedPeople: peopleWithFlags,
    families,
    peopleMap,
    childToFamilies,
  });

  // Export handlers
  const handleExportSVG = () => {
    const svgContent = exportToSVG(
      canvasBounds,
      edges,
      peopleWithFlags,
      activeLayout,
      spouseAttachments
    );
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `family-tree-${viewMode}-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const fontUrl = "/authentic-sans-condensed-90.otf";
    const b64 = await fetchFontAsBase64(fontUrl);

    const fontFaceCss = `
@font-face {
  font-family: "authentic";
  src: url(data:font/otf;base64,${b64}) format("opentype");
  font-weight: normal;
  font-style: normal;
}
`;

    const svgContent = exportToSVG(
      canvasBounds,
      edges,
      peopleWithFlags,
      activeLayout,
      spouseAttachments,
      {
        paper: "letter",
        orientation: "landscape",
        dpi: 300,
        marginIn: 0.5,
        paged: true,
        bg: "#f9fafb",
        fontFaceCss,
      }
    );

    await exportSvgStringToPdf(
      svgContent,
      `family-tree-${viewMode}-${Date.now()}.pdf`,
      { paper: "letter", orientation: "landscape" }
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="screen-center screen-dark">
        <div className="screen-message">Loading family tree…</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="screen-center screen-light">
        <div className="screen-message screen-message--error">{error}</div>
      </div>
    );
  }

  // Empty state
  if (peopleWithFlags.length === 0) {
    return (
      <div className="screen-center screen-light">
        <div className="screen-message">No people found in CSV</div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <Toolbar
        viewMode={viewMode}
        displayMode="compact"
        peopleCount={peopleWithFlags.length}
        onBackToFull={handleBackToFull}
        onExportPDF={handleExportPDF}
      />

      <FamilyCanvas
        key={canvasResetKey}
        activeLayout={activeLayout}
        canvasBounds={canvasBounds}
        edges={edges}
        peopleWithFlags={peopleWithFlags}
        spouseAttachments={spouseAttachments}
        onPersonClick={(person) => handlePersonClick(person, families)}
        displayMode="compact"
        peopleMap={peopleMap}
        viewMode={viewMode}
      />

      <PersonModal
        person={selectedPerson}
        onClose={() => setSelectedPerson(null)}
      />
    </div>
  );
}

export default GraphSection;