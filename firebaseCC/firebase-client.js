import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import {getAuth, signInAnonymously, signInWithEmailAndPassword, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, sendEmailVerification as _sendEmailVerification, signOut as _signOut} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import {update, getDatabase, child, push, ref as _ref, get, onValue, onChildAdded, onChildChanged, onChildRemoved, set, off,
       query, endAt, endBefore, equalTo, startAfter, orderByKey, orderByValue, orderByChild, limitToFirst, limitToLast } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js'
import { getFunctions, httpsCallable  } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js'

const firebaseConfig = {

};

const FUNCTION_LOCATION = "australia-southeast1";
let initialised = false;
let App = null;
let Database = null;
let Functions = null;
let Auth = null;
let User = null;
let StateListeners = [];
let waitForUserProm = null;

// Generates a random key to use as the device's unique identifier DUID.
function makeRandomKey(){
  return  (Math.round(Math.random() * 100000)).toString(32) + Math.round(performance.now() * 1000).toString(32) + (Math.round(Math.random() * 100000)).toString(32);
}

/* If a DUID already exists in local storage retreive that key otherwise generate a new key 
   and store in local storage. */ 
let DUID = localStorage.getItem('duid');
if (DUID == null) {
  DUID = makeRandomKey();
  localStorage.setItem('duid', DUID);
}

/* If the user has changed updates the new user and calls all listeners with the new user data.
   If a listener returns the string "remove" then the listener will be removed */
function authChangeHandler(user){
  // If the user has changed
  if (!(user != null && User != null && user.uid == user.uid)) {
    // Update the user object
    User = user;
    let newListeners = [];
    // Call listeners with the new user
    for (let obj of StateListeners) {
      if (obj instanceof Function) {
        if (obj(user) != "remove") newListeners.push(obj);
      } else if (typeof obj === 'object' && obj !== null) {
        if (obj.onauthchange instanceof Function) {
          if (obj.onauthchange(user) != "remove") newListeners.push(obj);
        }
      }
    }
    StateListeners = newListeners;
  }
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ PUBLIC FUNCTIONS ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

/*  Initialize firebase, initializes the firebase app with the given configuration
    after initializing wait for an auth state change and return */
export async function initialise(config = firebaseConfig) {
  if (initialised) return await waitForUserProm;
  initialised = true;
  App = initializeApp(config);
  Database = getDatabase(App);
  Auth = getAuth();
  Functions = getFunctions(App, FUNCTION_LOCATION);

  waitForUserProm = new Promise((resolve, reject) => {
    let init = true;
    onAuthStateChanged(Auth, async (userData) => {
      if (userData == null) {
      } else {
        console.log("auth state change: user data", userData);
        if (init) {
          init = false;
        }
      }
      authChangeHandler(userData);
      resolve(userData);
    });
  });
  return await waitForUserProm;
}
  
//  Add an auth state change listener
export function addAuthChangeListener(obj) {
  StateListeners.push(obj);
}

// Get user uid, if none exists then the DUID is returned instead
export function getUID(){
  let uid = DUID;
  if (User != null && typeof User !== "string") {
    uid = User.uid;
  }
  return uid;
}

// Get user data object
export function getUser(){return User;}

// Get App object
export function getApp(){return App;}

// Get Database object
export function getDB(){return Database; }

// Get Ref using database
export function ref(path) {return _ref(Database, path);}

export async function callFunction(name, data) {
  let res = null;
  if (Functions){
    const func = httpsCallable(Functions, name);
    res = await func(data);
  }
  return res;
}

export async function sendEmailVerification() {
  // Send email verification
  if (User) {
    const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: true
    };
    await _sendEmailVerification(User, actionCodeSettings);
  }
}

export async function signIn(email, password) {
   await signInWithEmailAndPassword(Auth, email, password);
}

export async function setUserInfo(email) {
  await set(ref("users/" + getUID()), {email: email});
}

export async function signOut() {
  await _signOut(Auth);
}

export async function signUp(email, password) {
  // Register user
  await createUserWithEmailAndPassword(Auth, email, password);
  await setUserInfo(email);
  await sendEmailVerification();

  signOut();
}

window.signOut = signOut;


export {update, child, get, push, set, onChildAdded, onChildRemoved, onChildChanged, onValue, query, endAt, endBefore, equalTo, startAfter, orderByKey, orderByValue, orderByChild, limitToFirst, limitToLast, _ref}