import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, getDocs,
  addDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp, query, orderBy
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

const COLS = [
  { id: "backlog", label: "Backlog", emoji: "\u{1F4DD}" },
  { id: "todo", label: "To Do", emoji: "\u{1F680}" },
  { id: "inprogress", label: "In Progress", emoji: "\u{1F504}" },
  { id: "review", label: "Review", emoji: "\u{1F440}" },
  { id: "done", label: "Done", emoji: "\u2705" },
];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        currentUser = user;
        currentUserData = { uid: user.uid, ...snap.data() };
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
}

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
  } catch (e) {
    showAuthErr(niceErr(e.code));
  }
};

window.doRegister = async () => {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const role = "intern";
  if (!name || !email || !password) return showAuthErr("Please fill all fields.");
  if (password.length < 6) return showAuthErr("Password must be at least 6 characters.");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, role, createdAt: serverTimestamp()
    });
  } catch (e) {
    showAuthErr(niceErr(e.code));
  }
};

window.doLogout = async () => {
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
  return (
    {
      "auth/user-not-found": "No account with this email.",
      "auth/wrong-password": "Wrong password.",
      "auth/invalid-credential": "Invalid email or password.",
      "auth/email-already-in-use": "Email already registered.",
      "auth/weak-password": "Password too weak (min 6 chars).",
      "auth/too-many-requests": "Too many attempts \u2014 try later.",
    }[code] || "Something went wrong. Try again."
  );
}

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
}

window.showPage = (page) => {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  const nav = document.getElementById("nav-" + page);
  if (nav) nav.classList.add("active");
  if (page === "kanban") renderKanban();
  if (page === "mytasks") renderMyTasks();
  if (page === "users") renderUsers();
  if (page === "dashboard") loadDashboard();
};

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
  if (r === "superadmin" || r === "admin") return tasks;
  return tasks.filter((t) => t.assignedTo === currentUser.uid);
}

function sLabel(s) {
  return (
    {
      backlog: "\u{1F4DD} Backlog",
      todo: "\u{1F680} To Do",
      inprogress: "\u{1F504} In Progress",
      review: "\u{1F440} Review",
      done: "\u2705 Done",
    }[s] || s
  );
}

async function loadDashboard() {
  const tasks = await getTasks();
  const today = new Date().toISOString().slice(0, 10);
  const vis = visibleTasks(tasks);
  document.getElementById("stat-total").textContent = vis.length;
  document.getElementById("stat-inprogress").textContent = vis.filter(
    (t) => t.status === "inprogress"
  ).length;
  document.getElementById("stat-done").textContent = vis.filter(
    (t) => t.status === "done"
  ).length;
  document.getElementById("stat-overdue").textContent = vis.filter(
    (t) => t.dueDate && t.dueDate < today && t.status !== "done"
  ).length;
  const cont = document.getElementById("recent-tasks");
  cont.innerHTML = vis.length
    ? vis
        .slice(0, 6)
        .map(
          (t) => `
    <div class="recent-task-item" onclick="openTaskDetail('${t.id}')">
      <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
      <div style="flex:1;">
        <div class="recent-task-title">${t.title}</div>
        <div class="recent-task-assignee">${t.assignedName || "Unassigned"}</div>
      </div>
      <span class="recent-task-status">${sLabel(t.status)}</span>
      ${t.dueDate ? `<span class="recent-task-due" style="color:${t.dueDate < today && t.status !== "done" ? "var(--accent2)" : "var(--muted)"}">Due ${t.dueDate}</span>` : ""}
    </div>`
        )
        .join("")
    : '<div class="empty-state">No tasks yet \u2014 create one to get started!</div>';
}

