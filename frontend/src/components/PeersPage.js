// src/components/PeersPage.js
import React from "react";
import "./PeersPage.css";

export default function PeersPage({ peers = [], onRefresh }) {
  return (
    <div className="peers-page">
      <div className="peers-header">
        <h2>Peers</h2>
        <p className="muted">Devices discovered on your local network.</p>
      </div>

      <div className="peers-grid">
        {peers.length === 0 ? (
          <div className="empty">No peers discovered yet.</div>
        ) : (
          peers.map((p, idx) => (
            <div key={p.ip + p.port + idx} className="peer-card card">
              <div className="peer-top">
                <div className="peer-name">{p.name || p.peerId}</div>
                <div className="peer-ip">{p.ip}:{p.port}</div>
              </div>
              <div className="peer-meta muted">Last seen: {new Date(p.lastSeen).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={onRefresh} className="refresh-btn">Refresh Peers</button>
      </div>
    </div>
  );
}
