import React, { useState } from "react";

export default function Navbar({
  user,
  isDark,
  toggleTheme,
  toggleSidebar,
  onLogout,
  onProfileClick,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-left">
        {/* Hamburger Menu */}
        <button className="hamburger" onClick={toggleSidebar}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <h1 className="app-title">🌐 DeCloud</h1>
        <input
          type="text"
          className="navbar-search"
          placeholder="🔍 Search files, groups..."
        />
      </div>

      <div className="navbar-right">
        {/* Theme Toggle */}
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {isDark ? "🌙" : "☀️"}
        </button>

        {/* User Menu */}
        <div className="user-menu-container">
          <button
            className="user-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
            <span className="username">{user?.username}</span>
            <span className="dropdown-icon">▼</span>
          </button>

          {menuOpen && (
            <>
              <div
                className="menu-overlay"
                onClick={() => setMenuOpen(false)}
              />
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {user?.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="dropdown-username">{user?.username}</div>
                    <div className="dropdown-email">{user?.email}</div>
                  </div>
                </div>

                <div className="dropdown-divider" />

                <button
                  className="dropdown-item"
                  onClick={() => {
                    onProfileClick();
                    setMenuOpen(false);
                  }}
                >
                  <span>👤</span> My Profile
                </button>

                <button className="dropdown-item">
                  <span>⚙️</span> Settings
                </button>

                <button className="dropdown-item">
                  <span>📊</span> Storage: {Math.round((user?.storageUsed || 0) / 1024 / 1024)}MB
                </button>

                <button className="dropdown-item">
                  <span>❓</span> Help & Support
                </button>

                <div className="dropdown-divider" />

                <button
                  className="dropdown-item danger"
                  onClick={() => {
                    onLogout();
                    setMenuOpen(false);
                  }}
                >
                  <span>🚪</span> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}