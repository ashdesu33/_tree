import React from "react";

function Toolbar({
  viewMode,
  peopleCount,
  onBackToFull,
  onExportPDF, 
  onResetView,
}) {
  const hintText =
    viewMode === "full"
      ? "Click person to view family"
      : "Click person for details";

  return (
    <div className="app-header">
      <div>
        <span className="app-header-title">
          {viewMode === "full" ? "Full UAK Family Tree" : "Family View"}
        </span>
        <span className="app-header-meta">{peopleCount} people</span>
      </div>

      <div className="app-header-right">
        {viewMode === "family" && (
          <button className="btn btn--secondary" onClick={onBackToFull}>
            ← Back to Full Tree
          </button>
        )}

        <div className="app-header-hint">{hintText}</div>

        <button
          className="btn btn--primary"
          onClick={onExportPDF}
          title="Export PDF"
        >
          Export PDF
        </button>

        <button className="btn btn--primary" onClick={onResetView}>
          Reset View
        </button>
      </div>
    </div>
  );
}

export default Toolbar;