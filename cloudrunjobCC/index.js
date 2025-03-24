const admin = require("firebase-admin");
const speech = require('@google-cloud/speech').v1p1beta1;

const MAX_USAGE = 120; 
// Retrieve Job-defined env vars
const { SESSION_ID, USER_ID, LANGUAGE_CODE } = process.env;

// Config for stream recognizer that specifies how to handle the request (i.e. audio content)
const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
const languageCode = LANGUAGE_CODE;
console.log("languageCode: " + languageCode);

const config = {
  encoding: encoding,
  sampleRateHertz: sampleRateHertz,
  languageCode: languageCode,
  model: 'default',
  profanityFilter: true,
  useEnhanced: true,
};

// Initial request
const request = {
  config,
  interimResults: true,
};

const client = new speech.SpeechClient();
let recognizeStream = null;

// Start stream recognizer
function startStream() {
  let db = admin.database();
  const sessionRef = db.ref(`transcriptions/${SESSION_ID}/results`);
  let pushRef = sessionRef.push();

  let recognizeStream = client
    .streamingRecognize(request)
    .on('error', err => {
      if (err.code === 11) {
        console.log("Need to restart stream");
        restartStream();
      } else {
        console.error('API request error ' + err);
      }
    })
    // Callback for speech-to-text API
    .on('data', (stream) => {
      const result = stream.results[0];
      if (result.isFinal) {
        pushRef.set(stream.results[0].alternatives[0].transcript);
        pushRef = sessionRef.push();
      } else {
        // Interim results
        pushRef.set(stream.results[0].alternatives[0].transcript);
      }
    })
    .on('end', () => {
      console.log("API calls completed");
      process.exit(0);
    });

  console.log("Stream started");
  return recognizeStream;
}

// Restart stream recognizer -> default 5 minute streaming limit
function restartStream() {
  if (recognizeStream) {
    recognizeStream.end();
    recognizeStream.removeAllListeners();
    recognizeStream = null;
  }

  console.log("Restarting stream");
  recognizeStream = startStream();
}

async function getUserUsageSeconds(db) {
  const userRef = db.ref(`users/${USER_ID}/usage`);  
  let snapshot = await userRef.get();
  return snapshot.val().seconds;
}

async function runJob() {
  console.log(`Listening to ${SESSION_ID}`);
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "",
  });

  let db = admin.database();
  let ref = db.ref(`transcriptions/${SESSION_ID}/chunks`);
  recognizeStream = startStream();
  const currUsageSeconds = await getUserUsageSeconds(db);
  const start = Date.now();

  await new Promise((resolve, reject) => {
    // Listen for audio chunks from the client
    const listener = ref.on("value", async (snapshot) => {
      const audioData = snapshot.val();
      let logKey = typeof audioData === "string" ? audioData.length : "null";
      console.log({
        severity: "DEBUG",
        message: "Received audio chunk " + logKey
      });
      
      if (audioData) {
        var buf = Buffer.from(audioData, 'base64');
        console.log(`Written to stream, ${SESSION_ID}`);
        // console.log(buf);
        recognizeStream.write(buf);
      } else {
        // If audioData is null, the client has stopped sending audio chunks
        resolve();
      }
    });
    // Timeout if user exceeds allowed usage
    setTimeout(resolve, (MAX_USAGE - currUsageSeconds) * 1000); 
  })

  const sessionDurationSeconds = Math.floor((Date.now() - start) / 1000);
  const totalUsageSeconds = currUsageSeconds + sessionDurationSeconds;
  // Update user's usage
  const userRef = db.ref(`users/${USER_ID}/usage`);
  userRef.set({ seconds: totalUsageSeconds });
  
  // Cleanup 
  console.log("Job finished");
  recognizeStream.end();
}

// Start script
runJob().catch(err => {
  console.error(err);
  process.exit(1); // Retry Job Task by exiting the process
});