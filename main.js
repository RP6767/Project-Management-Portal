import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, getDocs,
  addDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp,
  query, orderBy, where, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUSA6JbEnf9rZjBICneT7Vzcl9I5mNjQs",
  authDomain: "ppmp-44f69.firebaseapp.com",
  projectId: "ppmp-44f69",
  storageBucket: "ppmp-44f69.firebasestorage.app",
  messagingSenderId: "955635994099",
  appId: "1:955635994099:web:63175150dd2bb19a5a5686",
  measurementId: "G-CPYG1P0R0N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;
let editingTaskId = null;
let selectedUserFilter = null;
let currentChatId = null;
let currentChatPartner = null;
let chatUnsub = null;
let allUsers = [];
let localNotifications = JSON.parse(localStorage.getItem('pmp_notifs') || '[]');
let mentionDropdownUsers = [];
let mentionSelectedIndex = -1;
let mentionQuery = '';

const COLS = [
  { id: "backlog", label: "Backlog", emoji: "📝" },
  { id: "todo", label: "To Do", emoji: "🚀" },
  { id: "inprogress", label: "In Progress", emoji: "🔄" },
  { id: "review", label: "Review", emoji: "👀" },
  { id: "done", label: "Done", emoji: "✅" },
];

// ── AUTH STATE ──
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        currentUser = user;
        currentUserData = { uid: user.uid, ...snap.data() };
        allUsers = await getUsers();
        enterApp();
      } else {
        await signOut(auth);
        showAuth();
      }
    } catch (e) {
      showAuth();
    }
  } else {
    showAuth();
  }
});

function showAuth() {
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app-screen").style.display = "none";
}

function enterApp() {
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  setupRoleUI();
  showPage("dashboard");
  updateNotifBadge();
  startGlobalMentionListener();
}

// ── AUTH ──
window.switchAuthTab = (tab) => {
  document.querySelectorAll(".auth-tab").forEach((t, i) =>
    t.classList.toggle("active", tab === "login" ? i === 0 : i === 1)
  );
  document.getElementById("login-form").style.display = tab === "login" ? "" : "none";
  document.getElementById("register-form").style.display = tab === "register" ? "" : "none";
  document.getElementById("auth-error").style.display = "none";
};

window.doLogin = async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) return showAuthErr("Please fill all fields.");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) { showAuthErr(niceErr(e.code)); }
};

window.doRegister = async () => {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  if (!name || !email || !password) return showAuthErr("Please fill all fields.");
  if (password.length < 6) return showAuthErr("Password must be at least 6 characters.");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, role: "intern", createdAt: serverTimestamp()
    });
  } catch (e) { showAuthErr(niceErr(e.code)); }
};

window.doLogout = async () => {
  if (chatUnsub) chatUnsub();
  await signOut(auth);
  currentUser = null;
  currentUserData = null;
};

function showAuthErr(msg) {
  const el = document.getElementById("auth-error");
  el.style.display = "block";
  el.textContent = msg;
}

function niceErr(code) {
  return ({
    "auth/user-not-found": "No account with this email.",
    "auth/wrong-password": "Wrong password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "Email already registered.",
    "auth/weak-password": "Password too weak (min 6 chars).",
    "auth/too-many-requests": "Too many attempts — try later.",
  }[code] || "Something went wrong. Try again.");
}

// ── ROLE UI ──
function setupRoleUI() {
  const { role, name } = currentUserData;
  document.getElementById("sidebar-name").textContent = name;
  document.getElementById("sidebar-role").textContent = role;
  document.getElementById("sidebar-avatar").textContent = name.charAt(0).toUpperCase();
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";
  document.getElementById("admin-section").style.display = isAdmin ? "" : "none";
  document.getElementById("nav-users").style.display = isSuperAdmin ? "" : "none";
  document.getElementById("nav-createtask").style.display = isAdmin ? "" : "none";
  document.getElementById("kb-create-btn").style.display = isAdmin ? "" : "none";
  const sc = document.getElementById("super-select-container");
  if (sc) sc.style.display = isSuperAdmin ? "" : "none";
  if (isSuperAdmin) populateSuperSelect();
}

// ── NAVIGATION ──
window.showPage = (page) => {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  const nav = document.getElementById("nav-" + page);
  if (nav) nav.classList.add("active");
  const labels = { dashboard: "Dashboard", kanban: "Kanban Board", mytasks: "My Tasks", users: "User Management" };
  document.getElementById("topbar-breadcrumb").textContent = labels[page] || page;
  if (page === "kanban") renderKanban();
  if (page === "mytasks") renderMyTasks();
  if (page === "users") renderUsers();
  if (page === "dashboard") loadDashboard();
};

