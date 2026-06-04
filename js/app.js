/* ============================================================
   app.js — Lógica de UI de Salones Recorridos
   ============================================================ */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- Estado ----------
  let usuario = null;
  let cache = [];               // todos los salones
  let detalleId = null;         // id del salón en vista detalle
  let filtroTexto = '';
  let filtroCalif = '';
  let mapa = null;              // instancia Leaflet
  let mapaCapaPines = null;
  let fotoActualBlob = null;    // blob de la foto del salón en edición
  let fotoMarcadaParaQuitar = false;
  let cacheThumbs = {};         // salonId -> object URL del thumb
  let dirTimer = null;          // debounce autocomplete

  // ---------- Inicio ----------
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    aplicarTemaGuardado();
    registrarSW();

    usuario = await KlenoDB.getUsuarioActual();
    if (!usuario) {
      await renderOnboarding();
    } else {
      await iniciarApp();
    }

    bindGlobal();
  }

  function registrarSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* silencio */ });
    }
  }

  function aplicarTemaGuardado() {
    const dark = localStorage.getItem('kleno-dark') === '1';
    document.body.classList.toggle('dark', dark);
  }

  // ---------- Onboarding ----------
  async function renderOnboarding() {
    $('#onboarding').classList.remove('hidden');
    $('#app').classList.add('hidden');

    const recientes = await KlenoDB.getUsuariosRecientes();
    const cont = $('#usuarios-recientes');
    cont.innerHTML = '';
    recientes.forEach(u => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-usuario';
      chip.textContent = u;
      chip.onclick = () => seleccionarUsuario(u);
      cont.appendChild(chip);
    });

    $('#form-usuario').onsubmit = (e) => {
      e.preventDefault();
      const valor = $('#input-usuario').value.trim();
      if (valor) seleccionarUsuario(valor);
    };
  }

  async function seleccionarUsuario(u) {
    await KlenoDB.setUsuarioActual(u);
    usuario = u;
    $('#onboarding').classList.add('hidden');
    await iniciarApp();
  }

  // ---------- App principal ----------
  async function iniciarApp() {
    $('#app').classList.remove('hidden');
    $('#menu-usuario-actual').textContent = usuario;
    await recargarLista();
    // Estado inicial de history
    history.replaceState({ vista: 'lista' }, '');
    mostrarVista('lista', { sinHistory: true });
    // Escuchar el botón atrás del celular
    window.removeEventListener('popstate', manejarBack);
    window.addEventListener('popstate', manejarBack);
  }

  async function recargarLista() {
    // liberar object URLs viejos
    Object.values(cacheThumbs).forEach(URL.revokeObjectURL);
    cacheThumbs = {};
    cache = await KlenoDB.listarSalones();
    // precargar thumbs de fotos
    for (const s of cache) {
      const blob = await KlenoDB.obtenerFoto(s.id);
      if (blob) cacheThumbs[s.id] = URL.createObjectURL(blob);
    }
    renderLista();
  }

  function renderLista() {
    const lista = cache.filter(s => {
      if (filtroCalif === 'pendiente') {
        if (s.calificacion !== 'pendiente') return false;
      } else if (filtroCalif && String(s.calificacion) !== filtroCalif) {
        return false;
      }
      if (filtroTexto) {
        const t = filtroTexto.toLowerCase();
        const blob = [
          s.nombre, s.direccion, s.persona, s.rol, s.observaciones,
          s.whatsapp, s.email, s.cargadoPor
        ].filter(Boolean).join(' ').toLowerCase();
        if (!blob.includes(t)) return false;
      }
      return true;
    });

    const cont = $('#lista-salones');
    cont.innerHTML = '';

    if (cache.length === 0) {
      $('#lista-vacia').classList.remove('hidden');
      $('#resumen-lista').textContent = '';
      return;
    }
    $('#lista-vacia').classList.add('hidden');

    $('#resumen-lista').textContent =
      `${lista.length} salón${lista.length === 1 ? '' : 'es'}` +
      (lista.length !== cache.length ? ` de ${cache.length}` : '');

    if (lista.length === 0) {
      cont.innerHTML = '<p class="muted" style="text-align:center;padding:2rem">Sin resultados con esos filtros.</p>';
      return;
    }

    lista.forEach(s => {
      const card = document.createElement('div');
      const esPendiente = s.calificacion === 'pendiente';
      card.className = 'salon-card' + (esPendiente ? ' pendiente' : '');
      card.onclick = () => abrirDetalle(s.id);
      const thumb = cacheThumbs[s.id];
      const indicador = esPendiente
        ? `<span class="badge-pendiente">⏳ Pendiente</span>`
        : `<span class="estrellas">${estrellas(s.calificacion)}</span>`;
      card.innerHTML = `
        <div class="salon-card-row">
          ${thumb ? `<img class="salon-card-thumb" src="${thumb}" alt="" />` : ''}
          <div class="salon-card-info">
            <h3>
              <span>${escapeHtml(s.nombre)}</span>
              ${indicador}
            </h3>
            <div class="meta">
              ${s.persona ? `<span>👤 ${escapeHtml(s.persona)}${s.rol ? ' · ' + escapeHtml(s.rol) : ''}</span>` : ''}
              ${s.direccion ? `<span>📍 ${escapeHtml(s.direccion)}</span>` : ''}
            </div>
            <div class="fecha">${formatearFecha(s.creadoEn)} · por ${escapeHtml(s.cargadoPor || '—')}</div>
          </div>
        </div>
      `;
      cont.appendChild(card);
    });
  }

  // ---------- Detalle ----------
  async function abrirDetalle(id) {
    const s = await KlenoDB.obtenerSalon(id);
    if (!s) { toast('Salón no encontrado'); return; }
    detalleId = s.id;

    $('#detalle-titulo').textContent = s.nombre;
    const body = $('#detalle-body');

    const wa = limpiarTel(s.whatsapp);
    const mailHref = s.email ? `mailto:${s.email}` : null;
    const mapsHref = (s.lat != null && s.lng != null)
      ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
      : (s.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}` : null);
    const waHref = wa ? `https://wa.me/${wa}` : null;

    // Foto
    let fotoHtml = '';
    const blob = await KlenoDB.obtenerFoto(s.id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      fotoHtml = `<div class="detalle-foto" id="detalle-foto"><img src="${url}" alt="Foto del salón" data-foto-url="${url}" /></div>`;
    }

    const esPendiente = s.calificacion === 'pendiente';
    body.innerHTML = `
      ${fotoHtml}
      ${esPendiente ? '<div class="detalle-pendiente">⏳ PENDIENTE — Volver a pasar</div>' : ''}
      <div class="detalle-acciones-rapidas">
        <a class="accion-rapida ${waHref ? '' : 'disabled'}" ${waHref ? `href="${waHref}" target="_blank" rel="noopener"` : ''}>
          <span class="ico">💬</span>WhatsApp
        </a>
        <a class="accion-rapida ${mailHref ? '' : 'disabled'}" ${mailHref ? `href="${mailHref}"` : ''}>
          <span class="ico">✉️</span>Email
        </a>
        <a class="accion-rapida ${mapsHref ? '' : 'disabled'}" ${mapsHref ? `href="${mapsHref}" target="_blank" rel="noopener"` : ''}>
          <span class="ico">🗺️</span>Mapa
        </a>
      </div>

      ${esPendiente ? '' : `<div class="detalle-campo">
        <div class="label">Ganas de incorporar la marca</div>
        <div class="detalle-estrellas">${estrellas(s.calificacion)}</div>
      </div>`}

      ${campoTexto('Persona que atendió', s.persona && `${s.persona}${s.rol ? ' (' + s.rol + ')' : ''}`)}
      ${campoTexto('Dirección', s.direccion)}
      ${campoLink('WhatsApp', s.whatsapp, waHref)}
      ${campoLink('Email', s.email, mailHref)}
      ${campoTexto('Ubicación GPS', (s.lat != null && s.lng != null) ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : null)}
      ${campoTexto('Observaciones', s.observaciones)}
      ${campoTexto('Cargado por', s.cargadoPor)}
      ${campoTexto('Fecha de visita', formatearFecha(s.creadoEn))}
    `;

    // Click en foto -> lightbox
    const fotoEl = $('#detalle-foto');
    if (fotoEl) fotoEl.onclick = () => abrirLightbox(fotoEl.querySelector('img').src);

    mostrarVista('detalle');
  }

  function abrirLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="" />`;
    // El click solo dispara back; manejarBack remueve el lb y devuelve el state.
    lb.onclick = () => history.back();
    document.body.appendChild(lb);
    history.pushState({ vista: 'lightbox' }, '');
  }

  function campoTexto(label, valor) {
    if (!valor) return '';
    return `<div class="detalle-campo">
      <div class="label">${label}</div>
      <div class="valor">${escapeHtml(String(valor)).replace(/\n/g, '<br>')}</div>
    </div>`;
  }
  function campoLink(label, valor, href) {
    if (!valor) return '';
    if (!href) return campoTexto(label, valor);
    return `<div class="detalle-campo">
      <div class="label">${label}</div>
      <a class="valor" href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(valor)}</a>
    </div>`;
  }

  // ---------- Form ----------
  async function abrirForm(id) {
    const form = $('#form-salon');
    form.reset();
    setRating(0);
    actualizarGeoInfo(null, null);
    cerrarSugerencias();
    fotoActualBlob = null;
    fotoMarcadaParaQuitar = false;
    mostrarFotoPreview(null);

    if (id) {
      const s = await KlenoDB.obtenerSalon(id);
      if (!s) { toast('No encontrado'); return; }
      $('#form-titulo').textContent = 'Editar salón';
      $('#f-id').value = s.id;
      $('#f-nombre').value = s.nombre || '';
      $('#f-direccion').value = s.direccion || '';
      $('#f-whatsapp').value = s.whatsapp || '';
      $('#f-email').value = s.email || '';
      $('#f-persona').value = s.persona || '';
      $('#f-rol').value = s.rol || '';
      $('#f-obs').value = s.observaciones || '';
      setRating(s.calificacion || 0);
      actualizarGeoInfo(s.lat, s.lng);
      // Cargar foto si existe
      const blob = await KlenoDB.obtenerFoto(s.id);
      if (blob) {
        mostrarFotoPreview(blob);
      }
    } else {
      $('#form-titulo').textContent = 'Nuevo salón';
      $('#f-id').value = '';
    }

    mostrarVista('form');
    setTimeout(() => $('#f-nombre').focus(), 50);
  }

  function actualizarGeoInfo(lat, lng) {
    const el = $('#geo-info');
    if (lat != null && lng != null) {
      el.textContent = `📍 Ubicación cargada: ${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
      el.dataset.lat = lat;
      el.dataset.lng = lng;
      el.classList.add('con-dato');
    } else {
      el.textContent = '';
      delete el.dataset.lat;
      delete el.dataset.lng;
      el.classList.remove('con-dato');
    }
  }

  async function guardarFormulario(e) {
    e.preventDefault();
    const calif = $('#f-calif').value === 'pendiente' ? 'pendiente' : Number($('#f-calif').value);
    if (!calif && calif !== 'pendiente') {
      toast('Tocá las estrellas o marcá "Pendiente".');
      return;
    }

    const geo = $('#geo-info').dataset;
    const data = {
      nombre: $('#f-nombre').value.trim(),
      direccion: $('#f-direccion').value.trim(),
      lat: geo.lat ? Number(geo.lat) : null,
      lng: geo.lng ? Number(geo.lng) : null,
      whatsapp: $('#f-whatsapp').value.trim(),
      email: $('#f-email').value.trim(),
      persona: $('#f-persona').value.trim(),
      rol: $('#f-rol').value,
      calificacion: calif,
      observaciones: $('#f-obs').value.trim(),
      cargadoPor: usuario
    };
    const id = $('#f-id').value;
    if (id) data.id = Number(id);

    try {
      const nuevoId = await KlenoDB.guardarSalon(data);
      const salonId = id ? Number(id) : nuevoId;
      // Foto: guardar nueva, quitar, o mantener
      if (fotoActualBlob) {
        await KlenoDB.guardarFoto(salonId, fotoActualBlob);
      } else if (fotoMarcadaParaQuitar) {
        await KlenoDB.eliminarFoto(salonId);
      }
      toast(id ? 'Guardado' : '¡Salón cargado!');
      await recargarLista();
      abrirDetalle(salonId);
    } catch (err) {
      toast('Error al guardar: ' + err.message);
    }
  }

  // ---------- Foto ----------
  function mostrarFotoPreview(blob) {
    const wrap = $('#foto-preview-wrap');
    const img = $('#foto-preview');
    if (!blob) {
      wrap.classList.add('hidden');
      img.src = '';
      return;
    }
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.dataset.url = url;
    wrap.classList.remove('hidden');
  }

  async function onFotoElegida(file) {
    if (!file) return;
    try {
      const blob = await comprimirImagen(file, 1280, 0.82);
      fotoActualBlob = blob;
      fotoMarcadaParaQuitar = false;
      mostrarFotoPreview(blob);
      toast('Foto lista');
    } catch (err) {
      toast('No se pudo procesar la imagen');
    }
  }

  function quitarFoto() {
    fotoActualBlob = null;
    fotoMarcadaParaQuitar = true;
    mostrarFotoPreview(null);
  }

  // Redimensiona/comprime usando Canvas (mantiene proporción)
  function comprimirImagen(file, maxLado, calidad) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxLado / Math.max(width, height), 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falló')),
                      'image/jpeg', calidad);
      };
      img.onerror = reject;
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- Autocomplete dirección (Nominatim / OpenStreetMap) ----------
  // Buenos Aires + CABA viewbox aprox.
  const VIEWBOX_BA = '-60.9,-32.5,-56.7,-40.0';

  async function buscarDirecciones(query) {
    const q = query.trim();
    if (q.length < 3) return [];
    const url = 'https://nominatim.openstreetmap.org/search?format=json'
              + '&addressdetails=1&limit=6'
              + '&countrycodes=ar'
              + '&viewbox=' + VIEWBOX_BA
              + '&bounded=1'
              + '&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!r.ok) throw new Error('Error de red');
    return r.json();
  }

  function renderSugerencias(resultados) {
    const cont = $('#dir-sugerencias');
    cont.innerHTML = '';
    if (!resultados.length) {
      cont.innerHTML = '<div class="dir-sugerencias-info">Sin resultados — probá usar GPS o Google Maps.</div>';
      cont.classList.remove('hidden');
      return;
    }
    resultados.forEach(r => {
      const div = document.createElement('div');
      div.className = 'dir-sugerencia';
      const a = r.address || {};
      const calle = [a.road, a.house_number].filter(Boolean).join(' ') || r.display_name.split(',')[0];
      const resto = [a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state]
                    .filter(Boolean).join(', ');
      div.innerHTML = `
        <div class="calle">${escapeHtml(calle)}</div>
        <div class="resto">${escapeHtml(resto || '')}</div>
      `;
      div.onclick = () => seleccionarSugerencia(r);
      cont.appendChild(div);
    });
    cont.classList.remove('hidden');
  }

  function seleccionarSugerencia(r) {
    const a = r.address || {};
    const partes = [
      [a.road, a.house_number].filter(Boolean).join(' '),
      a.suburb || a.neighbourhood,
      a.city || a.town || a.village
    ].filter(Boolean);
    $('#f-direccion').value = partes.join(', ') || r.display_name;
    actualizarGeoInfo(parseFloat(r.lat), parseFloat(r.lon));
    cerrarSugerencias();
    toast('Ubicación cargada desde el mapa');
  }

  function cerrarSugerencias() {
    $('#dir-sugerencias').classList.add('hidden');
    $('#dir-sugerencias').innerHTML = '';
  }

  function onDireccionInput(e) {
    clearTimeout(dirTimer);
    const q = e.target.value;
    if (q.length < 3) { cerrarSugerencias(); return; }
    dirTimer = setTimeout(async () => {
      try {
        const resultados = await buscarDirecciones(q);
        // Si el usuario siguió escribiendo, no muestres resultados viejos
        if ($('#f-direccion').value !== q) return;
        renderSugerencias(resultados);
      } catch {
        // silencio: si no hay red, no rompe nada
      }
    }, 450);
  }

  // ---------- Google Maps: buscar + pegar link ----------
  function buscarEnGoogleMaps() {
    const nombre = $('#f-nombre').value.trim();
    const dir = $('#f-direccion').value.trim();
    const q = [nombre, dir, 'Buenos Aires'].filter(Boolean).join(', ');
    if (!q) { toast('Escribí primero el nombre del salón.'); return; }
    const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    window.open(url, '_blank', 'noopener');
    toast('Buscá el salón en Google Maps, tocá "Compartir → Copiar enlace" y volvé.');
  }

  async function pegarLinkGoogleMaps() {
    let texto = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        texto = await navigator.clipboard.readText();
      }
    } catch { /* permiso denegado */ }
    if (!texto) {
      texto = prompt('Pegá acá el link de Google Maps que copiaste:') || '';
    }
    texto = texto.trim();
    if (!texto) return;
    const datos = parsearLinkGoogleMaps(texto);
    if (!datos) {
      toast('No reconocí el link. Intentá copiar desde Google Maps → Compartir → Copiar enlace.');
      return;
    }
    if (datos.lat != null) actualizarGeoInfo(datos.lat, datos.lng);
    if (datos.nombre && !$('#f-nombre').value.trim()) {
      $('#f-nombre').value = datos.nombre;
    }
    if (datos.direccion && !$('#f-direccion').value.trim()) {
      $('#f-direccion').value = datos.direccion;
    }
    // Si vino link corto sin coords, sigamos pidiendo al usuario
    if (datos.necesitaAbrir) {
      toast('Es un link corto — abriendo Google Maps para resolverlo.');
      window.open(texto, '_blank', 'noopener');
    } else {
      toast('Datos importados de Google Maps');
    }
  }

  function parsearLinkGoogleMaps(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace('www.', '');
      if (!/google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl/.test(host)) return null;

      // Link corto -> no podemos extraer coords sin seguirlo (CORS bloquea el fetch).
      if (host === 'maps.app.goo.gl' || host === 'goo.gl') {
        return { necesitaAbrir: true };
      }

      // Patrón largo típico:
      //   /maps/place/Nombre+del+local/@-34.563,-58.45,17z/data=...
      const pathParts = u.pathname.split('/').filter(Boolean);
      let nombre = null, direccion = null, lat = null, lng = null;

      const placeIdx = pathParts.indexOf('place');
      if (placeIdx >= 0 && pathParts[placeIdx + 1]) {
        nombre = decodeURIComponent(pathParts[placeIdx + 1].replace(/\+/g, ' '));
      }

      // Coords pueden estar en @lat,lng,zoom o en !3dlat!4dlng en data=
      const atMatch = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (atMatch) {
        lat = parseFloat(atMatch[1]);
        lng = parseFloat(atMatch[2]);
      }
      const dataMatch = u.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (dataMatch) {
        lat = parseFloat(dataMatch[1]);
        lng = parseFloat(dataMatch[2]);
      }

      // ?q=lat,lng o ?query=lat,lng (formato api=1)
      const q = u.searchParams.get('q') || u.searchParams.get('query');
      if (q) {
        const m = q.match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
        if (m && lat == null) {
          lat = parseFloat(m[1]);
          lng = parseFloat(m[2]);
        } else if (!nombre && !m) {
          nombre = q;
        }
      }

      if (lat == null && !nombre) return null;
      return { nombre, direccion, lat, lng };
    } catch {
      return null;
    }
  }

  // ---------- Rating ----------
  function setRating(v) {
    // v puede ser 0 (sin calificar), 1-5, o 'pendiente'
    const esPendiente = v === 'pendiente';
    $('#f-calif').value = esPendiente ? 'pendiente' : (v || '');
    $$('#rating button').forEach(b => {
      b.classList.toggle('on', !esPendiente && Number(b.dataset.v) <= v);
    });
    $('#btn-pendiente').classList.toggle('activo', esPendiente);
    const labels = ['Tocá las estrellas o marcá pendiente', '⭐ Nada', '⭐⭐ Poco interés', '⭐⭐⭐ Tibio', '⭐⭐⭐⭐ Interesado', '⭐⭐⭐⭐⭐ Muy interesado'];
    $('#rating-label').textContent = esPendiente ? '⏳ Marcado como pendiente — volver a pasar' : (labels[v] || labels[0]);
  }
  function marcarPendiente() {
    setRating('pendiente');
  }

  // ---------- Geolocalización ----------
  function capturarGeo() {
    if (!navigator.geolocation) {
      toast('Este dispositivo no permite ubicación.');
      return;
    }
    $('#geo-info').textContent = 'Obteniendo ubicación...';
    $('#geo-info').classList.remove('con-dato');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        actualizarGeoInfo(latitude, longitude);
        toast('Ubicación GPS capturada');
      },
      (err) => {
        $('#geo-info').textContent = 'No se pudo obtener la ubicación.';
        toast(err.message || 'Permiso denegado');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  // ---------- Eliminar ----------
  async function eliminarActual() {
    if (!detalleId) return;
    if (!confirm('¿Eliminar este salón? No se puede deshacer.')) return;
    await KlenoDB.eliminarSalon(detalleId);
    toast('Eliminado');
    detalleId = null;
    await recargarLista();
    mostrarVista('lista');
  }

  // ---------- Mapa ----------
  function colorCalif(c) {
    if (c === 'pendiente') return '#8a92a0';
    return ({1:'#c0392b',2:'#e67e22',3:'#f0ad4e',4:'#73c285',5:'#1e8449'})[c] || '#888';
  }

  function pinIcon(c) {
    const color = colorCalif(c);
    return L.divIcon({
      className: '',
      html: `<div class="mapa-pin" style="background:${color}"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 22],
      popupAnchor: [0, -20]
    });
  }

  function renderMapa() {
    if (typeof L === 'undefined') {
      $('#mapa').innerHTML = '<p class="muted" style="padding:2rem;text-align:center">Mapa no disponible sin conexión la primera vez.</p>';
      return;
    }
    if (!mapa) {
      mapa = L.map('mapa', { zoomControl: true }).setView([-34.6037, -58.3816], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(mapa);
      mapaCapaPines = L.layerGroup().addTo(mapa);
    } else {
      mapaCapaPines.clearLayers();
    }

    const conCoords = cache.filter(s => s.lat != null && s.lng != null);
    $('#mapa-sin-coords').classList.toggle('hidden', conCoords.length > 0);

    if (conCoords.length === 0) {
      setTimeout(() => mapa.invalidateSize(), 50);
      return;
    }

    const bounds = [];
    conCoords.forEach(s => {
      const m = L.marker([s.lat, s.lng], { icon: pinIcon(s.calificacion) });
      const wa = limpiarTel(s.whatsapp);
      const waLink = wa ? `<a class="mapa-popup-link" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : '';
      const marca = s.calificacion === 'pendiente'
        ? '<div class="mapa-popup-estrellas">⏳ Pendiente</div>'
        : `<div class="mapa-popup-estrellas">${estrellas(s.calificacion)}</div>`;
      m.bindPopup(`
        <div class="mapa-popup-titulo">${escapeHtml(s.nombre)}</div>
        ${marca}
        <div class="mapa-popup-meta">${s.persona ? escapeHtml(s.persona) : ''}${s.rol ? ' · ' + escapeHtml(s.rol) : ''}</div>
        ${s.direccion ? `<div class="mapa-popup-meta">${escapeHtml(s.direccion)}</div>` : ''}
        <a class="mapa-popup-link" href="#" data-salon-id="${s.id}">Ver detalle</a>
        ${waLink}
      `);
      m.addTo(mapaCapaPines);
      bounds.push([s.lat, s.lng]);
    });

    // listener para los links "Ver detalle" dentro de popups
    mapa.off('popupopen').on('popupopen', (e) => {
      const link = e.popup.getElement().querySelector('[data-salon-id]');
      if (link) link.onclick = (ev) => {
        ev.preventDefault();
        abrirDetalle(Number(link.dataset.salonId));
      };
    });

    if (bounds.length === 1) {
      mapa.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      mapa.fitBounds(bounds, { padding: [30, 30] });
    }
    setTimeout(() => mapa.invalidateSize(), 50);
  }

  // ---------- Export Excel ----------
  function exportarExcel() {
    if (!cache.length) { toast('No hay salones cargados.'); return; }
    if (typeof XLSX === 'undefined') { toast('Falta la librería Excel (sin conexión).'); return; }

    const filas = cache.map(s => ({
      'Salón': s.nombre,
      'Calificación': s.calificacion === 'pendiente' ? 'Pendiente' : s.calificacion,
      'Interés': nivelInteres(s.calificacion),
      'Persona': s.persona || '',
      'Rol': s.rol || '',
      'WhatsApp': s.whatsapp || '',
      'Email': s.email || '',
      'Dirección': s.direccion || '',
      'Latitud': s.lat ?? '',
      'Longitud': s.lng ?? '',
      'Google Maps': (s.lat != null && s.lng != null)
        ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}` : '',
      'Observaciones': s.observaciones || '',
      'Cargado por': s.cargadoPor || '',
      'Fecha visita': s.creadoEn ? new Date(s.creadoEn).toLocaleString('es-AR') : ''
    }));

    const wb = XLSX.utils.book_new();

    // Hoja 1: todos
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [
      { wch: 28 }, { wch: 11 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
      { wch: 16 }, { wch: 26 }, { wch: 32 }, { wch: 11 }, { wch: 11 },
      { wch: 38 }, { wch: 50 }, { wch: 16 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Todos');

    // Hojas filtradas por interés
    const grupos = [
      ['Pendientes',            f => f.Calificación === 'Pendiente'],
      ['Muy interesados (5⭐)', f => f.Calificación === 5],
      ['Interesados (4⭐)',     f => f.Calificación === 4],
      ['Tibios (3⭐)',          f => f.Calificación === 3],
      ['Sin interés (1-2⭐)',   f => typeof f.Calificación === 'number' && f.Calificación <= 2]
    ];
    grupos.forEach(([nombre, fn]) => {
      const sub = filas.filter(fn);
      if (sub.length) {
        const wsf = XLSX.utils.json_to_sheet(sub);
        wsf['!cols'] = ws['!cols'];
        XLSX.utils.book_append_sheet(wb, wsf, nombre.substring(0, 31));
      }
    });

    // Resumen
    const resumen = [5,4,3,2,1].map(n => ({
      'Calificación': `${n}⭐`,
      'Interés': nivelInteres(n),
      'Cantidad': cache.filter(s => s.calificacion === n).length
    }));
    resumen.push({
      'Calificación': '⏳',
      'Interés': 'Pendiente',
      'Cantidad': cache.filter(s => s.calificacion === 'pendiente').length
    });
    resumen.push({ 'Calificación': 'TOTAL', 'Interés': '', 'Cantidad': cache.length });
    const wsr = XLSX.utils.json_to_sheet(resumen);
    wsr['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsr, 'Resumen');

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `salones-kleno-${fecha}.xlsx`);
    toast(`Excel descargado (${cache.length} salones)`);
  }

  function nivelInteres(c) {
    if (c === 'pendiente') return 'Pendiente (volver a pasar)';
    return ({5:'Muy interesado',4:'Interesado',3:'Tibio',2:'Poco interés',1:'Nada'})[c] || '—';
  }

  // ---------- Export KML (Google My Maps) ----------
  function exportarKML() {
    const conCoords = cache.filter(s => s.lat != null && s.lng != null);
    if (!conCoords.length) {
      toast('No hay salones con ubicación GPS para exportar.');
      return;
    }

    const colores = { 1:'ff2b39c0', 2:'ff227ee6', 3:'ff4eadf0', 4:'ff85c273', 5:'ff49841e' };
    const estilos = Object.entries(colores).map(([n, c]) => `
    <Style id="cal${n}">
      <IconStyle>
        <color>${c}</color>
        <scale>1.1</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/paddle/${n}.png</href></Icon>
      </IconStyle>
    </Style>`).join('') + `
    <Style id="calpendiente">
      <IconStyle>
        <color>ffa0a0a0</color>
        <scale>1.1</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>
      </IconStyle>
    </Style>`;

    const placemarks = conCoords.map(s => {
      const esPend = s.calificacion === 'pendiente';
      const desc = [
        s.persona ? `Atendió: ${s.persona}${s.rol ? ' (' + s.rol + ')' : ''}` : '',
        esPend ? 'Estado: ⏳ Pendiente (volver a pasar)'
               : `Calificación: ${s.calificacion}/5 — ${nivelInteres(s.calificacion)}`,
        s.whatsapp ? `WhatsApp: ${s.whatsapp}` : '',
        s.email ? `Email: ${s.email}` : '',
        s.direccion ? `Dirección: ${s.direccion}` : '',
        s.observaciones ? `Observaciones: ${s.observaciones}` : '',
        `Cargado por: ${s.cargadoPor || '—'} el ${new Date(s.creadoEn).toLocaleDateString('es-AR')}`
      ].filter(Boolean).join('\n');
      const sufijo = esPend ? '(⏳ Pendiente)' : `(${s.calificacion}⭐)`;
      return `
    <Placemark>
      <name>${escapeXml(s.nombre)} ${sufijo}</name>
      <description><![CDATA[${escapeHtml(desc).replace(/\n/g, '<br>')}]]></description>
      <styleUrl>#cal${s.calificacion}</styleUrl>
      <Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>
    </Placemark>`;
    }).join('');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Salones Recorridos — Kleno</name>
    <description>Exportado el ${new Date().toLocaleString('es-AR')}</description>${estilos}${placemarks}
  </Document>
</kml>`;

    descargarArchivo(`salones-kleno-${new Date().toISOString().slice(0,10)}.kml`,
                     kml, 'application/vnd.google-earth.kml+xml');
    toast(`KML descargado (${conCoords.length} salones con GPS)`);
  }

  function descargarArchivo(nombre, contenido, mime) {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, c => ({
      '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'
    }[c]));
  }

  // ---------- Export / Import ----------
  async function exportar() {
    const data = await KlenoDB.exportarTodo();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `salones-kleno-${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup descargado');
  }

  async function importar(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const modo = confirm(
        'IMPORTAR\n\n' +
        'Aceptar = AGREGAR a los salones actuales (sin duplicar).\n' +
        'Cancelar = REEMPLAZAR todo por el contenido del backup.'
      ) ? 'merge' : 'replace';
      const n = await KlenoDB.importarTodo(json, modo);
      toast(`${n} salones importados (${modo === 'merge' ? 'agregados' : 'reemplazados'})`);
      await recargarLista();
      mostrarVista('lista');
    } catch (err) {
      toast('Error: ' + err.message);
    }
  }

  // ---------- Vistas / navegación ----------
  // Vista actual y "anclas" de history para que el botón atrás funcione bien.
  // Política simple:
  //  - Desde cualquier vista (detalle/form/mapa/acerca) -> back vuelve a LISTA.
  //  - Desde lista -> primer back avisa "Tocá de nuevo para salir", segundo cierra.
  //  - Lightbox/menú/sugerencias = overlays: back primero los cierra.
  let vistaActual = 'lista';
  let avisoSalirTs = 0; // timestamp del último aviso para doble tap

  function mostrarVista(nombre, opciones = {}) {
    $('#menu').classList.add('hidden');
    ['lista', 'mapa', 'detalle', 'form', 'acerca'].forEach(v => {
      $(`#vista-${v}`).classList.toggle('hidden', v !== nombre);
    });
    window.scrollTo(0, 0);
    if (nombre === 'mapa') renderMapa();
    vistaActual = nombre;

    if (opciones.sinHistory) return;
    // Cuando salimos de la lista hacia otra vista, agregamos un state extra
    // (el back va a consumirlo y nos devuelve a la lista).
    if (nombre !== 'lista') {
      history.pushState({ vista: nombre }, '');
    }
  }

  function manejarBack() {
    // 1) Overlays primero (no afectan navegación principal)
    const lb = document.querySelector('.lightbox');
    if (lb) { lb.remove(); history.pushState({ vista: vistaActual }, ''); return; }
    if (!$('#menu').classList.contains('hidden')) {
      $('#menu').classList.add('hidden');
      history.pushState({ vista: vistaActual }, '');
      return;
    }
    if (!$('#dir-sugerencias').classList.contains('hidden')) {
      cerrarSugerencias();
      history.pushState({ vista: vistaActual }, '');
      return;
    }

    // 2) Estamos en alguna vista que NO es lista -> ir a lista (sin importar
    // de dónde venga). Esto es lo que pidió el usuario: el back te lleva a
    // inicio, no a la pantalla previa.
    if (vistaActual !== 'lista') {
      mostrarVista('lista', { sinHistory: true });
      return;
    }

    // 3) Estamos en lista -> doble tap para salir.
    const ahora = Date.now();
    if (avisoSalirTs && (ahora - avisoSalirTs) < 2000) {
      // Salir: dejar pasar el back (no re-push). Android cierra/minimiza la PWA.
      avisoSalirTs = 0;
      return;
    }
    avisoSalirTs = ahora;
    toast('Tocá atrás de nuevo para salir');
    // Re-anclar el history para que el próximo back se reciba acá
    history.pushState({ vista: 'lista' }, '');
  }

  // ---------- Menú ----------
  function abrirMenu() {
    $('#menu').classList.toggle('hidden');
  }

  async function accionMenu(action) {
    $('#menu').classList.add('hidden');
    switch (action) {
      case 'ver-mapa': mostrarVista('mapa'); break;
      case 'ver-lista': mostrarVista('lista'); break;
      case 'export-excel': exportarExcel(); break;
      case 'export-kml': exportarKML(); break;
      case 'cambiar-usuario':
        await KlenoDB.setUsuarioActual(null);
        usuario = null;
        $('#app').classList.add('hidden');
        await renderOnboarding();
        break;
      case 'exportar': await exportar(); break;
      case 'importar': $('#input-import').click(); break;
      case 'dark':
        document.body.classList.toggle('dark');
        localStorage.setItem('kleno-dark', document.body.classList.contains('dark') ? '1' : '0');
        if (mapa) setTimeout(() => mapa.invalidateSize(), 50);
        break;
      case 'acerca': mostrarVista('acerca'); break;
    }
  }

  // ---------- Bindings globales ----------
  function bindGlobal() {
    $('#btn-menu').onclick = abrirMenu;

    // Click en el logo del topbar -> volver a la lista (pantalla de inicio)
    document.querySelector('.topbar-left').onclick = () => {
      if (vistaActual === 'lista') return;
      mostrarVista('lista');
      history.replaceState({ vista: 'lista' }, '');
    };
    $$('#menu button[data-action]').forEach(b => {
      b.onclick = () => accionMenu(b.dataset.action);
    });
    $('#input-import').onchange = (e) => {
      const f = e.target.files[0];
      if (f) importar(f);
      e.target.value = '';
    };

    $('#fab-nuevo').onclick = () => abrirForm(null);
    $('#btn-editar').onclick = () => abrirForm(detalleId);
    $('#btn-eliminar').onclick = eliminarActual;

    $$('[data-back]').forEach(b => b.onclick = () => history.back());

    $('#input-buscar').oninput = (e) => { filtroTexto = e.target.value; renderLista(); };
    $('#filtro-calif').onchange = (e) => { filtroCalif = e.target.value; renderLista(); };

    $$('#rating button').forEach(b => {
      b.onclick = () => setRating(Number(b.dataset.v));
    });
    $('#btn-pendiente').onclick = marcarPendiente;

    $('#btn-geo').onclick = capturarGeo;
    $('#btn-buscar-gmaps').onclick = buscarEnGoogleMaps;
    $('#btn-pegar-gmaps').onclick = pegarLinkGoogleMaps;

    // Foto
    $('#btn-foto-camara').onclick = () => $('#input-foto-camara').click();
    $('#btn-foto-galeria').onclick = () => $('#input-foto-galeria').click();
    $('#input-foto-camara').onchange = (e) => { onFotoElegida(e.target.files[0]); e.target.value = ''; };
    $('#input-foto-galeria').onchange = (e) => { onFotoElegida(e.target.files[0]); e.target.value = ''; };
    $('#btn-quitar-foto').onclick = quitarFoto;

    // Autocomplete dirección
    $('#f-direccion').addEventListener('input', onDireccionInput);
    $('#f-direccion').addEventListener('blur', () => {
      // pequeño delay para permitir click en sugerencia
      setTimeout(cerrarSugerencias, 200);
    });

    $('#form-salon').onsubmit = guardarFormulario;

    // cerrar menú al tocar fuera
    document.addEventListener('click', (e) => {
      const menu = $('#menu');
      if (!menu.classList.contains('hidden') &&
          !menu.contains(e.target) &&
          e.target.id !== 'btn-menu') {
        menu.classList.add('hidden');
      }
    });
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function estrellas(n) {
    if (n === 'pendiente') return '';
    n = Number(n) || 0;
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }
  function formatearFecha(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function limpiarTel(t) {
    if (!t) return '';
    let n = t.replace(/[^\d+]/g, '');
    if (n.startsWith('+')) n = n.slice(1);
    if (n.startsWith('00')) n = n.slice(2);
    // si no empieza con código de país, asumo Argentina (54) sin el 9 móvil
    if (n.length >= 8 && n.length <= 11 && !n.startsWith('54')) {
      n = '54' + n;
    }
    return n;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
  }
})();
