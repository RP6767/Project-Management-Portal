// ════════════════════════════════════════════════════════
//  pmp-notifications.js
//  Drop this <script> into your PMP HTML BEFORE your main
//  app script. It handles:
//    1. Service Worker registration
//    2. Notification permission request
//    3. Sending system notifications via SW
//    4. Handling SW→page messages (auto-open chat)
// ════════════════════════════════════════════════════════

// ── 1. REGISTER SERVICE WORKER ──────────────────────────
let swRegistration = null;

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[PMP Notif] Service Workers not supported in this browser.');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    console.log('[PMP Notif] ✅ Service Worker registered:', reg.scope);

    // Listen for messages from the SW (e.g. notification click → open chat)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'OPEN_CHAT') {
        const chatId = event.data.chatId;
        if (chatId && typeof openChatPanel === 'function') {
          openChatPanel();
          // If it's a DM, try to select it
          setTimeout(() => {
            if (chatId.startsWith('dm_')) {
              // Try to extract the other user's UID
              const parts = chatId.replace('dm_', '').split('_');
              const otherUid = parts.find(uid => uid !== currentUser?.uid);
              const otherUser = allUsers?.find(u => u.uid === otherUid);
              if (otherUser) selectDMChat(otherUser.uid, otherUser.name, otherUser.role);
            } else if (chatId.startsWith('group_')) {
              const groupId = chatId.replace('group_', '');
              const group = allGroups?.find(g => g.id === groupId);
              if (group) selectGroupChat(group.id, group.name, (group.members || []).length);
            }
          }, 600);
        }
      }
    });

    return reg;
  } catch (err) {
    console.error('[PMP Notif] ❌ SW registration failed:', err);
    return null;
  }
}

// ── 2. PERMISSION REQUEST ────────────────────────────────
let notifPermission = Notification.permission; // 'default' | 'granted' | 'denied'

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[PMP Notif] Notifications API not supported.');
    return false;
  }
  if (notifPermission === 'granted') return true;
  if (notifPermission === 'denied') {
    showToast('🔕 Notifications blocked. Enable in browser settings.', 'error');
    return false;
  }
  try {
    const result = await Notification.requestPermission();
    notifPermission = result;
    if (result === 'granted') {
      showToast('🔔 Notifications enabled! You\'ll be alerted when mentioned.', 'success');
      return true;
    } else {
      showToast('🔕 Notifications permission denied.', 'error');
      return false;
    }
  } catch (e) {
    console.error('[PMP Notif] Permission request error:', e);
    return false;
  }
}

// ── 3. SEND A SYSTEM NOTIFICATION ───────────────────────
/**
 * Shows a real OS-level notification.
 * @param {string} title
 * @param {string} body
 * @param {string|null} chatId  - optional, to deep-link on click
 * @param {string|null} fromName
 */
function sendSystemNotification(title, body, chatId = null, fromName = null) {
  if (notifPermission !== 'granted') return;

  // If the page is VISIBLE, don't spam with system notifs (in-app toast is enough)
  if (document.visibilityState === 'visible') return;

  if (swRegistration?.active) {
    // Route through Service Worker (works even when tab is minimized/backgrounded)
    swRegistration.active.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body,
      chatId,
      fromName
    });
  } else if ('Notification' in window && notifPermission === 'granted') {
    // Fallback: direct Notification (no SW — won't work when tab is closed)
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag: 'pmp-mention-' + Date.now(),
      renotify: true,
    });
    if (chatId) {
      n.onclick = () => {
        window.focus();
        openChatPanel?.();
      };
    }
  }
}

// ── 4. AUTO-ASK ON APP LOAD ──────────────────────────────
// Called after user is authenticated (call from your enterApp() function)
async function initPushNotifications() {
  await registerServiceWorker();
  // Show permission prompt only if not yet decided
  if (Notification.permission === 'default') {
    // Small delay so user sees the app first
    setTimeout(() => {
      showNotifPermissionBanner();
    }, 2500);
  }
}

