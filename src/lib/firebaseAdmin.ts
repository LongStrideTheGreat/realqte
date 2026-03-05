// lib/firebaseAdmin.ts
// This file MUST only be imported in API routes / server actions / getServerSideProps etc.
// Never import it in 'use client' files or pages.
import 'server-only';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });

    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
  }
}

export const adminDb = admin.firestore();