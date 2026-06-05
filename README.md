# ⚡ UpSmart — Your Personal Upwork AI Assistant

AI-powered Chrome extension for Upwork, powered by OpenAI GPT-4o-mini.

---

## 🚀 Installation (2 minutes)

1. **Download / unzip** this folder somewhere on your computer (e.g. `~/upsmart-extension`)

2. **Open Chrome** and go to: `chrome://extensions`

3. **Enable Developer Mode** — toggle in the top-right corner

4. Click **"Load Unpacked"** → select the `upsmart-extension` folder

5. You'll see the ⚡ UpSmart icon in your Chrome toolbar — click it

6. Go to **Setup tab** → paste your OpenAI API key → fill your profile → Save

7. Go to **https://www.upwork.com/nx/s/universal-search/jobs** and the extension activates automatically!

---

## ✨ Features

### 🎯 Filtering
- **Keyword Filtering** — Add target keywords (React, Node.js etc.) to highlight matching jobs
- **Blocked Keywords** — Add words to dim/hide irrelevant jobs (WordPress, logo, etc.)
- **Quick Text Filter** — Filter visible jobs by typing in the toolbar search box
- **Min Score Filter** — Automatically dim jobs below your score threshold

### 🔴 Red Flag Detection
- **Payment Verified Badge** — Every job shows ✓ Verified or ✗ Unverified
- **AI Job Analysis** — Click "✦ Score" on any job for:
  - Score out of 10 (color-coded: Green/Blue/Yellow/Red)
  - Red flags & green flags
  - Match reason based on your profile
  - One-line summary

### 🤖 AI Features (OpenAI)
- **Analyze All** — Score every visible job at once
- **✍ Proposal** — AI writes a personalized cover letter for any job
- **$ Quote** — Estimates a fair project quote with negotiation tips
- **Auto-Analyze** — Optionally score all jobs automatically on page load

### 📊 Job Tracker
- Click **"+ Track"** on any job to save it
- Click the **TRACKER** button on the right edge of Upwork to open the sidebar
- Track status: Saved → Applied → Interviewing → Won / Lost
- Filter by status, search by title

### 🔔 Alerts
- Enable Chrome notifications for new matching jobs
- Set check interval (every 1–30 minutes)

---

## ⚙️ Settings

| Setting | Description |
|---|---|
| OpenAI API Key | Your key from platform.openai.com — stored locally, never shared |
| Freelancer Profile | Describe your skills — AI uses this for scoring and proposals |
| Min Score Filter | Dim jobs below this score (0 = off) |
| Keywords | Highlight matching jobs |
| Blocked Keywords | Dim irrelevant jobs |
| Auto-Analyze | Score jobs automatically |
| Payment Badge | Show verified status |
| Alerts | Chrome notifications |

---

## 💰 API Cost

Using `gpt-4o-mini` (cheapest GPT-4 class model):
- ~$0.001 per job analysis
- ~$0.002 per proposal
- Analyzing 50 jobs/day ≈ $1.50/month

---

## 🔒 Privacy

- Your OpenAI API key is stored in `chrome.storage.local` — never leaves your device except to go directly to OpenAI
- No third-party servers, no accounts, no tracking
- All data (tracker, settings) lives in your browser's local storage

---

## 🛠 Troubleshooting

**Extension not showing on Upwork?**
→ Make sure you're on a job search page (e.g. `upwork.com/nx/s/universal-search/jobs`)
→ Try refreshing the page after installing
**"No API key" error?**
→ Click the ⚡ icon → Setup tab → paste your OpenAI key → Save

**AI not analyzing?**
→ Check your OpenAI key has credits at platform.openai.com/usage

---

Built for personal use. No publishing, no store, no accounts needed.