// ── 5. PERMISSION BANNER UI ─────────────────────────────
function showNotifPermissionBanner() {
  if (document.getElementById('notif-permission-banner')) return; // already shown
  const banner = document.createElement('div');
  banner.id = 'notif-permission-banner';
  banner.innerHTML = `
    <div style="
      position:fixed;bottom:80px;right:20px;z-index:99999;
      background:linear-gradient(135deg,#1e293b,#0f172a);
      border:1px solid rgba(99,102,241,0.4);
      border-radius:16px;padding:16px 20px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.04);
      max-width:320px;animation:slideInBanner 0.4s cubic-bezier(0.34,1.56,0.64,1);
      font-family:var(--font-body,sans-serif);
    ">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:28px;line-height:1;">🔔</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:4px;">Enable Notifications</div>
          <div style="font-size:12px;color:#94a3b8;line-height:1.5;">Get system alerts when someone <strong style="color:#a5b4fc;">@mentions</strong> you — even when the tab is in the background.</div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button onclick="handleEnableNotifs()" style="
              background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:8px;
              color:#fff;font-size:12px;font-weight:600;padding:7px 14px;cursor:pointer;
              transition:opacity 0.2s;
            " onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">
              Enable
            </button>
            <button onclick="dismissNotifBanner()" style="
              background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
              border-radius:8px;color:#94a3b8;font-size:12px;padding:7px 14px;cursor:pointer;
            ">
              Not now
            </button>
          </div>
        </div>
        <div onclick="dismissNotifBanner()" style="cursor:pointer;color:#475569;font-size:16px;line-height:1;padding:2px;">✕</div>
      </div>
    </div>
    <style>
      @keyframes slideInBanner {
        from { transform:translateY(20px) scale(0.95); opacity:0; }
        to { transform:translateY(0) scale(1); opacity:1; }
      }
    </style>
  `;
  document.body.appendChild(banner);
}

window.handleEnableNotifs = async () => {
  dismissNotifBanner();
  await requestNotificationPermission();
};

window.dismissNotifBanner = () => {
  const b = document.getElementById('notif-permission-banner');
  if (b) {
    b.style.transition = 'opacity 0.3s, transform 0.3s';
    b.style.opacity = '0';
    b.style.transform = 'translateY(10px)';
    setTimeout(() => b.remove(), 300);
  }
};

// ── 6. SETTINGS TOGGLE IN NOTIFICATION PANEL ────────────
// Appends a small toggle button to your existing notif panel
function injectNotifSettingsButton() {
  const panel = document.getElementById('notif-panel');
  if (!panel || document.getElementById('notif-settings-toggle')) return;
  const btn = document.createElement('div');
  btn.id = 'notif-settings-toggle';
  btn.style.cssText = 'padding:8px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#64748b;';
  btn.innerHTML = `
    <span>System notifications</span>
    <button onclick="toggleSystemNotifs()" id="sys-notif-btn" style="
      background:${notifPermission === 'granted' ? '#6366f1' : 'rgba(255,255,255,0.08)'};
      border:none;border-radius:6px;color:${notifPermission === 'granted' ? '#fff' : '#94a3b8'};
      font-size:10px;font-weight:600;padding:4px 10px;cursor:pointer;transition:all 0.2s;
    ">${notifPermission === 'granted' ? '🔔 ON' : '🔕 OFF'}</button>
  `;
  panel.appendChild(btn);
}

window.toggleSystemNotifs = async () => {
  if (notifPermission === 'granted') {
    showToast('To disable, block notifications in browser settings (🔒 icon in address bar)', 'error');
  } else {
    await requestNotificationPermission();
    // Update button state
    const btn = document.getElementById('sys-notif-btn');
    if (btn && notifPermission === 'granted') {
      btn.style.background = '#6366f1';
      btn.style.color = '#fff';
      btn.textContent = '🔔 ON';
    }
  }
};

console.log('[PMP Notif] Module loaded ✅');
