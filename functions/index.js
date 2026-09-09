```js
/**
 * Firebase Cloud Functions - Ramadan Competition 2027
 */

const {setGlobalOptions} = require("firebase-functions");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK using the project's default credentials.
admin.initializeApp();

// Keep the existing global configuration.
setGlobalOptions({maxInstances: 10});

/**
 * Send FCM notifications when a new document is added to pushQueue.
 *
 * Expected document structure:
 * {
 *   tokens: ["FCM_TOKEN_1", "FCM_TOKEN_2", ...],
 *   title: "...",
 *   body: "...",
 *   createdAt: FieldValue.serverTimestamp()
 * }
 */
exports.sendPushNotification = onDocumentCreated(
    "pushQueue/{queueId}",
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        logger.error("pushQueue trigger fired without document data.");
        return;
      }

      const data = snapshot.data();

      const tokens = Array.isArray(data.tokens) ? data.tokens : [];
      const title = typeof data.title === "string" ? data.title : "";
      const body = typeof data.body === "string" ? data.body : "";

      if (tokens.length === 0) {
        logger.warn("pushQueue document contains no FCM tokens.", {
          queueId: event.params.queueId,
        });

        await snapshot.ref.delete();
        return;
      }

      if (!title && !body) {
        logger.warn("pushQueue document contains an empty notification.", {
          queueId: event.params.queueId,
        });

        await snapshot.ref.delete();
        return;
      }

      // Remove empty/invalid token values and duplicates.
      const validTokens = [
        ...new Set(
            tokens.filter(
                (token) => typeof token === "string" && token.trim().length > 0,
            ),
        ),
      ];

      if (validTokens.length === 0) {
        logger.warn("No valid FCM tokens found in pushQueue document.", {
          queueId: event.params.queueId,
        });

        await snapshot.ref.delete();
        return;
      }

      logger.info("Sending FCM notification.", {
        queueId: event.params.queueId,
        tokenCount: validTokens.length,
        title,
      });

      try {
        const message = {
          notification: {
            title,
            body,
          },
          tokens: validTokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        logger.info("FCM notification processing completed.", {
          queueId: event.params.queueId,
          successCount: response.successCount,
          failureCount: response.failureCount,
        });

        // Log individual token failures without stopping the rest.
        if (response.failureCount > 0) {
          response.responses.forEach((result, index) => {
            if (!result.success) {
              const token = validTokens[index];

              logger.error("FCM token failed.", {
                queueId: event.params.queueId,
                token,
                errorCode: result.error?.code || "unknown",
                errorMessage: result.error?.message || "Unknown FCM error",
              });
            }
          });
        }

        // Delete the queue document after FCM has processed the batch.
        await snapshot.ref.delete();

        logger.info("pushQueue document deleted after FCM processing.", {
          queueId: event.params.queueId,
        });
      } catch (error) {
        logger.error("Failed to send FCM notification.", {
          queueId: event.params.queueId,
          errorCode: error?.code || "unknown",
          errorMessage: error?.message || String(error),
        });

        // Do not delete the queue document when the FCM request itself
        // fails. This prevents losing a notification because of a temporary
        // Firebase/FCM error.
        throw error;
      }
    },
);
```
