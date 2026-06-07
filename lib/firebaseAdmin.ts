/**
 * Firebase Admin SDK — server-side only. Verifies the Google ID token the
 * browser sends after a successful signInWithPopup.
 *
 * Requires three env vars (download from Firebase Console → Project Settings
 * → Service Accounts → Generate new private key):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY   (the multi-line key — stored with literal \n)
 */

import * as admin from "firebase-admin";

function getAdminApp(): admin.app.App | null {
  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;

  if (admin.apps.length) return admin.apps[0] as admin.app.App;

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export interface FirebaseTokenPayload {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * Verify a Firebase ID token and return the decoded payload.
 * Throws if the token is invalid or the Admin SDK isn't configured.
 */
export async function verifyFirebaseToken(
  idToken: string
): Promise<FirebaseTokenPayload> {
  const app = getAdminApp();
  if (!app) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in .env"
    );
  }
  const decoded = await admin.auth(app).verifyIdToken(idToken, true);
  return {
    uid:            decoded.uid,
    email:          (decoded.email ?? "").toLowerCase(),
    name:           decoded.name as string | undefined,
    picture:        decoded.picture as string | undefined,
    email_verified: decoded.email_verified,
  };
}
