// UpSmart Background Service Worker
// Handles polling, notifications, and message routing

const ALARM_NAME = "upsmart-job-poll";

function updateExtensionBadge(enabled) {
  if (enabled === false) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#7f1d1d" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function isExtensionEnabled(result) {
  return result.extension_enabled !== false;
}

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log("[UpSmart] Extension installed");
  chrome.storage.local.get(["extension_enabled"], (result) => {
    updateExtensionBadge(isExtensionEnabled(result));
  });
  setupAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["extension_enabled"], (result) => {
    updateExtensionBadge(isExtensionEnabled(result));
  });
  setupAlarm();
});

// ── Alarm Setup ───────────────────────────────────────────────────────────────
function setupAlarm() {
  chrome.storage.local.get(["poll_interval", "alerts_enabled", "extension_enabled"], (result) => {
    if (!result.alerts_enabled || !isExtensionEnabled(result)) return;
    const minutes = result.poll_interval || 15;
    chrome.alarms.clear(ALARM_NAME, () => {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes });
      console.log(`[UpSmart] Alarm set: every ${minutes} minutes`);
    });
  });
}

// ── Alarm Handler ─────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollForJobs();
  }
});

// ── Poll for Jobs ─────────────────────────────────────────────────────────────
async function pollForJobs() {
  console.log("[UpSmart] Polling for new jobs...");

  const result = await chrome.storage.local.get([
    "keywords", "last_seen_jobs", "min_score_alert", "extension_enabled"
  ]);
  if (!isExtensionEnabled(result)) return;
  const keywords = result.keywords || [];
  const lastSeen = result.last_seen_jobs || [];
  const minScore = result.min_score_alert || 7;

  if (keywords.length === 0) return;

  try {
    const query = keywords.slice(0, 3).join(" ");
    const url = `https://www.upwork.com/nx/s/universal-search/jobs/?nbs=1&q=${encodeURIComponent(query)}`;

    // We can't directly fetch Upwork (auth issues), so we open a tab silently
    // and let the content script handle it. Instead, we notify the user to check.
    chrome.notifications.create({
      type: "basic",
      iconUrl: "public/icons/icon48.png",
      title: "UpSmart — Job Alert",
      message: `New jobs may be available for: ${keywords.slice(0, 2).join(", ")}. Click to check.`,
      priority: 1,
      buttons: [{ title: "Open Upwork" }]
    });

  } catch (err) {
    console.error("[UpSmart] Poll error:", err);
  }
}

// ── Notification Click ────────────────────────────────────────────────────────
chrome.notifications.onClicked.addListener(() => {
  chrome.storage.local.get(["keywords"], (result) => {
    const keywords = result.keywords || [];
    const query = keywords.slice(0, 3).join(" ");
    const url = `https://www.upwork.com/nx/s/universal-search/jobs/?nbs=1&q=${encodeURIComponent(query)}`;
    chrome.tabs.create({ url });
  });
});

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (btnIdx === 0) {
    chrome.storage.local.get(["keywords"], (result) => {
      const keywords = result.keywords || [];
      const query = keywords.slice(0, 3).join(" ");
      chrome.tabs.create({ url: `https://www.upwork.com/nx/s/universal-search/jobs/?nbs=1&q=${encodeURIComponent(query)}` });
    });
  }
});

// ── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTENSION_TOGGLED") {
    updateExtensionBadge(message.enabled);
    if (!message.enabled) {
      chrome.alarms.clear(ALARM_NAME);
    } else {
      setupAlarm();
    }
    sendResponse({ ok: true });
  }

  if (message.type === "RESTART_ALARM") {
    setupAlarm();
    sendResponse({ ok: true });
  }

  if (message.type === "STOP_ALARM") {
    chrome.alarms.clear(ALARM_NAME);
    sendResponse({ ok: true });
  }

  if (message.type === "GET_STATUS") {
    chrome.alarms.get(ALARM_NAME, (alarm) => {
      sendResponse({ active: !!alarm, alarm });
    });
    return true; // async
  }

  if (message.type === "SAVE_APPLICATION") {
    chrome.storage.local.get(["applications"], (result) => {
      const apps = result.applications || [];
      const existing = apps.findIndex(a => a.id === message.data.id);
      if (existing >= 0) {
        apps[existing] = { ...apps[existing], ...message.data };
      } else {
        apps.push({ ...message.data, savedAt: Date.now() });
      }
      chrome.storage.local.set({ applications: apps }, () => {
        sendResponse({ ok: true, count: apps.length });
      });
    });
    return true;
  }

  if (message.type === "GET_APPLICATIONS") {
    chrome.storage.local.get(["applications"], (result) => {
      sendResponse({ applications: result.applications || [] });
    });
    return true;
  }

  if (message.type === "UPDATE_APPLICATION_STATUS") {
    chrome.storage.local.get(["applications"], (result) => {
      const apps = result.applications || [];
      const idx = apps.findIndex(a => a.id === message.id);
      if (idx >= 0) {
        apps[idx].status = message.status;
        apps[idx].updatedAt = Date.now();
      }
      chrome.storage.local.set({ applications: apps }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === "DELETE_APPLICATION") {
    chrome.storage.local.get(["applications"], (result) => {
      const apps = (result.applications || []).filter(a => a.id !== message.id);
      chrome.storage.local.set({ applications: apps }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.extension_enabled) return;
  const enabled = changes.extension_enabled.newValue !== false;
  updateExtensionBadge(enabled);
  if (!enabled) {
    chrome.alarms.clear(ALARM_NAME);
  } else {
    setupAlarm();
  }
});
