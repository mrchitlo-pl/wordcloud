import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, getDocs, writeBatch, serverTimestamp, query, where, runTransaction, Timestamp } from 'firebase/firestore';
window.FB = { initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut,
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, getDocs, writeBatch, serverTimestamp, query, where, runTransaction, Timestamp };
