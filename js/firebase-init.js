/* ============================================================
   firebase-init.js — Reemplaza la capa local (IndexedDB) por
   Firebase Authentication + Firestore. Expone:
     - window.KlenoAuth: { signIn, signOut, currentUser, isAdmin, ready, onCambio }
     - window.KlenoDB:   misma API que la versión vieja (listarSalones,
                         obtenerSalon, guardarSalon, eliminarSalon,
                         guardarFoto, obtenerFoto, eliminarFoto,
                         getUsuarioActual, exportarTodo, importarTodo).
   Esquema Firestore:
     salones/{id}  { nombre, direccion, lat, lng, whatsapp, email,
                     persona, rol, calificacion, observaciones,
                     cargadoPor, cargadoPorUid, creadoEn, actualizadoEn }
     fotos/{id}    { dataUrl, ts }  (base64 — porque Storage requiere Blaze)
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, setDoc, addDoc,
  deleteDoc, query, where, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const fbApp = initializeApp(window.FIREBASE_CONFIG);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// Mantener sesión iniciada entre recargas (PWA).
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ---------- Estado ----------
let currentUser = null;
let isAdminFlag = false;
let cacheSalones = [];
let listenerUnsub = null;
const cambioListeners = [];
let resolveReady;
const readyPromise = new Promise(res => { resolveReady = res; });

function emailEsAdmin(email) {
  const lista = (window.KLENO_ADMINS || []).map(e => (e || '').toLowerCase());
  return lista.includes((email || '').toLowerCase());
}

function notificarCambio() {
  cambioListeners.forEach(fn => { try { fn([...cacheSalones]); } catch (e) { console.error(e); } });
}

function suscribirSalones() {
  if (listenerUnsub) { listenerUnsub(); listenerUnsub = null; }
  if (!currentUser) { cacheSalones = []; notificarCambio(); return; }

  const colRef = collection(db, 'salones');
  // Admin: todos. Vendedora: solo los suyos (filtrado por uid en cliente +
  // reglas Firestore lo refuerzan del lado servidor).
  const q = isAdminFlag
    ? query(colRef)
    : query(colRef, where('cargadoPorUid', '==', currentUser.uid));

  listenerUnsub = onSnapshot(q, (snap) => {
    cacheSalones = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
    notificarCambio();
  }, (err) => {
    console.error('Error en sync de salones:', err);
  });
}

// ---------- Auth listener ----------
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    isAdminFlag = emailEsAdmin(user.email);
    suscribirSalones();
  } else {
    if (listenerUnsub) { listenerUnsub(); listenerUnsub = null; }
    currentUser = null;
    isAdminFlag = false;
    cacheSalones = [];
    notificarCambio();
  }
  if (resolveReady) { resolveReady(user); resolveReady = null; }
  window.dispatchEvent(new CustomEvent('kleno-auth-changed', { detail: { user } }));
});

// ---------- API pública ----------
window.KlenoAuth = {
  ready: readyPromise,                 // promesa que resuelve con el user (o null) al recibir el primer estado
  signIn: (email, pass) => signInWithEmailAndPassword(auth, (email || '').trim(), pass),
  signOut: () => signOut(auth),
  currentUser: () => currentUser,
  isAdmin: () => isAdminFlag,
  onCambio: (fn) => { cambioListeners.push(fn); }
};

window.KlenoDB = {
  // ----- Salones -----
  async listarSalones() {
    return [...cacheSalones];
  },
  async obtenerSalon(id) {
    if (id == null) return null;
    const cacheHit = cacheSalones.find(s => s.id === id || s.id === String(id));
    if (cacheHit) return cacheHit;
    const snap = await getDoc(doc(db, 'salones', String(id)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  async guardarSalon(data) {
    if (!currentUser) throw new Error('Sesión cerrada');
    const ahora = Date.now();
    const copia = { ...data };
    delete copia.id;
    copia.actualizadoEn = ahora;
    if (data.id) {
      await setDoc(doc(db, 'salones', String(data.id)), copia, { merge: true });
      return String(data.id);
    } else {
      copia.creadoEn = ahora;
      copia.cargadoPor = currentUser.email;
      copia.cargadoPorUid = currentUser.uid;
      const ref = await addDoc(collection(db, 'salones'), copia);
      return ref.id;
    }
  },
  async eliminarSalon(id) {
    // Foto primero (las reglas estrictas chequean que el salón aún exista).
    try { await deleteDoc(doc(db, 'fotos', String(id))); } catch (e) { /* puede no existir */ }
    await deleteDoc(doc(db, 'salones', String(id)));
  },

  // ----- Fotos (en Firestore como base64; comprimidas a 1280px desde app.js) -----
  async guardarFoto(salonId, blob) {
    const dataUrl = await blobToDataURL(blob);
    await setDoc(doc(db, 'fotos', String(salonId)), { dataUrl, ts: Date.now() });
  },
  async obtenerFoto(salonId) {
    try {
      const snap = await getDoc(doc(db, 'fotos', String(salonId)));
      if (!snap.exists()) return null;
      return dataURLtoBlob(snap.data().dataUrl);
    } catch (e) { return null; }
  },
  async eliminarFoto(salonId) {
    try { await deleteDoc(doc(db, 'fotos', String(salonId))); } catch (e) {}
  },

  // ----- Usuario / compat con código viejo -----
  async getUsuarioActual() {
    return currentUser ? (currentUser.email.split('@')[0]) : null;
  },
  async setUsuarioActual(_) { /* no-op con Firebase */ },
  async getUsuariosRecientes() { return []; },

  // ----- Export / Import -----
  async exportarTodo() {
    const salones = await this.listarSalones();
    const fotos = [];
    for (const s of salones) {
      try {
        const snap = await getDoc(doc(db, 'fotos', String(s.id)));
        if (snap.exists()) fotos.push({ salonId: s.id, dataUrl: snap.data().dataUrl, ts: snap.data().ts });
      } catch (e) {}
    }
    return {
      app: 'kleno-salones-recorridos',
      version: 3,
      exportadoEn: new Date().toISOString(),
      salones,
      usuarios: [],
      fotos
    };
  },

  async importarTodo(json, modo = 'merge') {
    if (!json || json.app !== 'kleno-salones-recorridos' || !Array.isArray(json.salones)) {
      throw new Error('El archivo no es un backup válido de Salones Recorridos.');
    }
    if (!currentUser) throw new Error('Hay que estar logueado para importar.');

    if (modo === 'replace') {
      // Solo borra lo que el usuario actual puede ver (sus propios salones, o todo si es admin).
      for (const s of cacheSalones) {
        try { await deleteDoc(doc(db, 'fotos', String(s.id))); } catch (e) {}
        try { await deleteDoc(doc(db, 'salones', String(s.id))); } catch (e) {}
      }
    }

    const existentes = new Set();
    if (modo === 'merge') {
      cacheSalones.forEach(s => existentes.add(`${s.nombre}|${s.creadoEn}`));
    }

    const mapaIds = {};
    for (const s of json.salones) {
      const key = `${s.nombre}|${s.creadoEn}`;
      if (modo === 'merge' && existentes.has(key)) continue;
      const copia = { ...s };
      const viejoId = copia.id;
      delete copia.id;
      if (!copia.cargadoPorUid) copia.cargadoPorUid = currentUser.uid;
      if (!copia.cargadoPor)    copia.cargadoPor    = currentUser.email;
      const ref = await addDoc(collection(db, 'salones'), copia);
      if (viejoId != null) mapaIds[viejoId] = ref.id;
    }

    if (Array.isArray(json.fotos)) {
      for (const f of json.fotos) {
        const nuevoId = mapaIds[f.salonId];
        if (!nuevoId) continue;
        try {
          await setDoc(doc(db, 'fotos', String(nuevoId)), { dataUrl: f.dataUrl, ts: f.ts || Date.now() });
        } catch (e) { console.warn('Foto no se pudo restaurar', e); }
      }
    }

    return json.salones.length;
  }
};

// ---------- Helpers ----------
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function dataURLtoBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)[1];
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
