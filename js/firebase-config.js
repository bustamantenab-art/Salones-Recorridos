/* ============================================================
   firebase-config.js — Config pública de Firebase (proyecto kleno-salones)
   Estos valores van en el cliente; la seguridad real la dan
   las reglas de Firestore + Authentication.
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCvbJU1DyMUYdxjeWHGfnNQqbD4LS96alk",
  authDomain: "kleno-salones.firebaseapp.com",
  projectId: "kleno-salones",
  storageBucket: "kleno-salones.firebasestorage.app",
  messagingSenderId: "361200235097",
  appId: "1:361200235097:web:6b11f3ea8463d5fb2eb748"
};

// Lista de emails con rol admin (ven TODOS los salones).
// Cualquier otro email autenticado es "vendedora" (solo ve los suyos).
window.KLENO_ADMINS = [
  "bustamante.nab@gmail.com",
  "klenodistribuidora@gmail.com"
];
