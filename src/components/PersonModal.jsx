// src/components/PersonModal.jsx
import React from "react";

function PersonModal({ person, onClose }) {
  if (!person) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{person.name}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div>
            <span className="modal-field-label">ID:</span> {person.id}
          </div>
          {person.gender && (
            <div>
              <span className="modal-field-label">Gender:</span>{" "}
              {person.gender}
            </div>
          )}
          {person.title && (
            <div>
              <span className="modal-field-label">Title:</span>{" "}
              {person.title}
            </div>
          )}
          {person.birthDate && (
            <div>
              <span className="modal-field-label">Birth:</span>{" "}
              {person.birthDate}
            </div>
          )}
          {person.birthPlace && (
            <div>
              <span className="modal-field-label">Birth Place:</span>{" "}
              {person.birthPlace}
            </div>
          )}
          {person.deathDate && (
            <div>
              <span className="modal-field-label">Death:</span>{" "}
              {person.deathDate}
            </div>
          )}
          {person.deathPlace && (
            <div>
              <span className="modal-field-label">Death Place:</span>{" "}
              {person.deathPlace}
            </div>
          )}
          {person.note && (
            <div>
              <span className="modal-field-label">Note:</span>{" "}
              {person.note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PersonModal;
