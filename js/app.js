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
    mostrarVista('lista');
  }

  async function recargarLista() {
    cache = await KlenoDB.listarSalones();
    renderLista();
  }

  function renderLista() {
    const lista = cache.filter(s => {
      if (filtroCalif && String(s.calificacion) !== filtroCalif) return false;
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
      card.className = 'salon-card';
      card.onclick = () => abrirDetalle(s.id);
      card.innerHTML = `
        <h3>
          <span>${escapeHtml(s.nombre)}</span>
          <span class="estrellas">${estrellas(s.calificacion)}</span>
        </h3>
        <div class="meta">
          ${s.persona ? `<span>👤 ${escapeHtml(s.persona)}${s.rol ? ' · ' + escapeHtml(s.rol) : ''}</span>` : ''}
          ${s.direccion ? `<span>📍 ${escapeHtml(s.direccion)}</span>` : ''}
        </div>
        <div class="fecha">${formatearFecha(s.creadoEn)} · por ${escapeHtml(s.cargadoPor || '—')}</div>
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

    body.innerHTML = `
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

      <div class="detalle-campo">
        <div class="label">Ganas de incorporar la marca</div>
        <div class="detalle-estrellas">${estrellas(s.calificacion)}</div>
      </div>

      ${campoTexto('Persona que atendió', s.persona && `${s.persona}${s.rol ? ' (' + s.rol + ')' : ''}`)}
      ${campoTexto('Dirección / Barrio', s.direccion)}
      ${campoLink('WhatsApp', s.whatsapp, waHref)}
      ${campoLink('Email', s.email, mailHref)}
      ${campoTexto('Ubicación GPS', (s.lat != null && s.lng != null) ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : null)}
      ${campoTexto('Observaciones', s.observaciones)}
      ${campoTexto('Cargado por', s.cargadoPor)}
      ${campoTexto('Fecha de visita', formatearFecha(s.creadoEn))}
    `;

    mostrarVista('detalle');
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
    $('#geo-info').textContent = '';

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
      if (s.lat != null && s.lng != null) {
        $('#geo-info').textContent = `📍 ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
        $('#geo-info').dataset.lat = s.lat;
        $('#geo-info').dataset.lng = s.lng;
      } else {
        delete $('#geo-info').dataset.lat;
        delete $('#geo-info').dataset.lng;
      }
    } else {
      $('#form-titulo').textContent = 'Nuevo salón';
      $('#f-id').value = '';
      delete $('#geo-info').dataset.lat;
      delete $('#geo-info').dataset.lng;
    }

    mostrarVista('form');
    setTimeout(() => $('#f-nombre').focus(), 50);
  }

  async function guardarFormulario(e) {
    e.preventDefault();
    const calif = Number($('#f-calif').value);
    if (!calif) { toast('Tocá las estrellas para calificar.'); return; }

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
      toast(id ? 'Guardado' : '¡Salón cargado!');
      await recargarLista();
      abrirDetalle(id ? Number(id) : nuevoId);
    } catch (err) {
      toast('Error al guardar: ' + err.message);
    }
  }

  // ---------- Rating ----------
  function setRating(v) {
    $('#f-calif').value = v || '';
    $$('#rating button').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.v) <= v);
    });
    const labels = ['Tocá las estrellas', '⭐ Nada', '⭐⭐ Poco interés', '⭐⭐⭐ Tibio', '⭐⭐⭐⭐ Interesado', '⭐⭐⭐⭐⭐ Muy interesado'];
    $('#rating-label').textContent = labels[v] || labels[0];
  }

  // ---------- Geolocalización ----------
  function capturarGeo() {
    if (!navigator.geolocation) {
      toast('Este dispositivo no permite ubicación.');
      return;
    }
    $('#geo-info').textContent = 'Obteniendo ubicación...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        $('#geo-info').textContent = `📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        $('#geo-info').dataset.lat = latitude;
        $('#geo-info').dataset.lng = longitude;
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
      m.bindPopup(`
        <div class="mapa-popup-titulo">${escapeHtml(s.nombre)}</div>
        <div class="mapa-popup-estrellas">${estrellas(s.calificacion)}</div>
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
      'Calificación': s.calificacion,
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
      ['Muy interesados (5⭐)', f => f.Calificación === 5],
      ['Interesados (4⭐)',     f => f.Calificación === 4],
      ['Tibios (3⭐)',          f => f.Calificación === 3],
      ['Sin interés (1-2⭐)',   f => f.Calificación <= 2]
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
    resumen.push({ 'Calificación': 'TOTAL', 'Interés': '', 'Cantidad': cache.length });
    const wsr = XLSX.utils.json_to_sheet(resumen);
    wsr['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsr, 'Resumen');

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `salones-kleno-${fecha}.xlsx`);
    toast(`Excel descargado (${cache.length} salones)`);
  }

  function nivelInteres(c) {
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
    </Style>`).join('');

    const placemarks = conCoords.map(s => {
      const desc = [
        s.persona ? `Atendió: ${s.persona}${s.rol ? ' (' + s.rol + ')' : ''}` : '',
        `Calificación: ${s.calificacion}/5 — ${nivelInteres(s.calificacion)}`,
        s.whatsapp ? `WhatsApp: ${s.whatsapp}` : '',
        s.email ? `Email: ${s.email}` : '',
        s.direccion ? `Dirección: ${s.direccion}` : '',
        s.observaciones ? `Observaciones: ${s.observaciones}` : '',
        `Cargado por: ${s.cargadoPor || '—'} el ${new Date(s.creadoEn).toLocaleDateString('es-AR')}`
      ].filter(Boolean).join('\n');
      return `
    <Placemark>
      <name>${escapeXml(s.nombre)} (${s.calificacion}⭐)</name>
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
  function mostrarVista(nombre) {
    $('#menu').classList.add('hidden');
    ['lista', 'mapa', 'detalle', 'form', 'acerca'].forEach(v => {
      $(`#vista-${v}`).classList.toggle('hidden', v !== nombre);
    });
    window.scrollTo(0, 0);
    if (nombre === 'mapa') renderMapa();
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

    $$('[data-back]').forEach(b => b.onclick = () => mostrarVista('lista'));

    $('#input-buscar').oninput = (e) => { filtroTexto = e.target.value; renderLista(); };
    $('#filtro-calif').onchange = (e) => { filtroCalif = e.target.value; renderLista(); };

    $$('#rating button').forEach(b => {
      b.onclick = () => setRating(Number(b.dataset.v));
    });

    $('#btn-geo').onclick = capturarGeo;
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
