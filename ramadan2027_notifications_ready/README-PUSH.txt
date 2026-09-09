# Ramadan Competition 2027 — Push Notifications

This package keeps the existing platform and adds an Admin > 🔔 الإشعارات tab.
The tab writes manual push requests to Firestore `pushQueue`.
The existing Firebase Cloud Function in `functions/index.js` sends those requests through FCM.

Important:
- The Cloud Function requires Firebase Functions deployment and the project's billing/Blaze setup.
- Never put a Firebase service-account private key in the website files.
- Deploy hosting from `ramadan2027web/`.
- Deploy the function with `firebase deploy --only functions`.

The archive also keeps the original `Ramadan 2027.html` source.
