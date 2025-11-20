import React, { useState, useEffect } from "react";
import axios from "axios";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieBanner from "./components/CookieBanner";
import "./App.css";

const API = axios.create({ baseURL: "http://localhost:5000/api" });

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

  // Form data states
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [tags, setTags] = useState("");

  // Profile edit
  const [editProfile, setEditProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");

  useEffect(() => {
    if (token) {
      API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchUser();
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

  // Update breadcrumbs
  useEffect(() => {
    const crumbs = ["Home"];
    if (view === "dashboard") crumbs.push("Dashboard");
    else if (view === "groups") crumbs.push("Groups");
    else if (view === "files" && selectedGroup) crumbs.push("Groups", selectedGroup.name);
    else if (view === "peers") crumbs.push("Network", "Peers");
    else if (view === "profile") crumbs.push("Profile");
    setBreadcrumbs(crumbs);
  }, [view, selectedGroup]);

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
      fetchGroups();
      fetchPeers();
      fetchStats();
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401) {
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
      notify(`Welcome ${isLogin ? "back" : ""}!`);
      setView("dashboard");
    } catch (err) {
      notify(err.response?.data?.error || "Authentication failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    delete API.defaults.headers.common["Authorization"];
    notify("Logged out successfully");
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.patch("/auth/preferences", {
        username: editUsername,
        email: editEmail,
      });
      await fetchUser();
      setEditProfile(false);
      notify("Profile updated successfully!");
    } catch (err) {
      notify(err.response?.data?.error || "Update failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post("/groups/create", {
        name: groupName,
        description: groupDesc,
      });
      notify(`Group created! Code: ${res.data.group.inviteCode}`);
      setGroupName("");
      setGroupDesc("");
      fetchGroups();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to create group", "error");
    } finally {
      setLoading(false);
    }
  };

  const joinGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.post("/groups/join", { inviteCode });
      notify("Joined group successfully!");
      setInviteCode("");
      fetchGroups();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to join group", "error");
    } finally {
      setLoading(false);
    }
  };

  const selectGroup = (group) => {
    setSelectedGroup(group);
    setView("files");
    fetchFiles(group.id);
  };

  const uploadFileToGroup = async (e) => {
    e.preventDefault();
    if (!uploadFile || !selectedGroup) {
      notify("Please select a file and group", "error");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("groupId", selectedGroup.id);
    formData.append("tags", JSON.stringify(tags.split(",").map((t) => t.trim())));
    try {
      await API.post("/files/upload", formData);
      notify("File uploaded & encrypted!");
      setUploadFile(null);
      setTags("");
      fetchFiles(selectedGroup.id);
      fetchStats();
    } catch (err) {
      notify(err.response?.data?.error || "Upload failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (fileId, filename) => {
    try {
      notify("Decrypting & downloading...");
      const res = await API.get(`/files/download/${fileId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify("Download complete!");
    } catch (err) {
      notify("Download failed", "error");
    }
  };

  const deleteFile = async (fileId) => {
    if (!window.confirm("Delete this file?")) return;
    try {
      await API.delete(`/files/${fileId}`);
      notify("File deleted!");
      fetchFiles(selectedGroup.id);
      fetchStats();
    } catch (err) {
      notify("Delete failed", "error");
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  const formatDate = (d) => new Date(d).toLocaleString();

  const storagePercent = stats
    ? ((stats.storageUsed / stats.storageLimit) * 100).toFixed(1)
    : 0;

  // Auth Screen
  if (!token || !user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>🌐 DeCloud</h1>
          <p>Decentralized Cloud Storage with End-to-End Encryption</p>
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
              onChange={(e) =>
                isLogin ? setLoginEmail(e.target.value) : setRegEmail(e.target.value)
              }
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

  // Main App
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
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-title">NAVIGATION</div>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => setView("dashboard")}
          >
            <span>📊</span> Dashboard
          </button>
          <button
            className={view === "groups" ? "active" : ""}
            onClick={() => setView("groups")}
          >
            <span>👥</span> Groups ({groups.length})
          </button>
          <button
            className={view === "peers" ? "active" : ""}
            onClick={() => setView("peers")}
          >
            <span>💻</span> Peers ({peers.length})
          </button>
          {selectedGroup && (
            <>
              <div className="sidebar-title" style={{ marginTop: "20px" }}>
                CURRENT GROUP
              </div>
              <button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>
                <span>📁</span> {selectedGroup.name}
              </button>
            </>
          )}
        </aside>

        <main className="main-content">
          {/* Breadcrumbs */}
          <div className="breadcrumbs">
            {breadcrumbs.map((crumb, i) => (
              <span key={i}>
                {crumb}
                {i < breadcrumbs.length - 1 && " / "}
              </span>
            ))}
          </div>

          {/* Dashboard */}
          {view === "dashboard" && stats && (
            <div>
              <h1 className="page-title">Dashboard</h1>
              <p className="muted">Overview of your storage and activity</p>

              {/* Storage Bar */}
              <div className="storage-bar-container">
                <div className="storage-info">
                  <span className="storage-label">Storage Used</span>
                  <span className="storage-values">
                    {formatSize(stats.storageUsed)} / {formatSize(stats.storageLimit)}
                  </span>
                </div>
                <div className="storage-bar">
                  <div
                    className="storage-fill"
                    style={{
                      width: `${storagePercent}%`,
                      background:
                        storagePercent > 90
                          ? "linear-gradient(90deg, #ef4444, #dc2626)"
                          : storagePercent > 70
                          ? "linear-gradient(90deg, #f59e0b, #d97706)"
                          : "linear-gradient(90deg, #10b981, #059669)",
                    }}
                  />
                </div>
                <div className="storage-percent">{storagePercent}% Used</div>
              </div>

              {/* Stats Grid */}
              <div className="stats-grid">
                <div className="stat-box">
                  <h3>Total Groups</h3>
                  <p>{stats.groupCount}</p>
                </div>
                <div className="stat-box">
                  <h3>Total Files</h3>
                  <p>{stats.fileCount}</p>
                </div>
                <div className="stat-box">
                  <h3>Peers Online</h3>
                  <p>{stats.peersOnline}</p>
                </div>
                <div className="stat-box">
                  <h3>Recent Transfers</h3>
                  <p>{stats.recentTransfers?.length || 0}</p>
                </div>
              </div>

              {/* Recent Activity */}
              {stats.recentTransfers && stats.recentTransfers.length > 0 && (
                <div className="card" style={{ marginTop: "32px" }}>
                  <h3 style={{ marginBottom: "16px" }}>Recent Activity</h3>
                  <div className="activity-list">
                    {stats.recentTransfers.slice(0, 5).map((t, i) => (
                      <div key={i} className="activity-item">
                        <span className="activity-icon">
                          {t.action === "upload" ? "📤" : t.action === "download" ? "📥" : "🗑️"}
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
            </div>
          )}

          {/* Groups */}
          {view === "groups" && (
            <div>
              <div className="groups-header">
                <h1 className="page-title">Groups</h1>
                <p className="muted">Create or join groups to share files securely</p>
              </div>

              <div className="groups-grid">
                {/* Create Group */}
                <div className="card create-card glass-border">
                  <h3>➕ Create New Group</h3>
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
                      placeholder="Description (optional)"
                      value={groupDesc}
                      onChange={(e) => setGroupDesc(e.target.value)}
                    />
                    <button type="submit" disabled={loading} className="glass-btn">
                      {loading ? "Creating..." : "Create Group"}
                    </button>
                  </form>
                </div>

                {/* Join Group */}
                <div className="card join-card glass-border">
                  <h3>🔗 Join Group</h3>
                  <form onSubmit={joinGroup}>
                    <input
                      type="text"
                      placeholder="Enter Invite Code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      required
                      maxLength={8}
                    />
                    <button type="submit" disabled={loading} className="glass-btn">
                      {loading ? "Joining..." : "Join Group"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Groups List */}
              <div className="groups-list">
                <h3>Your Groups</h3>
                {groups.length === 0 ? (
                  <p className="empty">No groups yet. Create or join one!</p>
                ) : (
                  <div className="list">
                    {groups.map((g) => (
                      <div key={g.id} className="group-item glass-border">
                        <div>
                          <strong>{g.name}</strong>
                          <div className="small">{g.description || "No description"}</div>
                          <div className="invite">
                            Invite Code: <code>{g.inviteCode}</code>
                          </div>
                        </div>
                        <div className="actions">
                          <span className="small">{g.memberCount} members</span>
                          <button onClick={() => selectGroup(g)} className="glass-btn">
                            Open →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Files */}
          {view === "files" && selectedGroup && (
            <div>
              <div className="files-header">
                <h2>📁 {selectedGroup.name}</h2>
                <p className="muted">
                  🔒 All files encrypted • {selectedGroup.memberCount} members
                </p>
              </div>

              {/* Upload */}
              <div className="upload-row glass-border">
                <form onSubmit={uploadFileToGroup} className="upload-form">
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Tags (optional)"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                  <button type="submit" disabled={loading || !uploadFile} className="glass-btn">
                    {loading ? "Uploading..." : "📤 Upload & Encrypt"}
                  </button>
                </form>
              </div>

              {/* Files List */}
              <div className="files-list">
                {files.length === 0 ? (
                  <p className="empty">No files in this group yet</p>
                ) : (
                  files.map((f) => (
                    <div key={f._id} className="file-item glass-border">
                      <div className="file-main">
                        <div className="file-name">📄 {f.originalName}</div>
                        <div className="file-meta">
                          {formatSize(f.size)} • {f.owner?.username} •{" "}
                          {formatDate(f.uploadedAt)}
                        </div>
                      </div>
                      <div className="file-actions">
                        <button
                          onClick={() => downloadFile(f._id, f.originalName)}
                          className="glass-btn"
                        >
                          📥 Download
                        </button>
                        {f.owner?._id === user.id && (
                          <button
                            onClick={() => deleteFile(f._id)}
                            className="glass-btn danger"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Peers */}
          {view === "peers" && (
            <div>
              <div className="peers-header">
                <h1 className="page-title">Network Peers</h1>
                <p className="muted">Devices connected on the same network</p>
                <button onClick={fetchPeers} className="refresh-btn glass-btn">
                  🔄 Refresh
                </button>
              </div>

              {/* Connection Instructions */}
              <div className="card glass-border" style={{ marginBottom: "24px" }}>
                <h3>🌐 How to Connect Devices</h3>
                <ol style={{ marginLeft: "20px", marginTop: "12px", lineHeight: "1.8" }}>
                  <li>Make sure all devices are on the <strong>same WiFi network</strong></li>
                  <li>Run the app on each device (start backend & frontend)</li>
                  <li>Wait 5-10 seconds for automatic peer discovery</li>
                  <li>Peers will appear below automatically</li>
                  <li>Create a group and share the invite code with peers</li>
                  <li>All group members can now share files securely!</li>
                </ol>
              </div>

              <div className="peers-grid">
                {peers.length === 0 ? (
                  <div className="card glass-border">
                    <p className="empty">
                      🔍 No peers discovered yet.
                      <br />
                      Make sure other devices are running on the same WiFi.
                    </p>
                  </div>
                ) : (
                  peers.map((p, i) => (
                    <div key={i} className="peer-card glass-border">
                      <div className="peer-name">💻 {p.name}</div>
                      <div className="peer-ip">
                        {p.ip}:{p.port}
                      </div>
                      <div className="peer-meta">
                        Last seen: {formatDate(p.lastSeen)}
                      </div>
                      <div className="peer-actions">
                        <button className="glass-btn">🔗 Connect</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Profile */}
          {view === "profile" && (
            <div>
              <h1 className="page-title">Profile Settings</h1>
              <p className="muted">Manage your account information</p>

              <div className="card glass-border" style={{ maxWidth: "600px" }}>
                {!editProfile ? (
                  <div>
                    <div style={{ marginBottom: "20px" }}>
                      <strong>Username:</strong> {user.username}
                    </div>
                    <div style={{ marginBottom: "20px" }}>
                      <strong>Email:</strong> {user.email}
                    </div>
                    <div style={{ marginBottom: "20px" }}>
                      <strong>Storage Used:</strong> {formatSize(user.storageUsed)} /{" "}
                      {formatSize(user.storageLimit)}
                    </div>
                    <button onClick={() => setEditProfile(true)} className="glass-btn">
                      ✏️ Edit Profile
                    </button>
                  </div>
                ) : (
                  <form onSubmit={updateProfile}>
                    <input
                      type="text"
                      placeholder="Username"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      required
                    />
                    <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                      <button type="submit" disabled={loading} className="glass-btn">
                        {loading ? "Saving..." : "💾 Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditProfile(false)}
                        className="glass-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
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

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}