// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDVbz2ZJCtUi3vhakaz8HUxiGN2_0YTTew",
  authDomain: "viajaapp-2e6ce.firebaseapp.com",
  projectId: "viajaapp-2e6ce",
  storageBucket: "viajaapp-2e6ce.firebasestorage.app",
  messagingSenderId: "381216837346",
  appId: "1:381216837346:web:f07999a92035d83b4218bb",
  measurementId: "G-9FHH7ZG4EZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
const auth = getAuth(app);

// Exporta as instâncias para serem usadas em outros arquivos
export { db, auth };
