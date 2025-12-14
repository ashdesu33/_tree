import React from "react";

function PersonCard({
  person,
  position,
  canvasBounds,
  attachedSpouses,
  onPersonClick,
}) {
  const genderNorm = (person.gender || "").toLowerCase();
  const isMale = genderNorm === "m" || genderNorm === "male";
  const isFemale = genderNorm === "f" || genderNorm === "female";

  const fillColor = "#ffffff";
  const strokeColor = "#341117";

  const handleRootClick = (e) => {
    e.stopPropagation();
    onPersonClick(person);
  };

  const handleSpouseClick = (spouse, e) => {
    e.stopPropagation();
    onPersonClick(spouse);
  };

  const handleStop = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className="person-card"
      style={{
        left: `${position.x - canvasBounds.minX}px`,
        top: `${position.y - canvasBounds.minY}px`,
      }}
      onClick={handleRootClick}
      onMouseDown={handleStop}
      onTouchStart={handleStop}
    >
      <div className="person-card-shape-wrapper">
        <svg
          className="person-card-shape-svg"
          width={250}
          height={120}
          viewBox="0 0 250 120"
        >
          {isMale && (
            <polygon
              points="125,4 250,116 0,116"
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="3"
            />
          )}

          {isFemale && (
            <ellipse
              cx="125"
              cy="60"
              rx="120"
              ry="60"
              fill={strokeColor}
              stroke={strokeColor}
              strokeWidth="2"
            />
          )}

          {!isMale && !isFemale && (
            <rect
              x="8"
              y="8"
              width="164"
              height="104"
              rx="14"
              ry="14"
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="2"
            />
          )}
        </svg>

        <div className="person-card-content">
        
          <div className="person-name">{person.name}</div>

          {person.title && (
            <div className="person-title">{person.title}</div>
          )}

          {(person.birthDate || person.deathDate) && (
            <div className="person-dates">
              {person.birthDate ? `b. ${person.birthDate}` : ""}
              {person.birthDate && person.deathDate ? " · " : ""}
              {person.deathDate ? `d. ${person.deathDate}` : ""}
            </div>
          )}
                {attachedSpouses.length > 0 && (
        <div className="person-spouses">
          {attachedSpouses.map((sp) => (
            <div key={sp.id} className="person-spouse-row">
              <span className="person-spouse-label">sp.</span>
              <button
                type="button"
                className="person-spouse-button"
                onClick={(e) => handleSpouseClick(sp, e)}
              >
                {sp.name}
              </button>
              {sp.birthDate && (
                <span className="person-spouse-birth">
                  b. {sp.birthDate}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

    </div>
  );
}

export default PersonCard;