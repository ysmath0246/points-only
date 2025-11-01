// src/firebase.js
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBbk4SiSqWANAiet8EVvTrIC21aAWBvg",
  authDomain: "myattendanceproject-45c1b.firebaseapp.com",
  projectId: "myattendanceproject-45c1b",
  storageBucket: "myattendanceproject-45c1b.appspot.com",
  messagingSenderId: "347137303283",
  appId: "1:347137303283:web:b47a6d993edd974765cd86"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

export { db }
