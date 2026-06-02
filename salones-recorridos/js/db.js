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
  const DB_VERSION = 1;

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
    return reqToPromise(store.delete(Number(id)));
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
    return {
      app: 'kleno-salones-recorridos',
      version: 1,
      exportadoEn: new Date().toISOString(),
      salones,
      usuarios
    };
  }

  async function importarTodo(json, modo = 'merge') {
    if (!json || json.app !== 'kleno-salones-recorridos' || !Array.isArray(json.salones)) {
      throw new Error('El archivo no es un backup válido de Salones Recorridos.');
    }
    const store = await tx('salones', 'readwrite');
    if (modo === 'replace') {
      await reqToPromise(store.clear());
    }
    const existentes = modo === 'merge'
      ? new Set((await reqToPromise(store.getAll())).map(s => `${s.nombre}|${s.creadoEn}`))
      : new Set();
    for (const s of json.salones) {
      const key = `${s.nombre}|${s.creadoEn}`;
      if (modo === 'merge' && existentes.has(key)) continue;
      const copia = { ...s };
      delete copia.id;
      await reqToPromise(store.add(copia));
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
    getUsuarioActual, setUsuarioActual, getUsuariosRecientes,
    exportarTodo, importarTodo
  };
})();