// ── DATA FETCHING ──
async function getTasks() {
  try {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const s = await getDocs(collection(db, "tasks"));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

async function getUsers() {
  const s = await getDocs(collection(db, "users"));
  return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

function visibleTasks(tasks) {
  const r = currentUserData.role;
  if (r === "superadmin") {
    if (selectedUserFilter) {
      if (selectedUserFilter === "unassigned") return tasks.filter((t) => !t.assignedTo);
      return tasks.filter((t) => t.assignedTo === selectedUserFilter);
    }
    return tasks;
  }
  if (r === "admin") return tasks;
  return tasks.filter((t) => t.assignedTo === currentUser.uid);
}

window.onSuperSelectChange = (val) => {
  selectedUserFilter = val || null;
  renderKanban();
  loadDashboard();
};

async function populateSuperSelect() {
  const sels = Array.from(document.querySelectorAll('.super-select'));
  if (!sels.length) return;
  const users = await getUsers();
  const opts = '<option value="">All users</option><option value="unassigned">Unassigned</option>' +
    users.map(u => `<option value="${u.uid}">${u.name} (${u.role})</option>`).join("");
  sels.forEach(s => (s.innerHTML = opts));
}

function sLabel(s) {
  return ({ backlog: "📝 Backlog", todo: "🚀 To Do", inprogress: "🔄 In Progress", review: "👀 Review", done: "✅ Done" }[s] || s);
}

function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function unescapeHtml(s) { return (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── DASHBOARD ──
async function loadDashboard() {
  const tasks = await getTasks();
  const today = new Date().toISOString().slice(0, 10);
  const vis = visibleTasks(tasks);
  document.getElementById("stat-total").textContent = vis.length;
  document.getElementById("stat-inprogress").textContent = vis.filter(t => t.status === "inprogress").length;
  document.getElementById("stat-done").textContent = vis.filter(t => t.status === "done").length;
  document.getElementById("stat-overdue").textContent = vis.filter(t => t.dueDate && t.dueDate < today && t.status !== "done").length;
  const cont = document.getElementById("recent-tasks");
  cont.innerHTML = vis.length
    ? vis.slice(0, 6).map(t => `
        <div class="recent-task-item" onclick="openTaskDetail('${t.id}')">
          <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
          <div style="flex:1;">
            <div class="recent-task-title">${escapeHtml(t.title)}</div>
            <div class="recent-task-assignee">${escapeHtml(t.assignedName || "Unassigned")}</div>
          </div>
          <span class="recent-task-status">${sLabel(t.status)}</span>
          ${t.dueDate ? `<span style="font-size:11px;color:${t.dueDate < today && t.status !== "done" ? "var(--danger)" : "var(--text-secondary)"}">Due ${t.dueDate}</span>` : ""}
        </div>`).join("")
    : '<div class="empty-state">No tasks yet — create one to get started!</div>';
}

// ── KANBAN ──
async function renderKanban() {
  const tasks = await getTasks();
  const vis = visibleTasks(tasks);
  const board = document.getElementById("kanban-board");
  board.innerHTML = COLS.map(col => {
    const ct = vis.filter(t => t.status === col.id);
    return `<div class="kanban-col" data-col="${col.id}">
      <div class="col-header">
        <div class="col-header-left"><span class="col-dot"></span>${col.label}</div>
        <span class="col-badge">${ct.length}</span>
      </div>
      <div class="col-body" id="col-${col.id}" ondragover="onDragOver(event,'${col.id}')" ondragleave="onDragLeave(event)" ondrop="onDrop(event,'${col.id}')">
        ${ct.map(t => taskCard(t)).join("")}
        ${ct.length === 0 ? '<div class="drop-hint">Drop tasks here</div>' : ""}
      </div></div>`;
  }).join("");
}

function taskCard(t) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = t.dueDate && t.dueDate < today && t.status !== "done";
  const role = currentUserData.role;
  const canEdit = role === "superadmin" || role === "admin" || t.assignedTo === currentUser.uid;
  const canDel = role === "superadmin" || role === "admin";
  return `<div class="task-card" draggable="${canEdit}" id="tc-${t.id}" ondragstart="onDragStart(event,'${t.id}')" onclick="openTaskDetail('${t.id}')">
    <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
    <div class="task-actions" onclick="event.stopPropagation()">
      ${canEdit ? `<div class="icon-btn" onclick="openEditTask('${t.id}')">✏️</div>` : ""}
      ${canDel ? `<div class="icon-btn delete" onclick="confirmDelete('${t.id}')">🗑</div>` : ""}
    </div>
    <div class="task-title">${escapeHtml(t.title)}</div>
    ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ""}
    <div class="task-meta">
      <div class="task-assignee"><div class="mini-avatar">${(t.assignedName || "?").charAt(0)}</div><span>${escapeHtml(t.assignedName || "Unassigned")}</span></div>
      ${t.dueDate ? `<span class="${overdue ? "overdue" : ""}" style="font-size:10px;">${overdue ? "⚠ " : ""}${t.dueDate}</span>` : ""}
    </div></div>`;
}

let dragId = null;
window.onDragStart = (e, id) => { dragId = id; setTimeout(() => document.getElementById("tc-" + id)?.classList.add("dragging"), 0); };
window.onDragOver = (e, col) => { e.preventDefault(); document.getElementById("col-" + col)?.classList.add("drag-over"); };
window.onDragLeave = (e) => { e.currentTarget.classList.remove("drag-over"); };
window.onDrop = async (e, col) => {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (!dragId) return;
  await updateDoc(doc(db, "tasks", dragId), { status: col });
  dragId = null;
  renderKanban();
  showToast("Moved to " + COLS.find(c => c.id === col).label, "success");
};

// ── MY TASKS ──
async function renderMyTasks() {
  const tasks = await getTasks();
  const mine = tasks.filter(t => t.assignedTo === currentUser.uid);
  const cont = document.getElementById("my-tasks-list");
  cont.innerHTML = mine.length
    ? mine.map(t => `
        <div class="my-task-item">
          <div class="my-task-info">
            <div class="my-task-header">
              <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
              <span class="my-task-title">${escapeHtml(t.title)}</span>
            </div>
            ${t.description ? `<div class="my-task-desc">${escapeHtml(t.description)}</div>` : ""}
          </div>
          <div class="my-task-controls">
            <select class="my-task-status-select" onchange="quickStatus('${t.id}',this.value)">
              ${COLS.map(c => `<option value="${c.id}" ${t.status === c.id ? "selected" : ""}>${c.emoji} ${c.label}</option>`).join("")}
            </select>
            <div class="my-task-due">
              <input type="date" value="${t.dueDate || ""}" onchange="quickDueDate('${t.id}',this.value)" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:var(--font-body);font-size:12px;outline:none;color:var(--text);">
            </div>
          </div>
        </div>`).join("")
    : '<div class="empty-state">No tasks assigned to you yet.</div>';
}

window.quickStatus = async (id, status) => { await updateDoc(doc(db, "tasks", id), { status }); showToast("Status updated!", "success"); renderMyTasks(); };
window.quickDueDate = async (id, dueDate) => { await updateDoc(doc(db, "tasks", id), { dueDate }); showToast("Due date updated!", "success"); renderMyTasks(); };

// ── USERS ──
async function renderUsers() {
  const users = await getUsers();
  document.getElementById("users-list").innerHTML = users.map(u => `
    <div class="table-row">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="mini-avatar" style="width:30px;height:30px;border-radius:8px;font-size:12px;">${u.name.charAt(0)}</div>
        <span>${escapeHtml(u.name)}</span>
      </div>
      <div style="color:var(--text-secondary);font-size:12px;">${escapeHtml(u.email)}</div>
      <div><span class="role-badge role-${u.role}">${u.role}</span></div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${currentUserData.role === "superadmin" && u.uid !== currentUser.uid ? `
          <select style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:var(--font-body);font-size:11px;cursor:pointer;outline:none;color:var(--text);" onchange="changeRole('${u.uid}',this.value)">
            <option value="intern" ${u.role === "intern" ? "selected" : ""}>Intern</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="superadmin" ${u.role === "superadmin" ? "selected" : ""}>Super Admin</option>
          </select>
          <div class="icon-btn delete" onclick="removeUser('${u.uid}')">🗑</div>
        ` : '<span style="color:var(--text-muted);font-size:11px;">—</span>'}
      </div>
    </div>`).join("");
}

window.changeRole = async (uid, role) => { await updateDoc(doc(db, "users", uid), { role }); showToast("Role updated!", "success"); renderUsers(); };
window.removeUser = async (uid) => {
  if (!confirm("Remove this user?")) return;
  await deleteDoc(doc(db, "users", uid));
  renderUsers();
  showToast("User removed", "success");
};

// ── TASK MODALS ──
window.openCreateTask = async () => {
  editingTaskId = null;
  document.getElementById("task-modal-title").textContent = "Create Task";
  document.getElementById("task-save-btn").textContent = "Create Task";
  ["task-title", "task-desc"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("task-priority").value = "Medium";
  document.getElementById("task-due").value = "";
  document.getElementById("task-status").value = "todo";
  await loadAssignees(null);
  openModal("task-modal");
};

window.openEditTask = async (id) => {
  editingTaskId = id;
  const snap = await getDoc(doc(db, "tasks", id));
  if (!snap.exists()) return;
  const t = snap.data();
  document.getElementById("task-modal-title").textContent = "Edit Task";
  document.getElementById("task-save-btn").textContent = "Save Changes";
  document.getElementById("task-title").value = t.title || "";
  document.getElementById("task-desc").value = t.description || "";
  document.getElementById("task-priority").value = t.priority || "Medium";
  document.getElementById("task-due").value = t.dueDate || "";
  document.getElementById("task-status").value = t.status || "todo";
  await loadAssignees(t.assignedTo);
  openModal("task-modal");
};

async function loadAssignees(sel) {
  const users = await getUsers();
  document.getElementById("task-assignee").innerHTML =
    '<option value="">— Unassigned —</option>' +
    users.map(u => `<option value="${u.uid}" ${u.uid === sel ? "selected" : ""}>${escapeHtml(u.name)} (${u.role})</option>`).join("");
}

window.saveTask = async () => {
  const title = document.getElementById("task-title").value.trim();
  if (!title) return showToast("Title is required", "error");
  const el = document.getElementById("task-assignee");
  const assignedTo = el.value || null;
  const assignedName = assignedTo ? el.options[el.selectedIndex].text.split(" (")[0] : null;
  const data = { title, description: document.getElementById("task-desc").value.trim(), priority: document.getElementById("task-priority").value, dueDate: document.getElementById("task-due").value, status: document.getElementById("task-status").value, assignedTo, assignedName };
  try {
    if (editingTaskId) {
      await updateDoc(doc(db, "tasks", editingTaskId), data);
    } else {
      await addDoc(collection(db, "tasks"), { ...data, createdBy: currentUser.uid, comments: [], dailyLogs: [], createdAt: serverTimestamp() });
    }
    closeModal("task-modal");
    renderKanban();
    loadDashboard();
    showToast(editingTaskId ? "Task updated!" : "Task created!", "success");
  } catch (e) { showToast("Error: " + e.message, "error"); }
};

// ── USER MODAL ──
window.openCreateUser = () => {
  ["u-name", "u-email", "u-password"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("u-role").value = "intern";
  openModal("user-modal");
};

window.saveUser = async () => {
  const name = document.getElementById("u-name").value.trim();
  const email = document.getElementById("u-email").value.trim();
  const password = document.getElementById("u-password").value;
  const role = document.getElementById("u-role").value;
  if (!name || !email || !password) return showToast("Fill all fields", "error");
  if (password.length < 6) return showToast("Password min 6 chars", "error");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), { name, email, role, createdAt: serverTimestamp() });
    closeModal("user-modal");
    renderUsers();
    showToast("User created!", "success");
  } catch (e) { showToast(niceErr(e.code), "error"); }
};

// ── TASK DETAIL ──
window.openTaskDetail = async (id) => {
  const snap = await getDoc(doc(db, "tasks", id));
  if (!snap.exists()) return;
  const t = { id, ...snap.data() };
  const today = new Date().toISOString().slice(0, 10);
  const role = currentUserData.role;
  const isOwner = t.assignedTo === currentUser.uid;
  const canEdit = role === "admin" || role === "superadmin" || isOwner;
  const canDel = role === "admin" || role === "superadmin";
  const canLog = canEdit;
  const logs = t.dailyLogs || [];

  document.getElementById("detail-title").textContent = t.title;
  document.getElementById("detail-body").innerHTML = `
    <div class="detail-badges">
      <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
      <span class="detail-status-badge">${sLabel(t.status)}</span>
    </div>
    ${t.description ? `<div class="detail-description">${escapeHtml(t.description)}</div>` : ""}
    <div class="detail-info-grid">
      <div>
        <div class="detail-info-label">Assigned To</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
          <div class="mini-avatar">${(t.assignedName || "?").charAt(0)}</div>
          ${escapeHtml(t.assignedName || "Unassigned")}
        </div>
      </div>
      <div>
        <div class="detail-info-label">Due Date</div>
        ${canEdit ? `<div class="due-date-edit">
            <input type="date" id="detail-due-input" value="${t.dueDate || ""}">
            <button class="due-date-save-btn" onclick="updateDueDate('${id}')">Save</button>
          </div>`
          : (t.dueDate ? `<span style="color:${t.dueDate < today && t.status !== "done" ? "var(--danger)" : "inherit"}">${t.dueDate}</span>` : "—")}
      </div>
    </div>
    <div class="detail-comments-section">
      <div class="detail-comments-title">Comments (${(t.comments || []).length})</div>
      ${(t.comments || []).length ? t.comments.map(c => `<div class="comment-item"><div class="comment-author">${escapeHtml(c.author)}</div><div>${escapeHtml(c.text)}</div></div>`).join("") : '<div class="detail-no-comments">No comments yet.</div>'}
      <div class="comment-input-row">
        <input type="text" id="cmt-input" placeholder="Add a comment..." onkeydown="if(event.key==='Enter')addComment('${id}')">
        <button onclick="addComment('${id}')">Post</button>
      </div>
    </div>
    <div class="daily-logs-section">
      <div class="daily-logs-title">Daily Logs (${logs.length})</div>
      ${logs.length ? logs.map(l => `<div class="daily-log-item"><div class="daily-log-header"><span class="daily-log-author">${escapeHtml(l.author)}</span><span class="daily-log-date">${l.date || ""}</span></div><div class="daily-log-text">${escapeHtml(l.text)}</div></div>`).join("") : '<div class="detail-no-comments">No daily logs yet.</div>'}
      ${canLog ? `<div class="log-input-area"><textarea id="log-input" placeholder="What did you work on today?"></textarea><div class="log-submit-row"><button class="btn-submit" onclick="addDailyLog('${id}')">Add Log</button></div></div>` : ""}
    </div>
    <div class="detail-actions">
      ${canEdit ? `<button class="btn-submit" onclick="closeModal('detail-modal');openEditTask('${id}')">Edit Task</button>` : ""}
      ${canDel ? `<button class="btn-secondary" onclick="confirmDelete('${id}');closeModal('detail-modal')">Delete</button>` : ""}
    </div>`;
  openModal("detail-modal");
};

window.updateDueDate = async (id) => {
  const dateVal = document.getElementById("detail-due-input").value;
  await updateDoc(doc(db, "tasks", id), { dueDate: dateVal });
  showToast("Due date updated!", "success");
  openTaskDetail(id);
};

window.addDailyLog = async (id) => {
  const el = document.getElementById("log-input");
  const text = el.value.trim();
  if (!text) return showToast("Please enter your daily log", "error");
  const today = new Date().toISOString().slice(0, 10);
  await updateDoc(doc(db, "tasks", id), { dailyLogs: arrayUnion({ author: currentUserData.name, text, date: today, ts: Date.now() }) });
  el.value = "";
  openTaskDetail(id);
  showToast("Daily log added!", "success");
};

window.addComment = async (id) => {
  const el = document.getElementById("cmt-input");
  const text = el.value.trim();
  if (!text) return;
  await updateDoc(doc(db, "tasks", id), { comments: arrayUnion({ author: currentUserData.name, text, ts: Date.now() }) });
  el.value = "";
  openTaskDetail(id);
  showToast("Comment added!", "success");
};

window.confirmDelete = async (id) => {
  if (!confirm("Delete this task permanently?")) return;
  await deleteDoc(doc(db, "tasks", id));
  renderKanban();
  loadDashboard();
  showToast("Task deleted", "success");
};

// ── MODALS ──
window.openModal = (id) => document.getElementById(id).classList.add("open");
window.closeModal = (id) => document.getElementById(id).classList.remove("open");

document.querySelectorAll(".modal-overlay").forEach(o => o.addEventListener("click", e => { if (e.target === o) o.classList.remove("open"); }));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open")); });

// ── NOTIFICATIONS ──
function updateNotifBadge() {
  const unread = localNotifications.filter(n => !n.read).length;
  const countEl = document.getElementById("notif-count");
  const chatBadge = document.getElementById("chat-unread-badge");
  if (unread > 0) {
    countEl.style.display = "flex";
    countEl.textContent = unread > 9 ? "9+" : unread;
  } else {
    countEl.style.display = "none";
  }
  const chatNotifs = localNotifications.filter(n => !n.read && n.type === 'mention').length;
  if (chatBadge) {
    chatBadge.style.display = chatNotifs > 0 ? "flex" : "none";
    chatBadge.textContent = chatNotifs > 9 ? "9+" : chatNotifs;
  }
  renderNotifList();
}

function renderNotifList() {
  const list = document.getElementById("notif-list");
  if (!list) return;
  if (localNotifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = [...localNotifications].reverse().slice(0, 20).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-item-title">${n.read ? '' : '🔵 '}${escapeHtml(n.title)}</div>
      <div class="notif-item-sub">${escapeHtml(n.body)}</div>
      <div class="notif-item-time">${n.time}</div>
    </div>`).join("");
}

function addNotification(title, body, type = 'general') {
  const notif = { id: Date.now() + Math.random().toString(36), title, body, type, read: false, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) };
  localNotifications.push(notif);
  if (localNotifications.length > 50) localNotifications = localNotifications.slice(-50);
  localStorage.setItem('pmp_notifs', JSON.stringify(localNotifications));
  updateNotifBadge();
}

window.markNotifRead = (id) => {
  const n = localNotifications.find(x => x.id == id);
  if (n) n.read = true;
  localStorage.setItem('pmp_notifs', JSON.stringify(localNotifications));
  updateNotifBadge();
};

window.clearNotifications = () => {
  localNotifications = [];
  localStorage.setItem('pmp_notifs', '[]');
  updateNotifBadge();
  document.getElementById("notif-panel").style.display = "none";
};

window.toggleNotifPanel = () => {
  const panel = document.getElementById("notif-panel");
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    localNotifications.forEach(n => { n.read = true; });
    localStorage.setItem('pmp_notifs', JSON.stringify(localNotifications));
    updateNotifBadge();
  }
};

document.addEventListener("click", (e) => {
  const panel = document.getElementById("notif-panel");
  const btn = document.getElementById("notif-btn");
  if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.style.display = "none";
  }
});

// ── NOTIFICATION LISTENER ──
// Listens to /notifications/{uid}/items — only the current user can read their own
function startGlobalMentionListener() {
  const notifRef = collection(db, 'notifications', currentUser.uid, 'items');
  const q = query(notifRef, orderBy('createdAt', 'desc'), limit(20));
  let initialized = false;

  onSnapshot(q, (snap) => {
    if (!initialized) {
      snap.docs.forEach(d => {
        const n = { id: d.id, ...d.data() };
        const exists = localNotifications.find(x => x.id === d.id);
        if (!exists) {
          localNotifications.push({
            id: d.id,
            title: n.title,
            body: n.body,
            type: n.type || 'mention',
            read: n.read || false,
            time: n.createdAt
              ? (n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
              : ''
          });
        }
      });
      localStorage.setItem('pmp_notifs', JSON.stringify(localNotifications));
      updateNotifBadge();
      initialized = true;
      return;
    }

    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        const n = { id: change.doc.id, ...change.doc.data() };
        const exists = localNotifications.find(x => x.id === change.doc.id);
        if (!exists) {
          const notif = {
            id: change.doc.id,
            title: n.title,
            body: n.body,
            type: n.type || 'mention',
            read: false,
            time: n.createdAt
              ? (n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
              : ''
          };
          localNotifications.push(notif);
          localStorage.setItem('pmp_notifs', JSON.stringify(localNotifications));
          updateNotifBadge();
          showToast(`🔔 ${n.title}`, 'success');
        }
      }
    });
  }, (err) => {
    console.warn('Notification listener error:', err.message);
  });
}

// ── CHAT ──
let activeChatTab = 'group'; // 'group' | 'dm'
let currentChatType = null;  // 'group' | 'dm'
let allGroups = [];

window.openChatPanel = async () => {
  document.getElementById('chat-panel').classList.add('open');
  allUsers = await getUsers();
  await loadGroupList();
  renderDMList(allUsers);
  // Show/hide "create group" button for admins
  const isAdmin = currentUserData.role === 'admin' || currentUserData.role === 'superadmin';
  document.getElementById('btn-create-group').style.display = isAdmin ? '' : 'none';
};

window.closeChatPanel = () => {
  document.getElementById('chat-panel').classList.remove('open');
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  currentChatId = null;
  currentChatPartner = null;
  currentChatType = null;
};

// ── TABS ──
window.switchChatTab = (tab) => {
  activeChatTab = tab;
  document.getElementById('tab-group').classList.toggle('active', tab === 'group');
  document.getElementById('tab-dm').classList.toggle('active', tab === 'dm');
  document.getElementById('chat-sidebar-group').style.display = tab === 'group' ? '' : 'none';
  document.getElementById('chat-sidebar-dm').style.display = tab === 'dm' ? '' : 'none';
};

// ── GROUP CHANNELS ──
async function loadGroupList() {
  try {
    const snap = await getDocs(collection(db, 'groups'));
    allGroups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Users see groups they're a member of; admins see all
    const isAdmin = currentUserData.role === 'admin' || currentUserData.role === 'superadmin';
    const visible = isAdmin ? allGroups : allGroups.filter(g => (g.members || []).includes(currentUser.uid));
    renderGroupList(visible);
  } catch (e) {
    console.error('loadGroupList', e);
    document.getElementById('chat-group-list').innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-secondary);text-align:center;">Could not load channels</div>';
  }
}

function renderGroupList(groups) {
  const container = document.getElementById('chat-group-list');
  if (!groups.length) {
    container.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-secondary);text-align:center;">No channels yet</div>';
    return;
  }
  container.innerHTML = groups.map(g => `
    <div class="chat-group-item ${currentChatId === 'group_' + g.id ? 'active' : ''}" onclick="selectGroupChat('${g.id}','${escapeHtml(g.name)}','${(g.members||[]).length}')">
      <div class="chat-group-icon">#</div>
      <div class="chat-group-info">
        <div class="chat-group-name">${escapeHtml(g.name)}</div>
        <div class="chat-group-meta">${(g.members || []).length} members</div>
      </div>
    </div>`).join('');
}

window.selectGroupChat = (groupId, nameEsc, memberCount) => {
  const name = unescapeHtml(nameEsc);
  currentChatId = 'group_' + groupId;
  currentChatType = 'group';
  currentChatPartner = null;

  document.getElementById('chat-subtitle').textContent = `#${name}`;
  showChatWindow();

  document.getElementById('chat-window-header').innerHTML = `
    <div class="chat-group-icon" style="width:32px;height:32px;border-radius:8px;font-size:15px;font-weight:800;">#</div>
    <div>
      <div style="font-weight:700;font-size:13px;">${escapeHtml(name)}</div>
      <div style="font-size:11px;color:var(--text-secondary);">${memberCount} members</div>
    </div>`;

  loadChatMessages('group_' + groupId);
  renderGroupList(allGroups.filter(g => currentUserData.role === 'admin' || currentUserData.role === 'superadmin' || (g.members || []).includes(currentUser.uid)));
};

// Create group
window.openCreateGroup = async () => {
  const picker = document.getElementById('group-member-picker');
  const others = allUsers.filter(u => u.uid !== currentUser.uid);
  picker.innerHTML = others.map(u => `
    <label class="group-member-checkbox">
      <input type="checkbox" value="${u.uid}">
      <div class="mini-avatar" style="background:${avatarColor(u.name)};width:26px;height:26px;">${u.name.charAt(0)}</div>
      <span class="group-member-label">${escapeHtml(u.name)}</span>
      <span class="group-member-role">${u.role}</span>
    </label>`).join('');
  document.getElementById('group-name').value = '';
  document.getElementById('group-desc').value = '';
  openModal('group-modal');
};

window.saveGroup = async () => {
  const name = document.getElementById('group-name').value.trim();
  if (!name) return showToast('Channel name is required', 'error');
  const desc = document.getElementById('group-desc').value.trim();
  const checked = Array.from(document.querySelectorAll('#group-member-picker input:checked')).map(c => c.value);
  const members = [currentUser.uid, ...checked];
  try {
    const ref = await addDoc(collection(db, 'groups'), {
      name, desc, members,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    closeModal('group-modal');
    await loadGroupList();
    showToast(`#${name} created!`, 'success');
    selectGroupChat(ref.id, name, members.length);
  } catch (e) {
    showToast('Error creating channel: ' + e.message, 'error');
  }
};

// ── DM LIST ──
window.filterChatUsers = (q) => {
  const filtered = allUsers.filter(u => u.uid !== currentUser.uid && u.name.toLowerCase().includes(q.toLowerCase()));
  renderDMList(filtered);
};

function renderDMList(users) {
  const me = currentUser.uid;
  const container = document.getElementById('chat-users');
  const others = users.filter(u => u.uid !== me);
  container.innerHTML = others.map(u => `
    <div class="chat-member-item ${currentChatType === 'dm' && currentChatPartner?.uid === u.uid ? 'active' : ''}" onclick="selectDMChat('${u.uid}','${escapeHtml(u.name)}','${u.role}')">
      <div class="chat-member-avatar" style="background:${avatarColor(u.name)};">${u.name.charAt(0).toUpperCase()}</div>
      <div class="chat-member-info">
        <div class="chat-member-name">${escapeHtml(u.name)}</div>
        <div class="chat-member-role">${u.role}</div>
      </div>
    </div>`).join('') || '<div style="padding:16px;font-size:13px;color:var(--text-secondary);text-align:center;">No members found</div>';
}

window.selectDMChat = (uid, nameEsc, role) => {
  const name = unescapeHtml(nameEsc);
  currentChatPartner = { uid, name, role };
  currentChatType = 'dm';
  const ids = [currentUser.uid, uid].sort();
  currentChatId = 'dm_' + ids.join('_');

  document.getElementById('chat-subtitle').textContent = `DM · ${name}`;
  showChatWindow();

  document.getElementById('chat-window-header').innerHTML = `
    <div class="chat-member-avatar" style="background:${avatarColor(name)};width:32px;height:32px;border-radius:8px;font-size:13px;">${name.charAt(0)}</div>
    <div>
      <div style="font-weight:700;font-size:13px;">${escapeHtml(name)}</div>
      <div style="font-size:11px;color:var(--text-secondary);text-transform:capitalize;">${role}</div>
    </div>`;

  loadChatMessages(currentChatId);
  renderDMList(allUsers);
};

// ── SHARED CHAT LOGIC ──
function showChatWindow() {
  document.getElementById('chat-empty-state').style.display = 'none';
  document.getElementById('chat-window').style.display = 'flex';
  document.getElementById('chat-messages').innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-muted);">Loading…</div>';
  document.getElementById('chat-input').focus();
}

function loadChatMessages(chatId) {
  if (chatUnsub) chatUnsub();
  const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('createdAt'));
  chatUnsub = onSnapshot(q, (snap) => {
    renderChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('chat listener', err);
    document.getElementById('chat-messages').innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--danger);">Could not load messages. Check Firestore rules & indexes.</div>';
  });
}

function avatarColor(name) {
  const colors = ['#3b5bdb', '#7048e8', '#099268', '#e67700', '#e03131', '#1098ad', '#d6336c'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function renderChatMessages(msgs) {
  const el = document.getElementById('chat-messages');
  if (!msgs.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;font-size:13px;color:var(--text-secondary);">No messages yet. Say hello! 👋</div>';
    return;
  }
  let html = '';
  let lastDate = '';
  let lastSender = '';
  msgs.forEach(m => {
    const mine = m.fromUid === currentUser.uid;
    const msgDate = m.createdAt
      ? (m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const isMentioned = !mine && m.mentions && m.mentions.includes(currentUser.uid);
    if (msgDate && msgDate !== lastDate) {
      html += `<div class="chat-date-sep">${msgDate}</div>`;
      lastDate = msgDate;
      lastSender = '';
    }
    const showAvatar = !mine && lastSender !== m.fromUid;
    lastSender = m.fromUid;
    const formattedText = formatMentions(escapeHtml(m.text));
    const ts = m.createdAt ? formatTime(m.createdAt) : '';
    html += `
      <div class="msg-group ${mine ? 'mine' : 'theirs'}">
        <div class="msg-bubble-wrap">
          ${!mine ? `<div class="msg-sender-avatar ${showAvatar ? '' : 'hidden'}" style="background:${avatarColor(m.fromName || '?')};">${(m.fromName || '?').charAt(0)}</div>` : ''}
          <div class="msg-content">
            ${showAvatar && !mine ? `<div class="msg-sender-name">${escapeHtml(m.fromName || '')}</div>` : ''}
            <div class="msg ${mine ? 'mine' : 'theirs'} ${isMentioned ? 'mention-me' : ''}">${formattedText}</div>
            <div class="msg-time">${ts}</div>
          </div>
        </div>
      </div>`;
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function formatMentions(text) {
  return text.replace(/@([\w][^@\s]*(?:\s[\w][^@\s]*)*)/g, (match, name) => {
    return `<span class="mention-tag">@${name}</span>`;
  });
}

// ── SEND MESSAGES ──
window.handleChatKeydown = (e) => {
  const dropdown = document.getElementById('mention-dropdown');
  if (dropdown.style.display !== 'none') {
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateMentionDown(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navigateMentionUp(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(); return; }
    if (e.key === 'Escape') { closeMentionDropdown(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
};

window.handleMentionTrigger = (e) => {
  const input = e.target;
  const value = input.value;
  const pos = input.selectionStart;
  const textBeforeCursor = value.substring(0, pos);
  const atMatch = textBeforeCursor.match(/@(\w*)$/);

  if (atMatch) {
    mentionQuery = atMatch[1].toLowerCase();
    const filtered = allUsers.filter(u => u.uid !== currentUser.uid && u.name.toLowerCase().includes(mentionQuery));
    if (filtered.length > 0) {
      mentionDropdownUsers = filtered;
      mentionSelectedIndex = 0;
      showMentionDropdown(filtered);
    } else {
      closeMentionDropdown();
    }
  } else {
    closeMentionDropdown();
  }
};

function showMentionDropdown(users) {
  const dd = document.getElementById('mention-dropdown');
  dd.style.display = 'block';
  dd.innerHTML = users.map((u, i) => `
    <div class="mention-option ${i === mentionSelectedIndex ? 'selected' : ''}" onclick="selectMentionUser('${u.uid}','${escapeHtml(u.name)}')">
      <div class="mini-avatar" style="background:${avatarColor(u.name)};width:26px;height:26px;">${u.name.charAt(0)}</div>
      <div>
        <div class="mention-option-name">${escapeHtml(u.name)}</div>
        <div class="mention-option-role">${u.role}</div>
      </div>
    </div>`).join('');
}

function closeMentionDropdown() {
  document.getElementById('mention-dropdown').style.display = 'none';
  mentionDropdownUsers = [];
  mentionSelectedIndex = -1;
}

function navigateMentionDown() {
  mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionDropdownUsers.length;
  showMentionDropdown(mentionDropdownUsers);
}

function navigateMentionUp() {
  mentionSelectedIndex = (mentionSelectedIndex - 1 + mentionDropdownUsers.length) % mentionDropdownUsers.length;
  showMentionDropdown(mentionDropdownUsers);
}

function selectMention() {
  if (mentionSelectedIndex >= 0 && mentionDropdownUsers[mentionSelectedIndex]) {
    const u = mentionDropdownUsers[mentionSelectedIndex];
    selectMentionUser(u.uid, u.name);
  }
}

window.selectMentionUser = (uid, nameEsc) => {
  const name = unescapeHtml(nameEsc);
  const input = document.getElementById('chat-input');
  const value = input.value;
  const pos = input.selectionStart;
  const textBeforeCursor = value.substring(0, pos);
  const newTextBefore = textBeforeCursor.replace(/@(\w*)$/, `@${name} `);
  input.value = newTextBefore + value.substring(pos);
  input.setSelectionRange(newTextBefore.length, newTextBefore.length);
  input.focus();
  closeMentionDropdown();
};

window.sendChatMessage = async () => {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentChatId) return;

  // Extract mentions
  const mentionedNames = [];
  const mentionRegex = /@([\w\s]+?)(?=\s|$|@)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentionedNames.push(match[1].trim().toLowerCase());
  }

  const mentionedUids = allUsers
    .filter(u => mentionedNames.some(n => u.name.toLowerCase() === n))
    .map(u => u.uid);

  try {
    await addDoc(collection(db, 'messages'), {
      chatId: currentChatId,
      fromUid: currentUser.uid,
      fromName: currentUserData.name,
      text,
      mentions: mentionedUids,
      mentionNames: mentionedNames,
      createdAt: serverTimestamp(),
    });

    // Write a notification doc for each mentioned user
    // Firestore rules allow users to write to any notifications sub-collection
    for (const uid of mentionedUids) {
      if (uid === currentUser.uid) continue; // don't notify yourself
      const chatLabel = currentChatType === 'group'
        ? `in a channel`
        : `in a direct message`;
      await addDoc(collection(db, 'notifications', uid, 'items'), {
        title: `${currentUserData.name} mentioned you`,
        body: text.substring(0, 100),
        type: 'mention',
        fromUid: currentUser.uid,
        fromName: currentUserData.name,
        chatId: currentChatId,
        read: false,
        createdAt: serverTimestamp(),
      });
    }

    input.value = '';
    closeMentionDropdown();
  } catch (e) {
    console.error(e);
    showToast('Message failed to send', 'error');
  }
};

// ── TOAST ──
window.showToast = (msg, type = "success") => {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 2800);
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dd = document.getElementById('mention-dropdown');
  if (dd && !dd.contains(e.target) && e.target.id !== 'chat-input') {
    closeMentionDropdown();
  }
});
