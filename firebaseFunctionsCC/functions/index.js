const admin = require("firebase-admin");
const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {getDatabase} = require("firebase-admin/database");

admin.initializeApp();
const db = getDatabase(); 

const { JobsClient } = require("@google-cloud/run").v2;

async function runCloudRunJob(sessionID, userID, languageCode="en-US") {
  const project = "";
  const location = "";
  const job = "";

  const client = new JobsClient();
  const jobName = `projects/${project}/locations/${location}/jobs/${job}`;

  try {
    // Run the Cloud Run job, passing in environment variables
    await client.runJob({
      name: jobName,
      overrides: { 
        taskCount: 1,
        containerOverrides: [{
          env: [{ name: "SESSION_ID", value: sessionID }, { name: "USER_ID", value: userID }, { name: "LANGUAGE_CODE", value: languageCode }],
        }],
      },
    });

    return { success: true, message: `Speech job started for session ${sessionID}` };
  } catch (error) {
    console.error("Error starting Cloud Run job:", error);
    return { success: false, error: error.message };
  }
};

exports.startTranscription = onCall({
  region: "australia-southeast1",
}, async({data, auth}) => {
  // Check auth is valid
  if (auth) {
    if (!auth.token.email_verified) {
      logger.error("Email is not verified");
      return null;
    }
  } else {
    logger.error("User is not authenticated");
    return null;
  }

  // Create transcriptionID
  let ref = db.ref("transcriptions").push();
  let transcriptionID = ref.key;
  logger.info("Transcription ID: ", transcriptionID);

  runCloudRunJob(transcriptionID, auth.uid, data.languageCode);
  // Return transcriptionID to client
  return transcriptionID;
});