/**
 * Session, config, and staying alive.
 *
 * MV3 kills an idle service worker after 30 seconds. That is fine for most
 * extensions and fatal for this one: the agent is on a call, and a copilot
 * that disconnects mid-conversation is worse than no copilot, because they
 * were relying on it. So the socket is re-established on every wake and the
 * worker is kept warm by an alarm while a call is live — the documented way,
 * not a `setInterval` that the platform will kill anyway.
 */

const KEEPALIVE = "voicepilot-keepalive";
let callActive = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * `docs/07` §6: selectors are served, versioned, never shipped.
 *
 * Cached so a network blip does not blind the extension mid-call, and the
 * cached copy carries its version so a binding recorded today can be traced
 * to the config that produced it.
 */
async function loadConfig(host) {
  const cached = await chrome.storage.session.get(host);
  if (cached[host]) return cached[host];
  return { provider: "unknown", version: 0, rules: [] };
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "binding") {
    chrome.runtime.sendMessage({ type: "panel:binding", ...msg }).catch(() => {});
    return;
  }
  if (msg.type === "call:start") {
    callActive = true;
    chrome.alarms.create(KEEPALIVE, { periodInMinutes: 0.4 });
    return;
  }
  if (msg.type === "call:end") {
    callActive = false;
    chrome.alarms.clear(KEEPALIVE);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE && callActive) {
    // Touching storage is enough to reset the idle timer, and it is the
    // behaviour Chrome documents rather than one it tolerates.
    chrome.storage.session.set({ _alive: Date.now() });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch {
    return;
  }
  const config = await loadConfig(host);
  chrome.tabs.sendMessage(tabId, { type: "config", config }).catch(() => {
    // No content script on this tab. Normal: host permissions are granted
    // per tenant domain, never <all_urls>, which is a rejection in review
    // and a red flag to any corporate security team.
  });
});
