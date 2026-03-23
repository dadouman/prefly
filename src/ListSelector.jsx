import { useState, useEffect } from "react";
import { getPrebuiltLists } from "./storage";

export default function ListSelector({ onSelect }) {
  const [lists, setLists] = useState([]);

  useEffect(() => {
    getPrebuiltLists().then(setLists);
  }, []);

  if (lists.length === 0) return null;

  return (
    <div className="list-selector">
      <span className="label">Ou choisir une liste pré-construite</span>
      <div className="list-selector-grid">
        {lists.map((list) => (
          <button
            key={list.id}
            className="list-selector-card"
            onClick={() => onSelect(list)}
          >
            <div className="list-selector-name">{list.name}</div>
            {list.description && (
              <div className="list-selector-desc">{list.description}</div>
            )}
            <div className="list-selector-count">
              {list.items.length} élément{list.items.length > 1 ? "s" : ""}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
