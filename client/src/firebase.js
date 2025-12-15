import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey : "AIzaSyBkCgHdXCXQNcdktmBDyKQrkebPtPMXpiY" , 
    authDomain : "fragpunkstats.firebaseapp.com" , 
    projectId : "fragpunkstats" , 
    storageBucket : "fragpunkstats.firebasestorage.app" , 
    messagingSenderId : "530367577848" , 
    appId : "1:530367577848:web:6f1197e04087b9dd1c050d" , 
    measurementId : "G-7R30C1R4DV"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
