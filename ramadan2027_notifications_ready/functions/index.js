/**
 * Firebase Cloud Functions - Ramadan Competition 2027
 *
 * Reads documents created in Firestore `pushQueue` and sends real FCM
 * notifications. No service-account credentials are exposed to the web app.
 */

const {setGlobalOptions} = require("firebase-functions");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

exports.sendPushNotification = onDocumentCreated(
    "pushQueue/{queueId}",
    async (event) => {
      const snapshot = event.data;
      if (!snapshot) {
        logger.error("pushQueue trigger fired without document data.");
        return;
      }

      const data = snapshot.data() || {};
      const rawTokens = Array.isArray(data.tokens) ? data.tokens : [];
      const tokens = [...new Set(rawTokens.filter(
          (token) => typeof token === "string" && token.trim().length > 0,
      ))];

      const title = typeof data.title === "string" ? data.title.trim() : "";
      const body = typeof data.body === "string" ? data.body.trim() : "";
      const link = typeof data.link === "string" ? data.link : "";

      if (!tokens.length) {
        logger.warn("pushQueue document contains no valid FCM tokens.", {
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

      logger.info("Sending FCM notification.", {
        queueId: event.params.queueId,
        tokenCount: tokens.length,
        title,
      });

      let successCount = 0;
      let failureCount = 0;

      try {
        // FCM multicast accepts at most 500 registration tokens per call.
        for (let i = 0; i < tokens.length; i += 500) {
          const batch = tokens.slice(i, i + 500);

          const message = {
            notification: {
              title: title || "مسابقة رمضان",
              body,
            },
            data: link ? {link} : {},
            tokens: batch,
          };

          const response = await admin.messaging().sendEachForMulticast(message);
          successCount += response.successCount;
          failureCount += response.failureCount;

          response.responses.forEach((result, index) => {
            if (!result.success) {
              const errorCode = result.error?.code || "unknown";
              logger.warn("FCM token failed.", {
                queueId: event.params.queueId,
                tokenIndex: i + index,
                errorCode,
                errorMessage: result.error?.message || "Unknown FCM error",
              });
            }
          });
        }

        logger.info("FCM notification processing completed.", {
          queueId: event.params.queueId,
          successCount,
          failureCount,
        });

        // The FCM request(s) completed. Delete the queue item so it is not sent again.
        await snapshot.ref.delete();
      } catch (error) {
        logger.error("Failed to send FCM notification.", {
          queueId: event.params.queueId,
          errorCode: error?.code || "unknown",
          errorMessage: error?.message || String(error),
        });

        // Keep the queue item if the server-side FCM operation itself failed.
        throw error;
      }
    },
);
