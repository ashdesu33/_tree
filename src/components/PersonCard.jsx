// src/components/CompactPersonCard.jsx
import React from "react";

function CompactPersonCard({
  person,
  position,
  canvasBounds,
  onPersonClick,
}) {
  const genderNorm = (person.gender || "").toLowerCase();
  const isMale = genderNorm === "m" || genderNorm === "male";
  const isFemale = genderNorm === "f" || genderNorm === "female";

  const handleClick = (e) => {
    e.stopPropagation();
    onPersonClick(person);
  };

  const handleStop = (e) => {
    e.stopPropagation();
  };

  // Calculate card dimensions based on name length
  const nameLength = person.name.length;
  const estimatedWidth = Math.max(80, Math.min(nameLength * 8 + 20, 180));
  
  // Use position width if available (from layout), otherwise estimate
  const cardWidth = position.width || estimatedWidth;
  const cardHeight = position.height || 50;

  // Shape size and position
  const shapeSize = 12;
  const shapeY = 8;

  // Connection point is at center
  const connectionX = cardWidth / 2;

  return (
    <div
      className="compact-person-card"
      style={{
        position: "absolute",
        left: `${position.x - canvasBounds.minX}px`,
        top: `${position.y - canvasBounds.minY}px`,
        width: `${cardWidth}px`,
        cursor: "pointer",
        textAlign: "center",
      }}
      onClick={handleClick}
      onMouseDown={handleStop}
      onTouchStart={handleStop}
    >
      {/* Gender indicator shape */}
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center",
        height: shapeY + shapeSize + 4,
        position: "relative",
      }}>
        {/* Visual connection point indicator (invisible, for debugging) */}
        <div style={{
          position: "absolute",
          left: `${connectionX}px`,
          top: 0,
          width: "2px",
          height: "2px",
          transform: "translate(-1px, 0)",
          pointerEvents: "none",
        }} />
        
        <svg width={shapeSize * 2} height={shapeSize * 2} style={{ display: "block" }}>
          {isMale && (
            <polygon
              points={`${shapeSize},2 ${shapeSize * 2 - 2},${shapeSize * 2 - 2} 2,${shapeSize * 2 - 2}`}
              fill="#341117"
              stroke="#341117"
              strokeWidth="1"
            />
          )}
          {isFemale && (
            <circle
              cx={shapeSize}
              cy={shapeSize}
              r={shapeSize - 2}
              fill="#341117"
              stroke="#341117"
              strokeWidth="1"
            />
          )}
          {!isMale && !isFemale && (
            <rect
              x="2"
              y="2"
              width={shapeSize * 2 - 4}
              height={shapeSize * 2 - 4}
              rx="2"
              fill="#341117"
              stroke="#341117"
              strokeWidth="1"
            />
          )}
        </svg>
      </div>

      {/* Name - main focus */}
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#341117",
          lineHeight: "1.2",
          wordBreak: "break-word",
          padding: "0 4px",
          marginTop: "2px",
        }}
      >
        {person.name}
      </div>

      {/* Birth year if available */}
      {person.birthDate && (
        <div
          style={{
            fontSize: "9px",
            color: "#6b7280",
            marginTop: "1px",
          }}
        >
          {person.birthDate.match(/\d{4}/) ? person.birthDate.match(/\d{4}/)[0] : person.birthDate}
        </div>
      )}
    </div>
  );
}

export default CompactPersonCard;