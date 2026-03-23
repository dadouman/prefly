import { useState, useEffect } from "react";
import {
  getPrebuiltLists,
  addPrebuiltList,
  updatePrebuiltList,
  deletePrebuiltList,
  exportListsJSON,
  resetToRemoteLists,
  isAdminConfigured,
  setAdminPin,
  verifyAdminPin,
} from "./storage";

function AdminLogin({ onLogin, onBack }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const configured = isAdminConfigured();
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState(configured ? "login" : "setup");

  const handleLogin = () => {
    if (verifyAdminPin(pin)) {
      onLogin();
    } else {
      setError("Code incorrect");
      setPin("");
    }
  };

  const handleSetup = () => {
    if (pin.length < 4) {
      setError("Le code doit contenir au moins 4 caractères");
      return;
    }
    if (pin !== confirmPin) {
      setError("Les codes ne correspondent pas");
      return;
    }
    setAdminPin(pin);
    onLogin();
  };

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 420 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>⚙ ⚙ ⚙</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Administration</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}>
          {step === "login" ? "Connexion" : "Configuration"}
        </h2>
      </div>

      <div className="card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
        {step === "setup" && (
          <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.6, textAlign: "center" }}>
            Créez un code administrateur pour protéger l'accès.
          </p>
        )}

        <div>
          <span className="label">{step === "login" ? "Code admin" : "Nouveau code"}</span>
          <input
            type="password"
            className="admin-input"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && (step === "login" ? handleLogin() : null)}
            placeholder="••••"
            autoFocus
          />
        </div>

        {step === "setup" && (
          <div>
            <span className="label">Confirmer le code</span>
            <input
              type="password"
              className="admin-input"
              value={confirmPin}
              onChange={(e) => { setConfirmPin(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              placeholder="••••"
            />
          </div>
        )}

        {error && (
          <p style={{ fontSize: "0.78rem", color: "#c0392b", textAlign: "center" }}>{error}</p>
        )}

        <button
          className="btn-gold"
          onClick={step === "login" ? handleLogin : handleSetup}
          style={{ width: "100%" }}
        >
          {step === "login" ? "Entrer" : "Créer le code"} →
        </button>

        <button className="btn-ghost" onClick={onBack} style={{ width: "100%" }}>
          ← Retour
        </button>
      </div>
    </div>
  );
}

function ListEditor({ list, onSave, onCancel }) {
  const [name, setName] = useState(list?.name || "");
  const [description, setDescription] = useState(list?.description || "");
  const [itemsText, setItemsText] = useState(list?.items?.join("\n") || "");

  const handleSave = () => {
    const items = itemsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!name.trim() || items.length < 2) return;
    onSave({ name: name.trim(), description: description.trim(), items });
  };

  const itemCount = itemsText.split("\n").map((l) => l.trim()).filter(Boolean).length;

  return (
    <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
      <div>
        <span className="label">Nom de la liste</span>
        <input
          className="admin-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Films 2025"
          autoFocus
        />
      </div>

      <div>
        <span className="label">Description (optionnelle)</span>
        <input
          className="admin-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex : Les meilleurs films de l'année"
        />
      </div>

      <div>
        <span className="label">Éléments (un par ligne)</span>
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          placeholder={"Élément 1\nÉlément 2\nÉlément 3"}
          style={{ minHeight: 160 }}
        />
        {itemCount > 0 && (
          <p style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "rgba(201,162,39,0.55)", letterSpacing: "0.05em" }}>
            {itemCount} élément{itemCount > 1 ? "s" : ""}
            {itemCount < 2 && <span style={{ color: "#c0392b" }}> · minimum 2 requis</span>}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.8rem" }}>
        <button
          className="btn-gold"
          onClick={handleSave}
          disabled={!name.trim() || itemCount < 2}
          style={{ flex: 1 }}
        >
          {list ? "Enregistrer" : "Créer"} ✓
        </button>
        <button className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel({ onBack }) {
  const [authed, setAuthed] = useState(false);
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | list id
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    getPrebuiltLists().then(setLists);
  }, []);

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} onBack={onBack} />;
  }

  const editingList = editing && editing !== "new" ? lists.find((l) => l.id === editing) : null;

  const handleSaveNew = async (data) => {
    setLists(await addPrebuiltList(data));
    setEditing(null);
  };

  const handleSaveEdit = async (data) => {
    setLists(await updatePrebuiltList(editing, data));
    setEditing(null);
  };

  const handleDelete = async (id) => {
    setLists(await deletePrebuiltList(id));
    setConfirmDelete(null);
  };

  const handleReset = async () => {
    resetToRemoteLists();
    setLists(await getPrebuiltLists());
  };

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 560 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>⚙ ⚙ ⚙</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Administration</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}>Listes pré-construites</h2>
        <p style={{ marginTop: "0.8rem", fontSize: "0.82rem", color: "var(--text-dim)" }}>
          Gérez les listes disponibles pour les utilisateurs.
        </p>
      </div>

      {editing ? (
        <ListEditor
          list={editingList}
          onSave={editingList ? handleSaveEdit : handleSaveNew}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginBottom: "1.5rem" }}>
            {lists.length === 0 && (
              <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
                <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>Aucune liste créée</p>
              </div>
            )}

            {lists.map((list) => (
              <div key={list.id} className="card admin-list-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.2rem" }}>
                    {list.name}
                  </div>
                  {list.description && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                      {list.description}
                    </div>
                  )}
                  <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", letterSpacing: "0.05em" }}>
                    {list.items.length} élément{list.items.length > 1 ? "s" : ""}
                    <span style={{ margin: "0 0.4rem", opacity: 0.4 }}>·</span>
                    {list.items.slice(0, 3).join(", ")}
                    {list.items.length > 3 && "…"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button className="admin-action-btn edit" onClick={() => setEditing(list.id)} title="Modifier">
                    ✎
                  </button>
                  {confirmDelete === list.id ? (
                    <button className="admin-action-btn delete confirm" onClick={() => handleDelete(list.id)} title="Confirmer la suppression">
                      ✓
                    </button>
                  ) : (
                    <button className="admin-action-btn delete" onClick={() => setConfirmDelete(list.id)} title="Supprimer">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-gold" onClick={() => setEditing("new")}>
              + Nouvelle liste
            </button>
            <button className="btn-ghost" onClick={exportListsJSON}>
              ↓ Exporter JSON
            </button>
            <button className="btn-ghost" onClick={handleReset}>
              ↺ Réinitialiser
            </button>
            <button className="btn-ghost" onClick={onBack}>
              ← Retour
            </button>
          </div>

          <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "var(--text-faint)", textAlign: "center", lineHeight: 1.7, letterSpacing: "0.03em" }}>
            Les modifications sont locales à votre navigateur.<br />
            Pour les publier : <strong>Exporter JSON</strong> → remplacer <code>public/lists.json</code> → redéployer.
          </p>
        </>
      )}
    </div>
  );
}
