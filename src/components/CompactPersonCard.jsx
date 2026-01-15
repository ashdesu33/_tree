// src/components/CompactPersonCard.jsx
import React from "react";

function CompactPersonCard({
  person,
  position,
  canvasBounds,
  onPersonClick,
  scale = 1, // Add scale prop to compensate text size
}) {
  const genderNorm = (person.gender || "").toLowerCase();
  const isMale = genderNorm === "m" || genderNorm === "male";
  const isFemale = genderNorm === "f" || genderNorm === "female";
  
  // Get generation for color coding
  const generation = person.generation ?? 0;
  
  // Color palette for different generations - burgundy/red palette
                const generationColors = [
                "#45131aff", // Gen 0 - Night Bordeaux
                "#91444bff", // Gen 1 - Intense Cherry (swapped with Gen 3)
                "#7f3f47ff", // Gen 2 - Burgundy
                "#310d12ff", // Gen 3 - Rich Mahogany (swapped with Gen 1)
                "#b4696fff", // Gen 4 - Lobster Pink
                "#a57d81ff", // Gen 5 - Custom color
                "#45131aff", // Gen 6 - Cycle back
                "#855a5dff", // Gen 7
                "#863f48ff", // Gen 8
              ];
  
  // Use generation-based color, cycle through palette for higher generations
  const genIndex = Math.abs(generation) % generationColors.length;
  const bgColor = generationColors[genIndex];
  const textColor = "#ffffff"; // White text for readability on dark backgrounds

  const handleClick = (e) => {
    e.stopPropagation();
    onPersonClick(person);
  };

  const handleStop = (e) => {
    e.stopPropagation();
  };

  // Use position width/height from layout algorithm (computed in layoutAlgorithms.js)
  // Cards should hug their content, so use the calculated width
  const cardWidth = position.width || 50;
  const cardHeight = position.height || 35;

  // Shape size - at least 10px wide for visibility
  const shapeSize = 12; // 12px ensures at least 10px visible width

  return (
    <div
      className="compact-person-card"
      style={{
        position: "absolute",
        left: `${position.x - canvasBounds.minX}px`,
        top: `${position.y - canvasBounds.minY}px`,
        width: "max-content", // Card width matches content exactly - hugs content
        minWidth: `${cardWidth}px`, // Ensure minimum width from layout calculation
        cursor: "pointer",
        textAlign: "center",
        backgroundColor: bgColor, // Generation-based background color
        borderRadius: "4px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        boxSizing: "border-box",
        padding: "4px 12px", // 12px horizontal padding to match layout calculation
      }}
      onClick={handleClick}
      onMouseDown={handleStop}
      onTouchStart={handleStop}
    >
      {/* Gender indicator shape - circle for female, triangle for male - bigger */}
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center",
        height: shapeSize + 2,
        marginBottom: "1px",
      }}>
        <svg width={shapeSize} height={shapeSize} style={{ display: "block" }}>
          {isMale && (
            <polygon
              points={`${shapeSize/2},2 ${shapeSize - 2},${shapeSize - 2} 2,${shapeSize - 2}`}
              fill={textColor}
              stroke="none"
            />
          )}
          {isFemale && (
            <circle
              cx={shapeSize/2}
              cy={shapeSize/2}
              r={shapeSize/2 - 2}
              fill={textColor}
              stroke="none"
            />
          )}
          {!isMale && !isFemale && (
            <rect
              x="2"
              y="2"
              width={shapeSize - 4}
              height={shapeSize - 4}
              rx="2"
              fill={textColor}
              stroke="none"
            />
          )}
        </svg>
      </div>

      {/* Name - 12pt font size, readable - card width is sized to fit this */}
      <div
        style={{
          fontSize: scale > 0 ? `${12 / scale}px` : "12px", // 12pt font size
          fontWeight: 600,
          color: textColor,
          lineHeight: "1.3",
          whiteSpace: "nowrap", // Keep name on single line
          overflow: "visible", // No overflow - card width is calculated generously to fit all content
          textOverflow: "clip", // No ellipsis - show full text
          padding: "0", // Padding is handled by parent container
          minHeight: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%", // Use full card width
          boxSizing: "border-box", // Include padding in width
        }}
        title={person.name} // Show full name on hover
      >
        {person.name}
      </div>

      {/* Birth year if available - smaller */}
      {person.birthDate && (
        <div
          style={{
            fontSize: scale > 0 ? `${7 / scale}px` : "7px", // Slightly smaller
            color: textColor,
            opacity: 0.8,
            marginTop: "1px",
            padding: "0", // Padding is handled by parent container
            overflow: "visible", // No overflow - card width fits content
            boxSizing: "border-box",
          }}
        >
          {person.birthDate.match(/\d{4}/) ? person.birthDate.match(/\d{4}/)[0] : person.birthDate}
        </div>
      )}
    </div>
  );
}

export default CompactPersonCard;