import React, { useState, useEffect } from "react";
import axios from "axios";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieBanner from "./components/CookieBanner";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Axios instance for API calls
// Detect if we're on the network or localhost
const getAPIBaseURL = () => {
  // If we're accessing from network (not localhost), use network IP
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return "http://localhost:5000/api";
  } else {
    // Use the same hostname but port 5000 for backend
    return `http://${hostname}:5000/api`;
  }
};

const API = axios.create({ baseURL: getAPIBaseURL() });

function AppContent() {
  const { toggleTheme, isDark } = useTheme();
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState(["Home", "Dashboard"]);

  // Form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Data states
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [files, setFiles] = useState([]);
  const [peers, setPeers] = useState([]);
  const [stats, setStats] = useState(null);

  // Form data
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [tags, setTags] = useState("");

  // Profile
  const [editProfile, setEditProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");

  /** ======================
   *  AUTH CHECK + USER DATA
   ======================== */
  useEffect(() => {
    if (token) {
      API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchUser();
    } else {
      const savedToken = localStorage.getItem("token");
      if (savedToken) {
        setToken(savedToken);
        API.defaults.headers.common["Authorization"] = `Bearer ${savedToken}`;
      }
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        fetchGroups();
        fetchPeers();
        if (selectedGroup) fetchFiles(selectedGroup.id);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user, selectedGroup]);

  /** ======================
   *  BREADCRUMBS
   ======================== */
  useEffect(() => {
    const crumbs = ["Home"];

    if (view === "dashboard") crumbs.push("Dashboard");
    else if (view === "groups") crumbs.push("Groups");
    else if (view === "files" && selectedGroup) crumbs.push("Groups", selectedGroup.name);
    else if (view === "peers") crumbs.push("Network", "Peers");
    else if (view === "profile") crumbs.push("Profile");

    setBreadcrumbs(crumbs);
  }, [view, selectedGroup]);

  /** ======================
   *  HELPERS
   ======================== */
  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchUser = async () => {
  try {
    const res = await API.get("/auth/me");
    setUser(res.data);
    setEditUsername(res.data.username);
    setEditEmail(res.data.email);
    
    // Auto-join network group
    await API.post("/groups/join-network").catch(err => 
      console.log("Network group join:", err.response?.data)
    );
    
    fetchGroups();
    fetchPeers();
    fetchStats();
  } catch (err) {
    console.error(err);
    if (err.response?.status === 401 || err.response?.status === 403) {
      logout();
    }
  }
};

  const fetchGroups = async () => {
    try {
      const res = await API.get("/groups");
      setGroups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFiles = async (groupId) => {
    try {
      const res = await API.get(`/files/group/${groupId}`);
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPeers = async () => {
    try {
      const res = await API.get("/peers");
      setPeers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await API.get("/stats/dashboard");
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  /** ======================
   *  AUTH HANDLING
   ======================== */
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const data = isLogin
        ? { email: loginEmail, password: loginPassword }
        : { username: regUsername, email: regEmail, password: regPassword };

      const res = await API.post(endpoint, data);

      setToken(res.data.token);
      localStorage.setItem("token", res.data.token);
      setUser(res.data.user);
      setView("dashboard");
      notify("Welcome!");
    } catch (err) {
      notify(err.response?.data?.error || "Authentication failed", "error");
    }
    setLoading(false);
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    delete API.defaults.headers.common["Authorization"];
    notify("Logged out");
  };

  /** ======================
   *  PROFILE UPDATE
   ======================== */
  const updateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await API.patch("/auth/preferences", {
        username: editUsername,
        email: editEmail,
      });

      await fetchUser();
      notify("Profile updated!");
      setEditProfile(false);
    } catch (err) {
      notify("Update failed", "error");
    }
    setLoading(false);
  };

  /** ======================
   *  GROUPS
   ======================== */
  const createGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post("/groups/create", {
        name: groupName,
        description: groupDesc,
      });
      // server returns the created group object directly
      notify(`Group Created! Code: ${res.data.inviteCode}`);
      setGroupName("");
      setGroupDesc("");
      fetchGroups();
    } catch (err) {
      notify("Failed to create group", "error");
    }
    setLoading(false);
  };

  const joinGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.post("/groups/join", { inviteCode });
      notify("Joined group!");
      setInviteCode("");
      fetchGroups();
    } catch (err) {
      notify("Invalid invite code", "error");
    }
    setLoading(false);
  };

  const selectGroup = (group) => {
    setSelectedGroup(group);
    setView("files");
    fetchFiles(group.id);
  };

  /** ======================
   *  FILE HANDLING
   ======================== */
  const uploadFileToGroup = async (e) => {
    e.preventDefault();
    if (!uploadFile) return notify("Select a file", "error");

    setLoading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("groupId", selectedGroup.id);
    formData.append("tags", JSON.stringify(tags.split(",").map((t) => t.trim())));

    try {
      await API.post("/files/upload", formData);
      notify("File uploaded!");
      setUploadFile(null);
      setTags("");
      fetchFiles(selectedGroup.id);
      fetchStats();
    } catch (err) {
      notify("Upload failed", "error");
    }
    setLoading(false);
  };

  const downloadFile = async (id, name) => {
    try {
      const res = await API.get(`/files/download/${id}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      notify("Downloaded!");
    } catch (err) {
      notify("Download failed", "error");
    }
  };

  const deleteFile = async (id) => {
    if (!window.confirm("Delete this file?")) return;

    try {
      await API.delete(`/files/${id}`);
      notify("File deleted");
      fetchFiles(selectedGroup.id);
      fetchStats();
    } catch {
      notify("Delete failed", "error");
    }
  };

  /** ======================
   *  FORMAT HELPERS
   ======================== */
  const formatSize = (b) => {
    if (b === null || b === undefined) return "0B";
    if (b < 1024) return `${b}B`;
    return `${(b / 1024).toFixed(1)}KB`;
  };
  const formatDate = (d) => new Date(d).toLocaleString();

  const storagePercent = stats
    ? ((stats.storageUsed / stats.storageLimit) * 100).toFixed(1)
    : 0;

  /** ======================
   *  AUTH SCREEN
   ======================== */
  if (!token || !user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>🌐 DeCloud</h1>
          <p>Decentralized Cloud with End-to-End Encryption</p>

          <div className="auth-switch">
            <button className={isLogin ? "active" : ""} onClick={() => setIsLogin(true)}>
              Login
            </button>
            <button className={!isLogin ? "active" : ""} onClick={() => setIsLogin(false)}>
              Register
            </button>
          </div>

          <form onSubmit={handleAuth}>
            {!isLogin && (
              <input
                type="text"
                placeholder="Username"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={isLogin ? loginEmail : regEmail}
              onChange={(e) => (isLogin ? setLoginEmail(e.target.value) : setRegEmail(e.target.value))}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={isLogin ? loginPassword : regPassword}
              onChange={(e) =>
                isLogin ? setLoginPassword(e.target.value) : setRegPassword(e.target.value)
              }
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "Processing..." : isLogin ? "Login" : "Create Account"}
            </button>
          </form>
        </div>

        {notification && <div className={`notification ${notification.type}`}>{notification.msg}</div>}
      </div>
    );
  }

  /** ======================
   *  MAIN APP UI
   ======================== */
  return (
    <div className="app-wrapper">
      <Navbar
        user={user}
        isDark={isDark}
        toggleTheme={toggleTheme}
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onLogout={logout}
        onProfileClick={() => setView("profile")}
      />

      <div className="app-body">
        {/* SIDEBAR */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-title">NAVIGATION</div>

          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            📊 Dashboard
          </button>

          <button className={view === "groups" ? "active" : ""} onClick={() => setView("groups")}>
            👥 Groups ({groups.length})
          </button>

          <button className={view === "peers" ? "active" : ""} onClick={() => setView("peers")}>
            💻 Peers ({peers.length})
          </button>

          {selectedGroup && (
            <>
              <div className="sidebar-title" style={{ marginTop: 20 }}>
                CURRENT GROUP
              </div>

              <button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>
                📁 {selectedGroup.name}
              </button>
            </>
          )}
        </aside>

        <div 
          className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* MAIN CONTENT */}
        <main className="main-content">
          {/* BREADCRUMBS */}
          <div className="breadcrumbs">
            {breadcrumbs.map((c, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <span key={i}>
                  {last ? (
                    <span className="breadcrumb-current">{c}</span>
                  ) : (
                    <button
                      className="breadcrumb-link"
                      onClick={() => {
                        if (c === "Home" || c === "Dashboard") setView("dashboard");
                        if (c === "Groups") setView("groups");
                        if (c === "Network") setView("peers");
                        if (c === "Profile") setView("profile");
                      }}
                    >
                      {c}
                    </button>
                  )}
                  {i < breadcrumbs.length - 1 && " / "}
                </span>
              );
            })}
          </div>

          {/* DASHBOARD */}
          {view === "dashboard" && stats && (
            <>
              <h1 className="page-title">Dashboard</h1>
              <p className="muted">Overview of your usage</p>

              {/* STORAGE BAR */}
              <div className="storage-bar-container">
                <div className="storage-info">
                  <span>Storage Used</span>
                  <span>{formatSize(stats.storageUsed)} / {formatSize(stats.storageLimit)}</span>
                </div>

                <div className="storage-bar">
                  <div
                    className="storage-fill"
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>

                <div className="storage-percent">{storagePercent}% Used</div>
              </div>

              {/* STATS GRID */}
              <div className="stats-grid">
                <div className="stat-box"><h3>Groups</h3><p>{stats.groupCount}</p></div>
                <div className="stat-box"><h3>Files</h3><p>{stats.fileCount}</p></div>
                <div className="stat-box"><h3>Peers Online</h3><p>{stats.peersOnline}</p></div>
                <div className="stat-box">
                  <h3>Recent Transfers</h3>
                  <p>{stats.recentTransfers?.length || 0}</p>
                </div>
              </div>

              {/* RECENT ACTIVITY */}
              {stats.recentTransfers?.length > 0 && (
                <div className="card">
                  <h3>Recent Activity</h3>
                  <div className="activity-list">
                    {stats.recentTransfers.slice(0, 5).map((t, i) => (
                      <div key={i} className="activity-item">
                        <span className="activity-icon">
                          {t.action === "upload"
                            ? "📤"
                            : t.action === "download"
                            ? "📥"
                            : "🗑️"}
                        </span>
                        <div className="activity-info">
                          <div className="activity-name">
                            {t.action} - {t.fileId?.originalName || "Unknown"}
                          </div>
                          <div className="activity-meta">
                            {t.groupId?.name} • {formatDate(t.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* GROUPS */}
          {view === "groups" && (
            <>
              <h1 className="page-title">Groups</h1>
              <p className="muted">Create or join a group</p>

              <div className="groups-grid">
                {/* CREATE GROUP */}
                <div className="card">
                  <h3>Create Group</h3>
                  <form onSubmit={createGroup}>
                    <input
                      type="text"
                      placeholder="Group Name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={groupDesc}
                      onChange={(e) => setGroupDesc(e.target.value)}
                    />
                    <button type="submit" disabled={loading}>Create</button>
                  </form>
                </div>

                {/* NETWORK SHARE BANNER */}
                <div className="card" style={{ 
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  marginBottom: "24px",
                  border: "none"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ color: "white", marginBottom: "8px" }}>
                        🌐 Network Share
                      </h3>
                      <p style={{ opacity: 0.9, fontSize: "14px", margin: 0 }}>
                        Share files instantly with all {peers.length} device{peers.length !== 1 ? 's' : ''} on your network
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const networkGroup = groups.find(g => g.name === "__NETWORK_SHARE__" || g.inviteCode === "NETWORK");
                        if (networkGroup) {
                          selectGroup(networkGroup);
                        } else {
                          notify("Network group not found. Refreshing...", "info");
                          fetchGroups();
                        }
                      }}
                      style={{
                        background: "rgba(255,255,255,0.2)",
                        border: "2px solid white",
                        color: "white",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: "600",
                        transition: "all 0.3s"
                      }}
                      onMouseOver={(e) => e.target.style.background = "rgba(255,255,255,0.3)"}
                      onMouseOut={(e) => e.target.style.background = "rgba(255,255,255,0.2)"}
                    >
                      Open Network Share →
                    </button>
                  </div>
                </div>

                {/* JOIN GROUP */}
                <div className="card">
                  <h3>Join Group</h3>
                  <form onSubmit={joinGroup}>
                    <input
                      type="text"
                      placeholder="Invite Code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      required
                      maxLength={8}
                    />
                    <button type="submit" disabled={loading}>Join</button>
                  </form>
                </div>
              </div>

              {/* GROUP LIST */}
              <div className="groups-list">
                <h3>Your Private Groups</h3>
                {groups.filter(g => g.name !== "__NETWORK_SHARE__" && g.inviteCode !== "NETWORK").length === 0 ? (
                  <p className="empty">No groups yet.</p>
                ) : (
                  groups
                    .filter(g => g.name !== "__NETWORK_SHARE__" && g.inviteCode !== "NETWORK")
                    .map((g) => (
                      <div key={g.id} className="group-item">
                        <div>
                          <strong>{g.name}</strong>
                          <div className="small">{g.description || "No description"}</div>
                          <div>Invite Code: <code>{g.inviteCode}</code></div>
                        </div>
                        <button onClick={() => selectGroup(g)}>Open →</button>
                      </div>
                    ))
                )}
              </div>
            </>
          )}

          {/* FILES */}
          {view === "files" && selectedGroup && (
            <>
              <div className="files-header">
                <h2>📁 {selectedGroup.name}</h2>
                <p className="muted">🔒 All files encrypted • {selectedGroup.memberCount} members</p>
              </div>

              {/* UPLOAD */}
              <div className="upload-row">
                <form onSubmit={uploadFileToGroup}>
                  <input type="file" onChange={(e) => setUploadFile(e.target.files[0])} required />
                  <input
                    type="text"
                    placeholder="Tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                  <button type="submit" disabled={loading || !uploadFile}>
                    Upload
                  </button>
                </form>
              </div>

              {/* Connected devices for network share */}
              {(selectedGroup.name === "__NETWORK_SHARE__" || selectedGroup.inviteCode === "NETWORK") && (
                <div className="card glass-border" style={{ 
                  marginBottom: "20px", 
                  background: "#f0fdf4",
                  borderColor: "#22c55e" 
                }}>
                  <h3 style={{ color: "#166534", marginBottom: "12px" }}>
                    🌐 Connected Devices ({peers.length})
                  </h3>
                  {peers.length === 0 ? (
                    <p style={{ color: "#166534", margin: 0 }}>
                      No other devices online. Make sure other devices are running the app.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                      {peers.map((p, i) => (
                        <div key={i} style={{
                          background: "white",
                          padding: "12px",
                          borderRadius: "8px",
                          border: "1px solid #86efac"
                        }}>
                          <div style={{ fontWeight: "600", color: "#166534" }}>
                            💻 {p.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "4px" }}>
                            {p.ip}
                          </div>
                          <div style={{ fontSize: "11px", color: "#4ade80", marginTop: "4px" }}>
                            ● Online
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FILE LIST */}
              <div className="files-list">
                {files.length === 0 ? (
                  <p className="empty">No files yet.</p>
                ) : (
                  files.map((f) => (
                    <div key={f._id} className="file-item">
                      <div>
                        <div>📄 {f.originalName}</div>
                        <div className="file-meta">
                          {formatSize(f.size)} • {f.owner?.username} • {formatDate(f.uploadedAt)}
                        </div>
                      </div>

                      <div className="file-actions">
                        <button onClick={() => downloadFile(f._id, f.originalName)}>
                          Download
                        </button>

                        {f.owner?._id?.toString() === user.id && (
                          <button className="danger" onClick={() => deleteFile(f._id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* PEERS */}
          {view === "peers" && (
            <>
              <h1 className="page-title">Network Peers</h1>
              <p className="muted">Devices on same network</p>

              <button onClick={fetchPeers} className="refresh-btn">🔄 Refresh</button>

              {/* SIMPLE CONNECTION INSTRUCTIONS (OPTION B) */}
              <div className="card" style={{ marginTop: "20px" }}>
                <h3>🌐 How to Connect Devices</h3>
                <ol style={{ marginLeft: "20px", marginTop: "12px", lineHeight: "1.8" }}>
                  <li>Ensure all devices are on the <strong>same WiFi network</strong></li>
                  <li>Run backend & frontend on each device</li>
                  <li>Wait 5–10 seconds for automatic peer discovery</li>
                  <li>Peers will appear below automatically</li>
                  <li>Share the group invite code to collaborate</li>
                </ol>
              </div>

              <div className="peers-grid">
                {peers.length === 0 ? (
                  <div className="card">
                    <p className="empty">No peers detected.</p>
                  </div>
                ) : (
                  peers.map((p, i) => (
                    <div key={i} className="peer-card">
                      <div className="peer-name">💻 {p.name}</div>
                      <div className="peer-ip">
                        {p.ip}:{p.port}
                      </div>
                      <div className="peer-meta">Last seen: {formatDate(p.lastSeen)}</div>
                      <button className="glass-btn">Connect</button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* PROFILE */}
          {view === "profile" && (
            <>
              <h1 className="page-title">Profile</h1>

              <div className="card" style={{ maxWidth: 500 }}>
                {!editProfile ? (
                  <>
                    <div><strong>Username:</strong> {user.username}</div>
                    <div><strong>Email:</strong> {user.email}</div>
                    <div>
                      <strong>Storage:</strong> {formatSize(user.storageUsed)} / {formatSize(user.storageLimit)}
                    </div>

                    <button onClick={() => setEditProfile(true)}>Edit</button>
                  </>
                ) : (
                  <form onSubmit={updateProfile}>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                    />

                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      required
                    />

                    <div className="row">
                      <button type="submit" disabled={loading}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditProfile(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <Footer />
      <CookieBanner user={user} />

      {notification && (
        <div className={`notification ${notification.type}`}>{notification.msg}</div>
      )}
    </div>
  );
}

/** WRAPPER */
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
