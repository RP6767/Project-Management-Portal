# 🔔 PMP Push Notifications — Integration Guide

## Files to add to your project root
- `sw.js`            → must be at the ROOT of your site (same level as index.html)
- `pmp-notifications.js` → anywhere, loaded in HTML

---

## Step 1 — Add script tag to your HTML

In your HTML `<head>` or before `</body>`, add:

```html
<script src="/pmp-notifications.js"></script>
```
Make sure it loads BEFORE your main app script.

---

## Step 2 — Call `initPushNotifications()` from `enterApp()`

In your existing JS, find the `enterApp()` function and add one line:

```js
function enterApp() {
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  setupRoleUI();
  showPage("dashboard");
  updateNotifBadge();
  startGlobalMentionListener();
  initPushNotifications(); // ← ADD THIS LINE
}
```

---

## Step 3 — Inject settings button when notif panel opens

In your `toggleNotifPanel()` function, call `injectNotifSettingsButton()`:

```js
window.toggleNotifPanel = () => {
  const panel = document.getElementById("notif-panel");
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    localNotifications.forEach(n => { n.read = true; });
    localStorage.setItem('pmp_notifs', JSON.stringify(localNotifications));
    updateNotifBadge();
    injectNotifSettingsButton(); // ← ADD THIS LINE
  }
};
```

---

## Step 4 — Fire system notification when a mention arrives

In your `startGlobalMentionListener()`, in the `onSnapshot` callback,
find the `showToast` line inside `if (initialized)` and add one line below it:

```js
if (initialized) {
  showToast(`🔔 ${notif.title}`, 'success');
  // ↓ ADD THIS — fires real OS notification when tab is in background
  sendSystemNotification(
    notif.title,
    notif.body,
    n.chatId || null,
    n.fromName || null
  );
}
```

---

## Step 5 — Also fire when you SEND a message (for real-time mentions)

In `sendChatMessage()`, after the notification write loop, add:

```js
// After: console.log('[PMP] ✅ Notification written for:', uid);
// The recipient's browser will receive it via their onSnapshot listener.
// Nothing extra needed here — Step 4 handles it on THEIR device.
```

(No changes needed in send — the Firestore listener on the recipient's device
triggers `sendSystemNotification` automatically via Step 4.)

---

## How it works end-to-end

```
User A types @User B and sends
        ↓
Firestore gets a notification doc written for User B
        ↓
User B's onSnapshot fires (even if tab is minimized)
        ↓
sendSystemNotification() is called
        ↓
SW receives the message → shows OS notification
        ↓
User B clicks notification → tab focuses & chat opens
```

---

## Browser support
- ✅ Chrome / Edge (desktop + Android)
- ✅ Firefox (desktop)
- ⚠️  Safari 16.4+ (macOS/iOS — needs HTTPS + user gesture)
- ❌ Safari < 16.4 (falls back to in-app only)

## Requirements
- Must be served over **HTTPS** (or localhost for dev)
- `sw.js` must be at the **root** path `/sw.js`

---

## Optional: Add icons
Create these PNG files in your root for best appearance:
- `icon-192.png` — 192×192 app icon
- `badge-72.png`  — 72×72 monochrome badge icon
