# Call Management CRM

A SIM-based call management CRM for telecalling teams, in the style of Runo. Agents call leads from their own phones and SIM cards. The Android app logs those calls, uploads the phone's call recordings, and reminds agents about follow-ups. Managers see everything on a web dashboard.

```
web/       Next.js + SQLite — dashboard for managers and the API the phone app uses
android/   Native Android app (Kotlin, Jetpack Compose) for agents
```

## What's in this version

**Web dashboard (managers)**
- Today's calls, connect rate, talk time and due follow-ups per agent, plus each agent's live status
- Leads: add, CSV import, search and filter, pipeline stages (New → Contacted → Interested → Follow-up → Won/Lost)
- Auto-assignment: new leads go to the active agent with the fewest open leads
- Lead page: full timeline of calls (with playable recordings) and notes; change stage, follow-up date and agent
- Team: add agents and admins, reset passwords, deactivate (signs them out and frees their leads)
- Webhook to receive leads from your website or ad forms

**Android app (agents)**
- My leads and Follow-ups due, with search
- Tap to call from the phone's SIM; after the call, a form for stage, note and next follow-up
- Auto-dial: calls the list one after another with a 5-second pause between leads
- Background sync every 15 minutes and after each call: call log, recordings, status
- Follow-up reminder notifications
- Available / On break status shown on the manager's dashboard

**Privacy:** only calls to numbers that are leads in the CRM are stored. Agents' personal calls are sent to the server for matching but discarded immediately and never saved.

## Run the server

Needs Node.js 20 or newer.

```bash
cd web
npm install
cp .env.example .env.local   # set ADMIN_EMAIL and ADMIN_PASSWORD
npm run build
npm start                    # http://localhost:3000
```

Sign in with the admin email and password from `.env.local`. The admin account is created on first start. Then go to **Team** and add your agents.

`npm test` runs an end-to-end check of every API flow against a throwaway database.

### Deploying

Run it like your ERP: a Node host with a **persistent disk** (for example a paid Render web service).

- Build command: `cd web && npm ci && npm run build`
- Start command: `cd web && npm start`
- Set `DATA_DIR` to the disk's mount path, for example `/var/data`. The database (`crm.db`) and the recordings live there, so they survive redeploys.
- Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and, if you use the webhook, `LEAD_WEBHOOK_KEY`.
- Use the `https://` address. The phone app sends passwords and recordings to it.

### Adding leads automatically

Website or ad forms can push leads with a POST request:

```bash
curl -X POST https://your-server/api/leads \
  -H "x-api-key: $LEAD_WEBHOOK_KEY" -H "content-type: application/json" \
  -d '{"name":"Mehta Events","phone":"+91 98765 43210","source":"website"}'
```

CSV import expects a header row with `name` and `phone` columns, and optionally `source`.

## Install the Android app

Every push to GitHub builds the app. In GitHub, open **Actions**, select the latest **CI** run, and download **call-crm-debug-apk** under Artifacts. Copy the APK to the phone and install it. You'll need to allow installs from that source.

The app is meant to be installed directly on company phones, not through the Play Store. Google Play restricts apps that read the call log, so a Play listing would need a policy exception.

You can also open `android/` in Android Studio and run it on a phone.

### Phone setup for each agent

1. Install the app and sign in with the server address and the account the admin created.
2. Allow **Call logs**, **Phone** and **Notifications** when asked.
3. Turn on **automatic call recording** in the phone's own Phone/dialer app settings. This works on Samsung, Xiaomi, Vivo and others that include a recorder; Android doesn't let other apps record calls.
4. In the app, open **Settings → Choose folder** and pick the folder the recorder saves to, such as `Recordings/Call` on Samsung or `MIUI/sound_recorder/call_rec` on Xiaomi.
5. Turn off battery optimisation for Call CRM. Otherwise some phones stop the background sync.

## Not in this version yet

- AI call transcription, summaries and sentiment
- WhatsApp Business messaging
- Caller ID pop-up for incoming calls from leads
- iOS app (iOS doesn't let apps read the call log)
