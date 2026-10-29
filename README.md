# Road to Black Friday

Day-by-day launch checklist for Jasper and Aditya. Anyone with the link can tick tasks on and off, and the checks are shared through Firebase.

## 1. Set up Firebase (about 5 minutes, free)

1. Go to https://console.firebase.google.com and click **Create a project**. Analytics can be off.
2. In the left menu, open **Build > Firestore Database > Create database**. Pick a US location and start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
4. Go to **Project settings** (gear icon) > **Your apps** > click the **</>** (Web) icon, give it a name, and register it. Skip Firebase Hosting.
5. Copy the `apiKey`, `authDomain`, `projectId` and `appId` values into `firebase-config.js` and commit.

Until step 5 is done the page still works, but checks are only saved in your own browser.

## 2. Turn on the website

Repo **Settings > Pages > Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. The site appears at `https://<username>.github.io/<repo>/` after a minute.

GitHub Pages is free for public repos. A private repo needs GitHub Pro, and the site is still public either way.

## Notes

- The site is unlisted (`noindex`), but anyone who has the link can see it and change checks.
- Task ids come from the date and position in the list, so inserting a task in the middle of a day shifts the checks below it. Add new tasks to the end of a day.
