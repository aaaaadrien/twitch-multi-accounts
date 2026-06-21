# twitch-multi-accounts

A browser extension for Vivaldi (and any Chromium-based browser) to use multiple Twitch accounts simultaneously in the same window.

---

## Why this extension exists

I run two Twitch accounts as part of my DJ streaming setup:

- **adrienLinuxtricks** — my main account
- **adrienLT_DJ** — my dedicated DJ stream account

**Twitch does not support multi-account natively.** There is no built-in way to be logged into two accounts at the same time in the same browser session. Switching accounts means logging out and back in every time, which is impractical when you need to manage both during a live stream.

**Vivaldi (and Chromium-based browsers in general) cannot isolate sessions per tab for the same website.** Unlike Firefox, which has a native *Multi-Account Containers* API (`contextualIdentities`) that assigns separate cookie jars to individual tabs, Chromium shares cookies globally across all tabs for a given domain. There is no extension API to change this behaviour. This feature was requested for Vivaldi here: [Multi-Account Containers - Vivaldi Forum](https://forum.vivaldi.net/topic/25289/multi-account-containers)

The only built-in workarounds — separate browser profiles or incognito windows — both open entirely new windows, breaking the single-window workflow that makes stream management manageable.

So I built this extension for my own needs.

---

## How it works

The extension stores a **snapshot of your Twitch cookies** for each account. When you click **Open** on a saved account, it:

1. Saves the current Twitch cookies into the previously active slot
2. Restores the target account's cookies into the browser
3. Opens a new Twitch tab logged in as that account

When you switch between assigned Twitch tabs, the cookie swap happens automatically and the tab reloads.

> **Note:** Because Chromium shares cookies across all tabs for a domain, both tabs cannot be truly active at the same time with different sessions. The correct session is loaded whichever tab you bring into focus.

---

## Installation

1. Unzip the archive
2. Open `vivaldi://extensions` (or `chrome://extensions`)
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `twitch-multi-accounts/` folder

---

## Usage

### First-time setup

**Account A (e.g. adrienLinuxtricks):**
1. Go to [twitch.tv](https://www.twitch.tv) and log in as account A
2. Open the extension popup → click **＋ Add this account** → name it → Save
   *(your current cookies are captured and stored)*

**Account B (e.g. adrienLT_DJ):**
1. In the popup, click **Open** on account A — this loads its cookies into a new tab
2. Log out of Twitch and log in as account B
3. Open the popup → **＋ Add this account** → name it → Save

You now have two saved slots. Click **Open** on either to open a Twitch tab with the correct session.

### Daily use

- Click **Open** next to an account to open a new Twitch tab for that account
- Switch between tabs normally — cookies are swapped automatically on tab focus
- Click ✎ to rename an account or change its colour
- The **Active** badge shows which account is assigned to the current tab

---

## Limitations

- **Cookies are shared in Chromium** — two tabs cannot hold different Twitch sessions simultaneously. The swap happens on tab activation.
- Works only on `twitch.tv` — intentionally scoped to that domain.
- If Twitch changes how it stores authentication (e.g. moves from cookies to another mechanism), the extension may need updating.

---

## License

Personal project — no licence, no warranty. Use at your own risk.
