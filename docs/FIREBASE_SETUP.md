# Turning on "Sign in with Google" (Firebase)

The app saves your portfolios, watchlist, alerts, paper trading, drawings and settings in your browser. With Firebase set up, people can also sign in with Google, and the same data follows them to any device. It stays free for a small number of users (the Firebase "Spark" plan allows 1 GB of storage and tens of thousands of reads and writes a day).

Until you do the steps below, the sign-in button simply does not appear and the app works exactly as before.

## 1. Create the Firebase project (5 minutes, in the browser)

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Add project**, give it a name (for example `trademaster`), and turn Google Analytics off.
3. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Pick a support email and save.
4. **Authentication → Settings → Authorized domains → Add domain:** `abhishekeee.github.io` (`localhost` is already there for testing).
5. **Build → Firestore Database → Create database.** Choose *production mode* and a region near you (for example `asia-south1`, Mumbai).
6. In Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](../firestore.rules) in this repository, and **Publish**. The rules let each person read and write only their own data.
7. **Project settings (the gear) → General → Your apps → Web (`</>`) → Register app** (skip Firebase Hosting). Copy the four values it shows: `apiKey`, `authDomain`, `projectId`, `appId`.

## 2. Give the website the settings

These four values are the public web-app settings, not secrets. Access is protected by the sign-in and the rules above.

**For the live site (GitHub Pages):** in the GitHub repository go to *Settings → Secrets and variables → Actions → Variables → New repository variable*, and add:

| Variable | Value |
|---|---|
| `FIREBASE_API_KEY` | the `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | the `authDomain` |
| `FIREBASE_PROJECT_ID` | the `projectId` |
| `FIREBASE_APP_ID` | the `appId` |

Then open *Actions → Deploy to GitHub Pages → Run workflow* so the site is rebuilt with them.

**For running on your own computer:** copy `web/.env.example` to `web/.env.local`, fill in the same four values, and restart `npm run dev`.

## 3. Optional hardening

In the Google Cloud console (<https://console.cloud.google.com/apis/credentials>), open the "Browser key" Firebase created and, under *Application restrictions → Websites*, allow only `https://abhishekeee.github.io/*` and `http://localhost:*`.

## What is saved, and how

- Each setting is one small document at `users/<your id>/store/<name>` in Firestore: portfolios, watchlist, alerts, paper trading, chart drawings, display settings. Cached exchange rates are not saved.
- The browser copy stays the working copy. Changes are sent to your account a moment after you make them, and other devices pick them up the next time the app opens.
- The first time you sign in on a device that already holds different data than your account, you are asked whether to **combine** both, use the account's data, or keep the device's data. Nothing is overwritten before you choose.
- **Sign out** keeps this device's copy. **Sign out and clear this device** removes it from the browser (it stays in your account).
- Screenshots you upload for import are read in your browser and are never uploaded; only the holdings you confirm are saved.
- If two devices change the same setting, the more recent change wins, judged by each device's clock.
