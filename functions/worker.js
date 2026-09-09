/**
 * Ramadan 2027 - GitHub Actions FCM sender
 * Reads pending documents from Firestore collection `pushQueue`
 * and sends real FCM notifications using a Firebase service-account
 * supplied through FIREBASE_SERVICE_ACCOUNT.
 *
 * This file is intended for a trusted GitHub Actions runner.
 */

const admin = require("firebase-admin");

function loadCredentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing.");

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (err) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }

  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required fields.");
  }

  // GitHub secret values sometimes contain escaped newlines.
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  return credentials;
}

const serviceAccount = loadCredentials();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const messaging = admin.messaging();

function cleanTokens(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter(
      (token) => typeof token === "string" && token.trim().length > 0
    ).map((token) => token.trim())
  )];
}

async function processQueueDocument(doc) {
  const data = doc.data() || {};
  const tokens = cleanTokens(data.tokens);
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";
  const link = typeof data.link === "string" ? data.link : "";

  if (!tokens.length) {
    console.log(`[${doc.id}] No valid FCM tokens; deleting queue item.`);
    await doc.ref.delete();
    return;
  }

  if (!title && !body) {
    console.log(`[${doc.id}] Empty notification; deleting queue item.`);
    await doc.ref.delete();
    return;
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);

    const message = {
      notification: {
        title: title || "مسابقة رمضان",
        body,
      },
      data: link ? { link } : {},
      tokens: batch,
    };

    const response = await messaging.sendEachForMulticast(message);

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((result, index) => {
      if (!result.success) {
        const code = result.error?.code || "unknown";
        console.log(
          `[${doc.id}] token ${i + index} failed: ${code} - ` +
          `${result.error?.message || "Unknown error"}`
        );

        // These tokens can no longer receive FCM and should not be reused.
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalidTokens.push(batch[index]);
        }
      }
    });
  }

  console.log(
    `[${doc.id}] FCM finished: ${successCount} success, ${failureCount} failed.`
  );

  // The send operation completed. Remove the queue item to prevent duplicates.
  await doc.ref.delete();
}

async function main() {
  const snapshot = await db
    .collection("pushQueue")
    .limit(100)
    .get();

  if (snapshot.empty) {
    console.log("pushQueue is empty.");
    return;
  }

  console.log(`Found ${snapshot.size} pushQueue document(s).`);

  for (const doc of snapshot.docs) {
    try {
      await processQueueDocument(doc);
    } catch (error) {
      console.error(
        `[${doc.id}] FAILED: ${error?.code || "unknown"} - ` +
        `${error?.message || String(error)}`
      );
      // Keep failed queue item for another run/retry.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
