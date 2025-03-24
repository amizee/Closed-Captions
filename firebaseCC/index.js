import { addAuthChangeListener, callFunction, initialise, onValue, signIn, signUp, ref, set, onChildAdded, onChildChanged } from "./firebase-client.js";

document.querySelector("button[type='submit']").addEventListener("click", signUserIn);
document.querySelector("#start-button").addEventListener("click", startTranscription);
const stopButton = document.querySelector("#stop-button");
stopButton.addEventListener("click", stopRecording);
const languageDropdown = document.getElementById('language-dropdown');

const output = document.getElementById("output");
let textBlock = createTextBlock();

function createTextBlock() {
  const textBlock = document.createElement("span");
  output.appendChild(textBlock);
  return textBlock;
}

function getSelectedLanguage() {
  return languageDropdown.value;
}

async function signUserIn() {
  const email = document.querySelector("input[name='email']").value;
  const password = document.querySelector("input[name='password']").value;
  try {
    await signIn(email, password);
  } catch(e) {
    try {
      await signUp(email, password);
      alert("You have been signed up, please check your email for a verification link");
    } catch(e) {
      console.error(e);
    }
  }
}

addAuthChangeListener((user) => {
  console.log(user);
  document.body.setAttribute("logged-in", user !== null);
})

async function startTranscription() {
  const languageCode = getSelectedLanguage();
  // Create a sessionID for the transcription
  let transcriptionID = await callFunction("startTranscription", {languageCode: languageCode});
  transcriptionID = transcriptionID.data;

  // Reference to send audio chunks to
  chunkRef = ref(`transcriptions/${transcriptionID}/chunks`);
  // Reference to receive the transcription results
  let resultRef = ref(`transcriptions/${transcriptionID}/results`);
  // Start recording mic audio and processes it
  startTranscriptionProcess();

  // Displays the transcription results to the client
  onChildChanged(resultRef, (snapshot) => {
    let data = snapshot.val();
    textBlock.innerText = data;
    // If null, stop recording audio
  });

  onChildAdded(resultRef, (snapshot) => {
    let data = snapshot.val();
    textBlock = createTextBlock();
    textBlock.innerText = data;
  });
}

function stopRecording() {
  // Signal the cloud function to stop
  set(chunkRef, null);  

  // Stop all audio tracks
  stream.getTracks().forEach(track => {
    track.stop();
  });

  // Disconnect stream (AudioNode) from worker node
  source.disconnect();

  // Close audio context
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  console.log("Recording stopped.");
}

// Convert a Uint16Array to a base64 string
function uint16ArrayToBase64(uint16array) { 
  const uint8array = new Uint8Array(uint16array.buffer);
  // Convert the byte array to a binary string 
  let binary = ''; 
  for (let i = 0; i < uint8array.length; i++) { 
    binary += String.fromCharCode(uint8array[i]); 
  } 
  // Convert the binary string to a base64 string
  return btoa(binary); 
}

let stream = null;
let audioContext = null;
let source = null;
let chunkRef = null;

async function startTranscriptionProcess() {
  // Get the audio from the user
  const sampleRate = 16000;
  stream = await navigator.mediaDevices
    .getUserMedia({  
      audio: {
        deviceId: "default",
        sampleRate: sampleRate,
        sampleSize: 16,
        channelCount: 1
      },
      video: false })

  audioContext = new AudioContext({sampleRate: sampleRate});
  // Create a stream
  source = audioContext.createMediaStreamSource(stream);
  // Register the worker node
  await audioContext.audioWorklet.addModule('audio-processor.js');
  const pcmWorker = new AudioWorkletNode(audioContext, 'pcm-worker', {
    outputChannelCount: [1]
  })

  // Pipe the audio stream to the worker to be processed
  source.connect(pcmWorker);
  pcmWorker.port.onmessage = event => {
    let encoded = uint16ArrayToBase64(event.data);
    // Write audio chunks to db which the cloud run job is listening to
    set(chunkRef, encoded);  
  }
  pcmWorker.port.start();
} 

console.log("initialising");
await initialise();
console.log("initialised");