async function renderKanban() {
  const tasks = await getTasks();
  const vis = visibleTasks(tasks);
  const board = document.getElementById("kanban-board");
  board.innerHTML = COLS.map((col) => {
    const ct = vis.filter((t) => t.status === col.id);
    return `<div class="kanban-col" data-col="${col.id}">
      <div class="col-header"><span><span class="col-dot"></span>${col.label}</span><span class="col-badge">${ct.length}</span></div>
      <div class="col-body" id="col-${col.id}" ondragover="onDragOver(event,'${col.id}')" ondragleave="onDragLeave(event)" ondrop="onDrop(event,'${col.id}')">
        ${ct.map((t) => taskCard(t)).join("")}
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
  return `<div class="task-card" draggable="${canEdit}" id="tc-${t.id}"
    ondragstart="onDragStart(event,'${t.id}')" onclick="openTaskDetail('${t.id}')">
    <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
    <div class="task-actions" onclick="event.stopPropagation()">
      ${canEdit ? `<div class="icon-btn" onclick="openEditTask('${t.id}')">\u270F\uFE0F</div>` : ""}
      ${canDel ? `<div class="icon-btn delete" onclick="confirmDelete('${t.id}')">\u{1F5D1}</div>` : ""}
    </div>
    <div class="task-title">${t.title}</div>
    ${t.description ? `<div class="task-desc">${t.description}</div>` : ""}
    <div class="task-meta">
      <div class="task-assignee"><div class="mini-avatar">${(t.assignedName || "?").charAt(0)}</div><span>${t.assignedName || "Unassigned"}</span></div>
      ${t.dueDate ? `<span class="${overdue ? "overdue" : ""}" style="font-size:10px;">${overdue ? "\u26A0 " : ""}${t.dueDate}</span>` : ""}
    </div></div>`;
}

let dragId = null;
window.onDragStart = (e, id) => {
  dragId = id;
  setTimeout(() => document.getElementById("tc-" + id)?.classList.add("dragging"), 0);
};
window.onDragOver = (e, col) => {
  e.preventDefault();
  document.getElementById("col-" + col)?.classList.add("drag-over");
};
window.onDragLeave = (e) => {
  e.currentTarget.classList.remove("drag-over");
};
window.onDrop = async (e, col) => {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (!dragId) return;
  await updateDoc(doc(db, "tasks", dragId), { status: col });
  dragId = null;
  renderKanban();
  showToast("Moved to " + COLS.find((c) => c.id === col).label, "success");
};

async function renderMyTasks() {
  const tasks = await getTasks();
  const mine = tasks.filter((t) => t.assignedTo === currentUser.uid);
  const cont = document.getElementById("my-tasks-list");
  const today = new Date().toISOString().slice(0, 10);
  cont.innerHTML = mine.length
    ? mine
        .map(
          (t) => `
    <div class="my-task-item">
      <div class="my-task-info">
        <div class="my-task-header">
          <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
          <span class="my-task-title">${t.title}</span>
        </div>
        ${t.description ? `<div class="my-task-desc">${t.description}</div>` : ""}
      </div>
      <div class="my-task-controls">
        <select class="my-task-status-select" onchange="quickStatus('${t.id}',this.value)">
          ${COLS.map((c) => `<option value="${c.id}" ${t.status === c.id ? "selected" : ""}>${c.emoji} ${c.label}</option>`).join("")}
        </select>
        <div class="my-task-due">
          <div class="due-date-edit">
            <input type="date" value="${t.dueDate || ""}" onchange="quickDueDate('${t.id}',this.value)">
          </div>
        </div>
      </div>
    </div>`
        )
        .join("")
    : '<div class="empty-state">No tasks assigned to you yet.</div>';
}

window.quickStatus = async (id, status) => {
  await updateDoc(doc(db, "tasks", id), { status });
  showToast("Status updated!", "success");
  renderMyTasks();
};

window.quickDueDate = async (id, dueDate) => {
  await updateDoc(doc(db, "tasks", id), { dueDate });
  showToast("Due date updated!", "success");
  renderMyTasks();
};

async function renderUsers() {
  const users = await getUsers();
  document.getElementById("users-list").innerHTML = users
    .map(
      (u) => `
    <div class="table-row">
      <div style="display:flex;align-items:center;gap:10px;"><div class="mini-avatar" style="width:28px;height:28px;border-radius:7px;font-size:11px;">${u.name.charAt(0)}</div>${u.name}</div>
      <div style="color:var(--muted);font-size:12px;">${u.email}</div>
      <div><span class="role-badge role-${u.role}">${u.role}</span></div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${
          currentUserData.role === "superadmin" && u.uid !== currentUser.uid
            ? `
          <select style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);font-family:var(--font-mono);font-size:11px;cursor:pointer;outline:none;" onchange="changeRole('${u.uid}',this.value)">
            <option value="intern" ${u.role === "intern" ? "selected" : ""}>Intern</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="superadmin" ${u.role === "superadmin" ? "selected" : ""}>Super Admin</option>
          </select>
          <div class="icon-btn delete" onclick="removeUser('${u.uid}')">\u{1F5D1}</div>
        `
            : '<span style="color:var(--muted);font-size:11px;">\u2014</span>'
        }
      </div>
    </div>`
    )
    .join("");
}

window.changeRole = async (uid, role) => {
  await updateDoc(doc(db, "users", uid), { role });
  showToast("Role updated!", "success");
  renderUsers();
};

window.removeUser = async (uid) => {
  if (!confirm("Remove this user?")) return;
  await deleteDoc(doc(db, "users", uid));
  renderUsers();
  showToast("User removed", "success");
};

window.openCreateUser = () => {
  ["u-name", "u-email", "u-password"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
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
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, role, createdAt: serverTimestamp()
    });
    closeModal("user-modal");
    renderUsers();
    showToast("User created!", "success");
  } catch (e) {
    showToast(niceErr(e.code), "error");
  }
};

window.openCreateTask = async () => {
  editingTaskId = null;
  document.getElementById("task-modal-title").textContent = "Create Task";
  document.getElementById("task-save-btn").textContent = "Create Task";
  ["task-title", "task-desc"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
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
    '<option value="">\u2014 Unassigned \u2014</option>' +
    users
      .map(
        (u) =>
          `<option value="${u.uid}" ${u.uid === sel ? "selected" : ""}>${u.name} (${u.role})</option>`
      )
      .join("");
}

window.saveTask = async () => {
  const title = document.getElementById("task-title").value.trim();
  if (!title) return showToast("Title is required", "error");
  const el = document.getElementById("task-assignee");
  const assignedTo = el.value || null;
  const assignedName = assignedTo
    ? el.options[el.selectedIndex].text.split(" (")[0]
    : null;
  const data = {
    title,
    description: document.getElementById("task-desc").value.trim(),
    priority: document.getElementById("task-priority").value,
    dueDate: document.getElementById("task-due").value,
    status: document.getElementById("task-status").value,
    assignedTo,
    assignedName,
  };
  try {
    if (editingTaskId) {
      await updateDoc(doc(db, "tasks", editingTaskId), data);
    } else {
      await addDoc(collection(db, "tasks"), {
        ...data,
        createdBy: currentUser.uid,
        comments: [],
        dailyLogs: [],
        createdAt: serverTimestamp(),
      });
    }
    closeModal("task-modal");
    renderKanban();
    loadDashboard();
    showToast(editingTaskId ? "Task updated!" : "Task created!", "success");
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

window.openTaskDetail = async (id) => {
  const snap = await getDoc(doc(db, "tasks", id));
  if (!snap.exists()) return;
  const t = { id, ...snap.data() };
  const today = new Date().toISOString().slice(0, 10);
  const role = currentUserData.role;
  const isOwner = t.assignedTo === currentUser.uid;
  const canEdit = role === "admin" || role === "superadmin" || isOwner;
  const canDel = role === "admin" || role === "superadmin";
  const canChangeDue = canEdit;
  const canLog = canEdit;

  document.getElementById("detail-title").textContent = t.title;

  const logs = t.dailyLogs || [];

  document.getElementById("detail-body").innerHTML = `
    <div class="detail-badges">
      <span class="task-priority priority-${(t.priority || "medium").toLowerCase()}">${t.priority || "Medium"}</span>
      <span class="detail-status-badge">${sLabel(t.status)}</span>
    </div>
    ${t.description ? `<div class="detail-description">${t.description}</div>` : ""}
    <div class="detail-info-grid">
      <div>
        <div class="detail-info-label">Assigned To</div>
        ${t.assignedName || "Unassigned"}
      </div>
      <div>
        <div class="detail-info-label">Due Date</div>
        ${
          canChangeDue
            ? `<div class="due-date-edit">
                <input type="date" id="detail-due-input" value="${t.dueDate || ""}">
                <button class="due-date-save-btn" onclick="updateDueDate('${id}')">Save</button>
              </div>`
            : t.dueDate
              ? `<span style="color:${t.dueDate < today && t.status !== "done" ? "var(--accent2)" : "inherit"}">${t.dueDate}</span>`
              : "\u2014"
        }
      </div>
    </div>
    <div class="detail-comments-section">
      <div class="detail-comments-title">Comments (${(t.comments || []).length})</div>
      <div>
        ${
          (t.comments || []).length
            ? t.comments
                .map(
                  (c) =>
                    `<div class="comment-item"><div class="comment-author">${c.author}</div><div>${c.text}</div></div>`
                )
                .join("")
            : '<div class="detail-no-comments">No comments yet.</div>'
        }
      </div>
      <div class="comment-input-row">
        <input type="text" id="cmt-input" placeholder="Add a comment..." onkeydown="if(event.key==='Enter')addComment('${id}')">
        <button onclick="addComment('${id}')">Post</button>
      </div>
    </div>
    ${
      canLog
        ? `<div class="daily-logs-section">
      <div class="daily-logs-title">Daily Logs (${logs.length})</div>
      <div>
        ${
          logs.length
            ? logs
                .map(
                  (l) =>
                    `<div class="daily-log-item">
                <div class="daily-log-header">
                  <span class="daily-log-author">${l.author}</span>
                  <span class="daily-log-date">${l.date || ""}</span>
                </div>
                <div class="daily-log-text">${l.text}</div>
              </div>`
                )
                .join("")
            : '<div class="detail-no-comments">No daily logs yet.</div>'
        }
      </div>
      <div class="log-input-area">
        <textarea id="log-input" placeholder="What did you work on today?"></textarea>
        <div class="log-submit-row">
          <button class="btn-submit" onclick="addDailyLog('${id}')">Add Log</button>
        </div>
      </div>
    </div>`
        : `<div class="daily-logs-section">
      <div class="daily-logs-title">Daily Logs (${logs.length})</div>
      <div>
        ${
          logs.length
            ? logs
                .map(
                  (l) =>
                    `<div class="daily-log-item">
                <div class="daily-log-header">
                  <span class="daily-log-author">${l.author}</span>
                  <span class="daily-log-date">${l.date || ""}</span>
                </div>
                <div class="daily-log-text">${l.text}</div>
              </div>`
                )
                .join("")
            : '<div class="detail-no-comments">No daily logs yet.</div>'
        }
      </div>
    </div>`
    }
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
  await updateDoc(doc(db, "tasks", id), {
    dailyLogs: arrayUnion({
      author: currentUserData.name,
      text,
      date: today,
      ts: Date.now(),
    }),
  });
  el.value = "";
  openTaskDetail(id);
  showToast("Daily log added!", "success");
};

window.addComment = async (id) => {
  const el = document.getElementById("cmt-input");
  const text = el.value.trim();
  if (!text) return;
  await updateDoc(doc(db, "tasks", id), {
    comments: arrayUnion({
      author: currentUserData.name,
      text,
      ts: Date.now(),
    }),
  });
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

window.openModal = (id) => document.getElementById(id).classList.add("open");
window.closeModal = (id) => document.getElementById(id).classList.remove("open");

document.querySelectorAll(".modal-overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) o.classList.remove("open");
  })
);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open"));
});

window.showToast = (msg, type = "success") => {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 2800);
};
