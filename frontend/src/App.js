import React, { useState, useEffect } from "react";
import axios from "axios";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieBanner from "./components/CookieBanner";
import FileManager from "./components/FileManager";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Axios instance for API calls
// Build API base URL from environment or current host so network clients
// (other devices on LAN) will contact the correct backend IP.
const getAPIBaseURL = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol || 'http:';

  // If explicit env var provided, prefer it
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;

  // Default: use the same hostname as the browser but target backend port 5000
  // e.g. http://192.168.1.105:3000 -> http://192.168.1.105:5000/api
  return `${protocol}//${hostname}:5000/api`;
};

const BASE_API = getAPIBaseURL();
axios.defaults.baseURL = BASE_API;
const API = axios.create({ baseURL: BASE_API, withCredentials: true });

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
  const [stats, setStats] = useState({
    fileCount: 0,
    groupCount: 0,
    peersOnline: 0
  });

  // Form data
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupPrivacy, setGroupPrivacy] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [tags, setTags] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDesc, setEditGroupDesc] = useState("");
  const [editGroupPrivacy, setEditGroupPrivacy] = useState(true);

  // Profile
  const [editProfile, setEditProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTheme, setSettingsTheme] = useState("light");
  const [emailNotifications, setEmailNotifications] = useState(true);

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
        if (view === "dashboard") fetchStats(); // Real-time dashboard updates
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user, selectedGroup, view]);

  /** ======================
   *  BREADCRUMBS
   ======================== */
  useEffect(() => {
    const crumbs = ["Home"];

    if (view === "dashboard") crumbs.push("Dashboard");
    else if (view === "groups") crumbs.push("Groups");
    else if (view === "files" && selectedGroup) {
      if (selectedGroup.name === "__NETWORK_SHARE__" || selectedGroup.inviteCode === "NETWORK") {
        crumbs.push("Network Share");
      } else {
        crumbs.push("Groups", selectedGroup.name);
      }
    }
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
    setSettingsTheme(res.data.theme || "light");
    setEmailNotifications(res.data.emailNotifications !== false);
    
    // Auto-join network group
    await API.post("/groups/join-network").catch(err => 
      console.log("Network group join:", err.response?.data)
    );
    
    // Fetch all data to populate UI
    await fetchGroups();
    await fetchPeers();
    await fetchStats();
  } catch (err) {
    console.error("Fetch user error:", err);
    if (err.response?.status === 401 || err.response?.status === 403) {
      logout();
    }
  }
};

  const fetchGroups = async () => {
    try {
      const res = await API.get("/groups");
      setGroups(res.data);
      console.log('Groups fetched:', res.data.length);
    } catch (err) {
      console.error('Fetch groups error:', err.response?.data || err.message);
    }
  };

  const fetchFiles = async (groupId) => {
    try {
      const res = await API.get(`/files/group/${groupId}`);
      setFiles(res.data);
      console.log('Files fetched for group:', groupId, res.data.length);
    } catch (err) {
      console.error('Fetch files error:', err.response?.data || err.message);
    }
  };

  const fetchPeers = async () => {
    try {
      const res = await API.get("/peers");
      setPeers(res.data);
      console.log('Peers fetched:', res.data.length);
    } catch (err) {
      console.error('Fetch peers error:', err.response?.data || err.message);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await API.get("/stats/dashboard");
      setStats(res.data);
      console.log('Stats fetched:', res.data);
    } catch (err) {
      console.error('Fetch stats error:', err.response?.data || err.message);
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

  const updateSettings = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await API.patch("/auth/settings", {
        theme: settingsTheme,
        emailNotifications: emailNotifications,
      });

      await fetchUser();
      notify("Settings updated!");
      setShowSettings(false);
    } catch (err) {
      notify("Failed to update settings", "error");
    }
    setLoading(false);
  };

  const connectToPeer = async (peerId, peerName) => {
    setLoading(true);
    try {
      const res = await API.post("/peers/connect", { peerId });
      notify(`Connected to ${peerName}!`);
      console.log("Peer connection:", res.data);
      // Refresh peers after connection
      fetchPeers();
    } catch (err) {
      console.error("Peer connect error:", err);
      notify(err.response?.data?.error || "Failed to connect to peer", "error");
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
        isPrivate: groupPrivacy,
      });
      // server returns the created group object directly
      notify(`Group Created! Code: ${res.data.inviteCode}`);
      setGroupName("");
      setGroupDesc("");
      setGroupPrivacy(true);
      // Fetch groups and stats to update UI immediately
      await fetchGroups();
      await fetchStats();
    } catch (err) {
      console.error("Create group error:", err);
      notify(err.response?.data?.error || "Failed to create group", "error");
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
      // Fetch groups and stats to update UI immediately
      await fetchGroups();
      await fetchStats();
    } catch (err) {
      console.error("Join group error:", err);
      notify(err.response?.data?.error || "Invalid invite code", "error");
    }
    setLoading(false);
  };

  const selectGroup = (group) => {
    setSelectedGroup(group);
    setView("files");
    fetchFiles(group.id);
  };

  const updateGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.patch(`/groups/${editingGroup.id}`, {
        name: editGroupName,
        description: editGroupDesc,
        isPrivate: editGroupPrivacy,
      });
      notify("Group updated!");
      setEditingGroup(null);
      await fetchGroups();
      await fetchStats();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to update group", "error");
    }
    setLoading(false);
  };

  const deleteGroup = async (groupId, groupName) => {
    if (!window.confirm(`Delete group "${groupName}"? All files will be permanently deleted.`)) {
      return;
    }
    
    setLoading(true);
    try {
      await API.delete(`/groups/${groupId}`);
      notify("Group deleted");
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setView("groups");
      }
      await fetchGroups();
      await fetchStats();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to delete group", "error");
    }
    setLoading(false);
  };

  const startEditGroup = (group) => {
    setEditingGroup(group);
    setEditGroupName(group.name);
    setEditGroupDesc(group.description || "");
    setEditGroupPrivacy(group.isPrivate !== false);
  };

  const leaveGroup = async (groupId, groupName) => {
    if (!window.confirm(`Leave group "${groupName}"? You will lose access to all files in this group.`)) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await API.post(`/groups/${groupId}/leave`);
      console.log('Leave group response:', response.data);
      notify("Left group successfully");
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setView("groups");
      }
      await fetchGroups();
      await fetchStats();
    } catch (err) {
      console.error('Leave group error:', err);
      console.error('Error response:', err.response?.data);
      notify(err.response?.data?.error || "Failed to leave group", "error");
    }
    setLoading(false);
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
      await fetchFiles(selectedGroup.id);
      await fetchStats();
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
      await fetchFiles(selectedGroup.id);
      await fetchStats();
    } catch {
      notify("Delete failed", "error");
    }
  };

  /** ======================
   *  FORMAT HELPERS
   ======================== */
  const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined || bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    const gb = bytes / (1024 * 1024 * 1024);
    
    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    } else if (mb >= 1) {
      return `${mb.toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  };
  
  const formatDate = (d) => new Date(d).toLocaleString();

  /** ======================
   *  AUTH SCREEN
   ======================== */
  if (!token || !user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>🌐 PersonalSpace</h1>
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
        onSettingsClick={() => setShowSettings(true)}
      />

      <div className="app-body">
        {/* SIDEBAR */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-title">NAVIGATION</div>

          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <span>📊 Dashboard</span>
          </button>

          <button className={view === "groups" ? "active" : ""} onClick={() => setView("groups")}>
            <span>👥 Groups</span>
            <span className="count-badge">{groups.length}</span>
          </button>

          <button className={view === "peers" ? "active" : ""} onClick={() => setView("peers")}>
            <span>💻 Peers</span>
            <span className="count-badge">{peers.length}</span>
          </button>

          <div className="sidebar-title" style={{ marginTop: 20 }}>
            NETWORK SHARING
          </div>

          <button 
            className={selectedGroup?.name === "__NETWORK_SHARE__" && view === "files" ? "active network-share-btn" : "network-share-btn"}
            onClick={() => {
              const networkGroup = groups.find(g => g.name === "__NETWORK_SHARE__" || g.inviteCode === "NETWORK");
              if (networkGroup) {
                selectGroup(networkGroup);
              } else {
                notify("Network Share not available. Please wait...", "info");
                fetchGroups();
              }
            }}
          >
            <span>🌐 Network Share</span>
            <span className="count-badge">{peers.length}</span>
          </button>

          {selectedGroup && selectedGroup.name !== "__NETWORK_SHARE__" && (
            <>
              <div className="sidebar-title" style={{ marginTop: 20 }}>
                CURRENT GROUP
              </div>

              <button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>
                <span>📁 {selectedGroup.name}</span>
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
          {view === "dashboard" && (
            <>
              <h1 className="page-title">Dashboard</h1>
              <p className="muted">Real-time overview of your usage • Updates every 5 seconds</p>

              {/* STATS GRID */}
              <div className="stats-grid">
                <div className="stat-box">
                  <h3>Groups</h3>
                  <p className="stat-number">{stats.groupCount || 0}</p>
                  <small className="stat-label">Active groups you're in</small>
                </div>
                <div className="stat-box">
                  <h3>Files</h3>
                  <p className="stat-number">{stats.fileCount || 0}</p>
                  <small className="stat-label">Files you've uploaded</small>
                </div>
                <div className="stat-box">
                  <h3>Peers Online</h3>
                  <p className="stat-number">{stats.peersOnline || 0}</p>
                  <small className="stat-label">Devices on your network</small>
                </div>
              </div>

              {/* QUICK ACTIONS */}
              <div className="card" style={{ marginTop: "24px" }}>
                <h3>⚡ Quick Actions</h3>
                <div className="quick-actions">
                  <button 
                    className="quick-action-btn"
                    onClick={() => setView("groups")}
                  >
                    <span className="action-icon">➕</span>
                    <div>
                      <strong>Create Group</strong>
                      <small>Start sharing files</small>
                    </div>
                  </button>
                  <button 
                    className="quick-action-btn"
                    onClick={() => setView("peers")}
                  >
                    <span className="action-icon">🌐</span>
                    <div>
                      <strong>View Peers</strong>
                      <small>{peers.length} device{peers.length !== 1 ? 's' : ''} online</small>
                    </div>
                  </button>
                  <button 
                    className="quick-action-btn"
                    onClick={() => {
                      const networkGroup = groups.find(g => g.name === "__NETWORK_SHARE__" || g.inviteCode === "NETWORK");
                      if (networkGroup) {
                        selectGroup(networkGroup);
                      } else {
                        notify("Network group not found", "error");
                      }
                    }}
                  >
                    <span className="action-icon">📁</span>
                    <div>
                      <strong>Network Share</strong>
                      <small>Share with all peers</small>
                    </div>
                  </button>
                  <button 
                    className="quick-action-btn"
                    onClick={() => fetchStats()}
                  >
                    <span className="action-icon">🔄</span>
                    <div>
                      <strong>Refresh Stats</strong>
                      <small>Update dashboard</small>
                    </div>
                  </button>
                </div>
              </div>
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
                    <div className="privacy-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={groupPrivacy}
                          onChange={(e) => setGroupPrivacy(e.target.checked)}
                        />
                        <span>🔒 Private Group</span>
                      </label>
                      <small className="muted">
                        {groupPrivacy ? "Only invited members can join" : "Anyone with code can join"}
                      </small>
                    </div>
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
                        <div className="group-item-content">
                          <div className="group-item-header">
                            <strong>{g.name}</strong>
                            <span className={`privacy-badge ${g.isPrivate ? 'private' : 'public'}`}>
                              {g.isPrivate ? '🔒 Private' : '🌐 Public'}
                            </span>
                          </div>
                          <div className="small">{g.description || "No description"}</div>
                          <div className="group-meta">
                            <span>Invite Code: <code>{g.inviteCode}</code></span>
                            <span>• {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
                            {g.isCreator && <span className="creator-badge">• 👑 Admin</span>}
                            {!g.isCreator && g.role && <span className="member-badge">• 👤 {g.role}</span>}
                          </div>
                        </div>
                        <div className="group-item-actions">
                          <button onClick={() => selectGroup(g)} className="btn-primary">Open →</button>
                          {g.isCreator ? (
                            <>
                              <button onClick={() => startEditGroup(g)} className="btn-secondary">✏️ Edit</button>
                              <button onClick={() => deleteGroup(g.id, g.name)} className="btn-danger">🗑️ Delete</button>
                            </>
                          ) : (
                            <button onClick={() => leaveGroup(g.id, g.name)} className="btn-warning">🚪 Leave</button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>

              {/* EDIT GROUP MODAL */}
              {editingGroup && (
                <div className="modal-overlay" onClick={() => setEditingGroup(null)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <h3>✏️ Edit Group</h3>
                    <form onSubmit={updateGroup}>
                      <input
                        type="text"
                        placeholder="Group Name"
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        required
                      />
                      <textarea
                        placeholder="Description"
                        value={editGroupDesc}
                        onChange={(e) => setEditGroupDesc(e.target.value)}
                        rows={3}
                      />
                      <div className="privacy-toggle">
                        <label>
                          <input
                            type="checkbox"
                            checked={editGroupPrivacy}
                            onChange={(e) => setEditGroupPrivacy(e.target.checked)}
                          />
                          <span>🔒 Private Group</span>
                        </label>
                        <small className="muted">
                          {editGroupPrivacy ? "Only invited members can join" : "Anyone with code can join"}
                        </small>
                      </div>
                      <div className="modal-actions">
                        <button type="submit" disabled={loading} className="btn-primary">
                          Save Changes
                        </button>
                        <button type="button" onClick={() => setEditingGroup(null)} className="btn-secondary">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}

          {/* FILES - Enhanced with FileManager Component */}
          {view === "files" && selectedGroup && (
            <FileManager
              group={selectedGroup}
              user={user}
              API={API}
              BASE_API={BASE_API}
              onBack={() => setView("groups")}
              notify={notify}
            />
          )}

          {/* PEERS */}
          {view === "peers" && (
            <>
              <h1 className="page-title">Network Peers</h1>
              <p className="muted">Discover and connect with devices on your local network</p>

              <button onClick={fetchPeers} className="refresh-btn">🔄 Refresh Peers</button>

              {/* PEER CONNECTION STATUS */}
              <div className="card" style={{ marginTop: "20px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", border: "none" }}>
                <h3 style={{ color: "white" }}>🌐 Peer Discovery Active</h3>
                <p style={{ opacity: 0.9, marginTop: "8px" }}>
                  {peers.length} device{peers.length !== 1 ? 's' : ''} found on your network
                </p>
              </div>

              {/* CONNECTION INSTRUCTIONS */}
              <div className="card" style={{ marginTop: "20px" }}>
                <h3>📡 How to Connect Devices</h3>
                <ol style={{ marginLeft: "20px", marginTop: "12px", lineHeight: "1.8" }}>
                  <li>Ensure all devices are on the <strong>same WiFi network</strong></li>
                  <li>Run backend & frontend on each device</li>
                  <li>Wait 5–10 seconds for automatic peer discovery</li>
                  <li>Click "Connect" to establish direct connection</li>
                  <li>Share files through Network Share group or invite to private groups</li>
                </ol>
              </div>

              <h3 style={{ marginTop: "24px" }}>Available Peers</h3>
              <div className="peers-grid">
                {peers.length === 0 ? (
                  <div className="card">
                    <p className="empty">No peers detected. Make sure other devices are running PersonalSpace.</p>
                  </div>
                ) : (
                  peers.map((p, i) => (
                    <div key={i} className="peer-card card">
                      <div className="peer-header">
                        <div className="peer-name">💻 {p.name}</div>
                        <span className="peer-status online">● Online</span>
                      </div>
                      <div className="peer-ip">
                        📍 {p.ip}:{p.port}
                      </div>
                      <div className="peer-meta">
                        Last seen: {formatDate(p.lastSeen)}
                      </div>
                      <div className="peer-actions">
                        <button 
                          className="btn-primary" 
                          onClick={() => connectToPeer(p.id || `${p.ip}:${p.port}`, p.name)}
                        >
                          🔗 Connect
                        </button>
                        <button 
                          className="btn-secondary" 
                          onClick={() => window.open(`http://${p.ip}:${p.port}`, "_blank")}
                        >
                          🌐 Open
                        </button>
                      </div>
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

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ Settings</h3>
            <form onSubmit={updateSettings}>
              <div className="settings-section">
                <h4>Appearance</h4>
                <div className="setting-item">
                  <label>
                    <span>Theme</span>
                    <select 
                      value={settingsTheme} 
                      onChange={(e) => setSettingsTheme(e.target.value)}
                    >
                      <option value="light">☀️ Light</option>
                      <option value="dark">🌙 Dark</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <h4>Notifications</h4>
                <div className="setting-item">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={emailNotifications}
                      onChange={(e) => setEmailNotifications(e.target.checked)}
                    />
                    <span>📧 Email Notifications</span>
                  </label>
                  <small className="muted">Receive email updates about file activities</small>
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" disabled={loading} className="btn-primary">
                  Save Settings
                </button>
                <button type="button" onClick={() => setShowSettings(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
