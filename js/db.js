/* ============================================================
   db.js — Capa de persistencia con IndexedDB
   Schema:
     - salones: { id, nombre, direccion, lat, lng, whatsapp, email,
                  persona, rol, calificacion, observaciones,
                  cargadoPor, creadoEn, actualizadoEn }
     - meta:    { key, value }   (usuario actual, lista usuarios)
   ============================================================ */
(function () {
  const DB_NAME = 'kleno-salones';
  const DB_VERSION = 2;

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('salones')) {
          const s = db.createObjectStore('salones', { keyPath: 'id', autoIncrement: true });
          s.createIndex('cargadoPor', 'cargadoPor', { unique: false });
          s.createIndex('creadoEn', 'creadoEn', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        // v2: nuevo store para fotos (Blob aparte para no inflar registros)
        if (!db.objectStoreNames.contains('fotos')) {
          db.createObjectStore('fotos', { keyPath: 'salonId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return openDB().then(db => db.transaction(store, mode).objectStore(store));
  }

  function reqToPromise(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // ---------- Salones ----------
  async function listarSalones() {
    const store = await tx('salones', 'readonly');
    return reqToPromise(store.getAll()).then(arr =>
      arr.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0))
    );
  }

  async function obtenerSalon(id) {
    const store = await tx('salones', 'readonly');
    return reqToPromise(store.get(Number(id)));
  }

  async function guardarSalon(data) {
    const store = await tx('salones', 'readwrite');
    const ahora = Date.now();
    if (!data.id) {
      data.creadoEn = ahora;
    }
    data.actualizadoEn = ahora;
    if (data.id) data.id = Number(data.id);
    return reqToPromise(store.put(data));
  }

  async function eliminarSalon(id) {
    const store = await tx('salones', 'readwrite');
    const fotosStore = await tx('fotos', 'readwrite');
    await reqToPromise(fotosStore.delete(Number(id)));
    return reqToPromise(store.delete(Number(id)));
  }

  // ---------- Fotos ----------
  async function guardarFoto(salonId, blob) {
    const store = await tx('fotos', 'readwrite');
    return reqToPromise(store.put({ salonId: Number(salonId), blob, ts: Date.now() }));
  }
  async function obtenerFoto(salonId) {
    const store = await tx('fotos', 'readonly');
    const r = await reqToPromise(store.get(Number(salonId)));
    return r ? r.blob : null;
  }
  async function eliminarFoto(salonId) {
    const store = await tx('fotos', 'readwrite');
    return reqToPromise(store.delete(Number(salonId)));
  }
  async function listarFotos() {
    const store = await tx('fotos', 'readonly');
    return reqToPromise(store.getAll());
  }

  // ---------- Meta (usuario actual, lista de usuarios) ----------
  async function getMeta(key) {
    const store = await tx('meta', 'readonly');
    const r = await reqToPromise(store.get(key));
    return r ? r.value : null;
  }
  async function setMeta(key, value) {
    const store = await tx('meta', 'readwrite');
    return reqToPromise(store.put({ key, value }));
  }

  async function getUsuarioActual() { return getMeta('usuarioActual'); }
  async function setUsuarioActual(u) {
    await setMeta('usuarioActual', u);
    const lista = (await getMeta('usuarios')) || [];
    if (u && !lista.includes(u)) {
      lista.unshift(u);
      await setMeta('usuarios', lista.slice(0, 8));
    }
  }
  async function getUsuariosRecientes() { return (await getMeta('usuarios')) || []; }

  // ---------- Export / Import ----------
  async function exportarTodo() {
    const salones = await listarSalones();
    const usuarios = await getUsuariosRecientes();
    const fotos = await listarFotos();
    // Convertir blobs a base64 para que viajen en el JSON
    const fotosB64 = await Promise.all(fotos.map(async f => ({
      salonId: f.salonId,
      ts: f.ts,
      dataUrl: await blobToDataURL(f.blob)
    })));
    return {
      app: 'kleno-salones-recorridos',
      version: 2,
      exportadoEn: new Date().toISOString(),
      salones,
      usuarios,
      fotos: fotosB64
    };
  }

  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataURLtoBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:(.*?);base64/)[1];
    const bin = atob(b64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function importarTodo(json, modo = 'merge') {
    if (!json || json.app !== 'kleno-salones-recorridos' || !Array.isArray(json.salones)) {
      throw new Error('El archivo no es un backup válido de Salones Recorridos.');
    }
    // Las transacciones de IndexedDB se cierran sole en el primer await que sale
    // del tick — por eso abrimos una nueva por cada operación.
    if (modo === 'replace') {
      await reqToPromise((await tx('salones', 'readwrite')).clear());
      await reqToPromise((await tx('fotos', 'readwrite')).clear());
    }
    const existentes = modo === 'merge'
      ? new Set((await reqToPromise((await tx('salones', 'readonly')).getAll()))
          .map(s => `${s.nombre}|${s.creadoEn}`))
      : new Set();

    // Mapear viejo id (del backup) -> nuevo id (recién creado), para reasignar fotos
    const mapaIds = {};
    for (const s of json.salones) {
      const key = `${s.nombre}|${s.creadoEn}`;
      if (modo === 'merge' && existentes.has(key)) continue;
      const copia = { ...s };
      const viejoId = copia.id;
      delete copia.id;
      const store = await tx('salones', 'readwrite');
      const nuevoId = await reqToPromise(store.add(copia));
      if (viejoId != null) mapaIds[viejoId] = nuevoId;
    }

    // Restaurar fotos (si vienen en el backup)
    if (Array.isArray(json.fotos)) {
      for (const f of json.fotos) {
        const nuevoId = mapaIds[f.salonId];
        if (nuevoId == null) continue;
        try {
          const blob = dataURLtoBlob(f.dataUrl);
          const fotosStore = await tx('fotos', 'readwrite');
          await reqToPromise(fotosStore.put({ salonId: Number(nuevoId), blob, ts: f.ts || Date.now() }));
        } catch (e) {
          console.warn('Foto no se pudo restaurar para salón', nuevoId, e);
        }
      }
    }

    if (Array.isArray(json.usuarios) && json.usuarios.length) {
      const actuales = await getUsuariosRecientes();
      const merged = Array.from(new Set([...actuales, ...json.usuarios])).slice(0, 8);
      await setMeta('usuarios', merged);
    }
    return json.salones.length;
  }

  // Exponer
  window.KlenoDB = {
    listarSalones, obtenerSalon, guardarSalon, eliminarSalon,
    guardarFoto, obtenerFoto, eliminarFoto,
    getUsuarioActual, setUsuarioActual, getUsuariosRecientes,
    exportarTodo, importarTodo
  };
})();
