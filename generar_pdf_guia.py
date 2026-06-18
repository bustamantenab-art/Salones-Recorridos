"""
Genera un PDF guía rápida para WhatsApp de "Salones Recorridos — Kleno".
Estilo: branding Kleno (negro + amarillo). 5 páginas concisas.

Salida: guia-salones-recorridos.pdf
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

AQUI = Path(__file__).parent
LOGO = AQUI / "icons" / "logo-kleno-pro.png.JPG"
SALIDA = AQUI / "guia-salones-recorridos.pdf"
URL_APP = "bustamantenab-art.github.io/Salones-Recorridos"

# Colores Kleno
KLENO = HexColor("#FFC107")
KLENO_DARK = HexColor("#D39E00")
NEGRO = HexColor("#1A1D23")
GRIS_OSC = HexColor("#454A52")
GRIS = HexColor("#6C7280")
GRIS_CLARO = HexColor("#F1F3F5")
VERDE = HexColor("#1E8449")
ROJO = HexColor("#C0392B")

# Registrar fuentes del sistema (Windows). Usamos Segoe UI para texto y
# Segoe UI Symbol como "fallback" para emojis (📍 🔍 ⏳ etc.) que Segoe UI
# no contiene.
try:
    pdfmetrics.registerFont(TTFont("KlenoSans",     "C:/Windows/Fonts/segoeui.ttf"))
    pdfmetrics.registerFont(TTFont("KlenoSansBold", "C:/Windows/Fonts/segoeuib.ttf"))
    pdfmetrics.registerFont(TTFont("KlenoSansSemi", "C:/Windows/Fonts/segoeuisl.ttf"))
    pdfmetrics.registerFont(TTFont("KlenoSym",      "C:/Windows/Fonts/seguisym.ttf"))
    FONT = "KlenoSans"
    FONT_B = "KlenoSansBold"
    FONT_SB = "KlenoSansSemi"
    FONT_SYM = "KlenoSym"
except Exception as e:
    print(f"No se pudieron cargar Segoe UI ({e}). Uso Helvetica.")
    FONT = "Helvetica"
    FONT_B = "Helvetica-Bold"
    FONT_SB = "Helvetica-Bold"
    FONT_SYM = "Helvetica"

import re
# Detecta cualquier carácter no-BMP o de los rangos de emoji/símbolos para
# alternar a la fuente Symbol al dibujarlos.
def _es_simbolo(ch):
    cp = ord(ch)
    return (
        cp >= 0x2300 and cp <= 0x27BF or          # Misc Technical, Dingbats
        cp >= 0x2B00 and cp <= 0x2BFF or          # Misc Symbols and Arrows
        cp >= 0x1F300 and cp <= 0x1FAFF or        # Emojis y pictogramas
        cp == 0x2022 or                           # bullet
        cp == 0x22EE or                           # ⋮ vertical ellipsis
        cp == 0xFE0F                              # selector emoji
    )

W, H = A4
MARGEN_X = 1.8 * cm

# ---------- Helpers ----------
def header_pagina(c, titulo_chico=None):
    """Barra negra arriba con KLENO/SALONES, línea amarilla abajo."""
    c.setFillColor(NEGRO)
    c.rect(0, H - 2.3 * cm, W, 2.3 * cm, fill=1, stroke=0)
    c.setFillColor(KLENO)
    c.rect(0, H - 2.4 * cm, W, 0.12 * cm, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont(FONT_B, 16)
    c.drawString(MARGEN_X, H - 1.5 * cm, "KLENO")
    c.setFillColor(KLENO)
    c.setFont(FONT_SB, 10)
    c.drawString(MARGEN_X + 2.0 * cm, H - 1.5 * cm, "SALONES   RECORRIDOS")

    if titulo_chico:
        c.setFillColor(white)
        c.setFont(FONT, 9)
        c.drawRightString(W - MARGEN_X, H - 1.5 * cm, titulo_chico.upper())

def footer_pagina(c, num):
    c.setFillColor(GRIS)
    c.setFont(FONT, 8)
    c.drawString(MARGEN_X, 1.2 * cm, URL_APP)
    c.drawRightString(W - MARGEN_X, 1.2 * cm, f"{num}")

def titulo_seccion(c, y, texto):
    c.setFillColor(NEGRO)
    c.setFont(FONT_B, 20)
    c.drawString(MARGEN_X, y, texto)
    c.setFillColor(KLENO)
    c.rect(MARGEN_X, y - 0.25 * cm, 1.2 * cm, 0.08 * cm, fill=1, stroke=0)
    return y - 1.0 * cm

def _limpiar(texto):
    """Quita variation selectors y caracteres que se renderizan como cuadrado."""
    return texto.replace("️", "").replace("‍", "")

def _ancho_mixto(c, texto, font_texto, font_sym, size):
    """Ancho considerando fuente alterna para símbolos/emojis."""
    texto = _limpiar(texto)
    total = 0
    for ch in texto:
        f = font_sym if _es_simbolo(ch) else font_texto
        total += c.stringWidth(ch, f, size)
    return total

def _draw_mixto(c, x, y, texto, font_texto, font_sym, size):
    """Dibuja texto alternando fuente normal y fuente de símbolos."""
    texto = _limpiar(texto)
    cur_font = font_texto
    c.setFont(cur_font, size)
    cur_x = x
    buf = ""
    for ch in texto:
        f = font_sym if _es_simbolo(ch) else font_texto
        if f != cur_font:
            if buf:
                c.drawString(cur_x, y, buf)
                cur_x += c.stringWidth(buf, cur_font, size)
                buf = ""
            cur_font = f
            c.setFont(cur_font, size)
        buf += ch
    if buf:
        c.drawString(cur_x, y, buf)

def parrafo(c, x, y, texto, ancho, font=None, size=10.5, color=None, lh=1.35,
            font_sym=None):
    """Imprime texto multilínea con wrap manual, soportando emojis."""
    font = font or FONT
    font_sym = font_sym or FONT_SYM
    color = color or GRIS_OSC
    c.setFillColor(color)
    palabras = texto.split()
    linea = ""
    for p in palabras:
        prueba = (linea + " " + p).strip()
        if _ancho_mixto(c, prueba, font, font_sym, size) <= ancho:
            linea = prueba
        else:
            _draw_mixto(c, x, y, linea, font, font_sym, size)
            y -= size * lh
            linea = p
    if linea:
        _draw_mixto(c, x, y, linea, font, font_sym, size)
        y -= size * lh
    return y

def bullet(c, x, y, texto, ancho, icono="•"):
    c.setFillColor(KLENO_DARK)
    _draw_mixto(c, x, y, icono, FONT_B, FONT_SYM, 11)
    return parrafo(c, x + 0.55 * cm, y, texto, ancho - 0.55 * cm)

def paso_numerado(c, x, y, num, titulo, descripcion, ancho):
    # número en círculo amarillo
    r = 0.42 * cm
    c.setFillColor(KLENO)
    c.circle(x + r, y - r * 0.3, r, fill=1, stroke=0)
    c.setFillColor(NEGRO)
    c.setFont(FONT_B, 12)
    c.drawCentredString(x + r, y - r * 0.55, str(num))

    # título a la derecha del círculo (con soporte emoji)
    c.setFillColor(NEGRO)
    _draw_mixto(c, x + r * 2 + 0.3 * cm, y - 0.05 * cm, titulo, FONT_B, FONT_SYM, 12)
    # descripción debajo
    y2 = y - 0.55 * cm
    y2 = parrafo(c, x + r * 2 + 0.3 * cm, y2, descripcion,
                 ancho - (r * 2 + 0.3 * cm), size=10, color=GRIS_OSC)
    return y2 - 0.3 * cm

def caja_dato(c, x, y, ancho, alto, titulo, lineas, color_borde=None):
    color_borde = color_borde or KLENO
    c.setFillColor(GRIS_CLARO)
    c.setStrokeColor(color_borde)
    c.setLineWidth(0.6)
    c.roundRect(x, y - alto, ancho, alto, 0.2 * cm, fill=1, stroke=1)
    # franja izquierda de color
    c.setFillColor(color_borde)
    c.rect(x, y - alto, 0.15 * cm, alto, fill=1, stroke=0)

    c.setFillColor(NEGRO)
    _draw_mixto(c, x + 0.5 * cm, y - 0.6 * cm, titulo, FONT_B, FONT_SYM, 10.5)
    yy = y - 1.1 * cm
    c.setFillColor(GRIS_OSC)
    for ln in lineas:
        _draw_mixto(c, x + 0.5 * cm, yy, ln, FONT, FONT_SYM, 9.5)
        yy -= 0.5 * cm

# ============================================================
#  PORTADA
# ============================================================
def pagina_portada(c):
    # Fondo
    c.setFillColor(NEGRO)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    # Franja amarilla diagonal abajo
    c.setFillColor(KLENO)
    p = c.beginPath()
    p.moveTo(0, 4 * cm)
    p.lineTo(W, 6 * cm)
    p.lineTo(W, 0)
    p.lineTo(0, 0)
    p.close()
    c.drawPath(p, fill=1, stroke=0)

    # Logo Kleno
    if LOGO.exists():
        try:
            # El logo es negro sobre fondo blanco. Lo dibujamos sobre un parche blanco.
            ancho_logo = 9 * cm
            from PIL import Image
            im = Image.open(LOGO)
            ratio = im.height / im.width
            alto_logo = ancho_logo * ratio
            xL = (W - ancho_logo) / 2
            yL = H / 2 + 2 * cm
            # parche blanco
            c.setFillColor(white)
            c.roundRect(xL - 0.5 * cm, yL - 0.5 * cm, ancho_logo + 1 * cm,
                        alto_logo + 1 * cm, 0.4 * cm, fill=1, stroke=0)
            c.drawImage(str(LOGO), xL, yL, width=ancho_logo, height=alto_logo,
                        preserveAspectRatio=True, mask='auto')
        except Exception as e:
            print(f"No pude poner logo: {e}")

    # Título grande
    c.setFillColor(white)
    c.setFont(FONT_B, 36)
    c.drawCentredString(W / 2, 8.5 * cm, "Salones")
    c.drawCentredString(W / 2, 7 * cm, "Recorridos")

    # Bajada
    c.setFillColor(white)
    c.setFont(FONT, 13)
    c.drawCentredString(W / 2, 5.3 * cm,
                        "App para registrar visitas a peluquerías")

    # Caja inferior con URL
    c.setFillColor(NEGRO)
    c.setFont(FONT_B, 11)
    c.drawCentredString(W / 2, 2.2 * cm, "Guía rápida — para empezar en 5 minutos")
    c.setFillColor(NEGRO)
    c.setFont(FONT, 9)
    c.drawCentredString(W / 2, 1.2 * cm, URL_APP)

# ============================================================
#  PÁGINA 2 — Qué es + Instalación
# ============================================================
def pagina_que_es(c):
    header_pagina(c, "Qué es y cómo instalarla")
    y = H - 3.5 * cm
    ancho = W - 2 * MARGEN_X

    y = titulo_seccion(c, y, "¿Qué es Salones Recorridos?")
    y = parrafo(c, MARGEN_X, y, ancho=ancho, size=11, lh=1.4,
        texto="Es una app para registrar visitas a peluquerías y salones. "
              "Anotás dónde fuiste, quién te atendió, qué ganas tiene de "
              "incorporar Kleno, su WhatsApp y mail, y dejás la ubicación "
              "marcada en el mapa. Después podés exportar todo a Excel o "
              "verlo en Google Maps.")
    y -= 0.4 * cm
    y = parrafo(c, MARGEN_X, y, ancho=ancho, size=11, lh=1.4,
        texto="Funciona en cualquier celular Android sin instalar nada de la "
              "Play Store: se abre desde el navegador y se 'instala' como "
              "ícono en tu pantalla principal.")

    y -= 0.8 * cm
    y = titulo_seccion(c, y, "Cómo instalarla en tu celular")
    y -= 0.2 * cm

    y = paso_numerado(c, MARGEN_X, y, 1,
        "Abrí Chrome en el celular",
        "En la barra de direcciones escribí (o copiá y pegá):  "
        f"{URL_APP}", ancho)

    y = paso_numerado(c, MARGEN_X, y, 2,
        "Tocá el menú ⋮ (tres puntitos arriba a la derecha)",
        "Buscá la opción 'Instalar app' o 'Agregar a pantalla principal'. "
        "Confirmá.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 3,
        "Listo: tenés el ícono de Kleno en el menú de apps",
        "Abrila desde ahí como cualquier otra app. Se abre a pantalla "
        "completa, sin la barra de Chrome.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 4,
        "La primera vez te pide tu nombre",
        "Lo escribís, tocás 'Entrar', y empezás a cargar salones. Cada salón "
        "queda etiquetado con quién lo cargó.", ancho)

    footer_pagina(c, 1)

# ============================================================
#  PÁGINA 3 — Cómo cargar un salón
# ============================================================
def pagina_cargar(c):
    header_pagina(c, "Cargar un salón")
    y = H - 3.5 * cm
    ancho = W - 2 * MARGEN_X

    y = titulo_seccion(c, y, "Cargar un salón nuevo")
    y -= 0.1 * cm

    y = paso_numerado(c, MARGEN_X, y, 1,
        "Tocá el botón amarillo '+ NUEVO SALÓN'",
        "Está abajo a la derecha en la pantalla de inicio.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 2,
        "Completá el nombre del salón",
        "Es lo único obligatorio.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 3,
        "Marcá la ubicación (3 formas distintas)",
        "📍 USAR MI UBICACIÓN: si estás parado en la puerta del salón, "
        "el celular toma las coordenadas exactas. "
        "🔍 BUSCAR EN GOOGLE MAPS: si el salón ya está cargado en Google "
        "Maps, lo encontrás ahí, tocás Compartir → Copiar enlace, volvés a "
        "la app y tocás 'Pegar link'. "
        "✍️ DIRECCIÓN A MANO: escribís la calle y la app te sugiere las "
        "calles reales de Buenos Aires.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 4,
        "Sacá una foto del salón (opcional)",
        "Tocá 📸 SACAR FOTO para usar la cámara, o 🖼️ ELEGIR DE GALERÍA "
        "para usar una que ya tenés.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 5,
        "Calificá las ganas de incorporar la marca",
        "Tocás de 1 a 5 estrellas. Si no te pudieron atender o no diste con "
        "la persona indicada, tocá ⏳ MARCAR COMO PENDIENTE — vas a volver "
        "a pasar más adelante.", ancho)

    y = paso_numerado(c, MARGEN_X, y, 6,
        "Tocá GUARDAR",
        "El salón queda en tu lista. Desde ahí podés mandarle WhatsApp o "
        "abrirlo en el mapa con un toque.", ancho)

    footer_pagina(c, 2)

# ============================================================
#  PÁGINA 4 — Funciones extra
# ============================================================
def pagina_funciones(c):
    header_pagina(c, "Funciones extra")
    y = H - 3.5 * cm
    ancho = W - 2 * MARGEN_X
    col_w = (ancho - 0.6 * cm) / 2

    y = titulo_seccion(c, y, "Lo que más se usa")
    y -= 0.2 * cm

    # 2 columnas de cajas
    fila_alto = 4.3 * cm
    caja_dato(c, MARGEN_X, y, col_w, fila_alto, "🗺  Ver mapa", [
        "Menú ⋮ → Ver mapa.",
        "Aparecen los salones con pines",
        "de color según su interés:",
        "  Verde = muy interesado",
        "  Naranja = tibio",
        "  Rojo = no le interesa",
        "  Gris = pendiente",
    ], color_borde=VERDE)

    caja_dato(c, MARGEN_X + col_w + 0.6 * cm, y, col_w, fila_alto,
              "🔍  Buscar y filtrar", [
        "Arriba de la lista hay un buscador",
        "y un filtro por calificación.",
        "Tocá 'Pendientes' para ver",
        "rápido a quién te falta volver",
        "a visitar.",
    ], color_borde=KLENO_DARK)

    y -= fila_alto + 0.5 * cm

    caja_dato(c, MARGEN_X, y, col_w, fila_alto,
              "📊  Exportar a Excel", [
        "Menú ⋮ → Exportar a Excel.",
        "Te baja un archivo .xlsx con",
        "hojas separadas por nivel de",
        "interés: Pendientes, Muy",
        "interesados, Interesados,",
        "Tibios, Sin interés.",
    ], color_borde=VERDE)

    caja_dato(c, MARGEN_X + col_w + 0.6 * cm, y, col_w, fila_alto,
              "🌍  Verlo en Google Maps", [
        "Menú ⋮ → Exportar para Google",
        "My Maps. Bajás un archivo .kml,",
        "vas a google.com/mymaps,",
        "creás un mapa nuevo e importás",
        "el archivo. Te quedan todos tus",
        "salones marcados en Google.",
    ], color_borde=KLENO_DARK)

    y -= fila_alto + 0.7 * cm

    y = titulo_seccion(c, y, "Atajos útiles")
    y -= 0.1 * cm

    y = bullet(c, MARGEN_X, y,
               "Tocá 'KLENO SALONES' arriba en cualquier momento para volver "
               "a la pantalla de inicio.", ancho)
    y -= 0.2 * cm
    y = bullet(c, MARGEN_X, y,
               "En el detalle de un salón, los botones 💬 WhatsApp, ✉️ Email "
               "y 🗺️ Mapa abren la app correspondiente con los datos cargados.",
               ancho)
    y -= 0.2 * cm
    y = bullet(c, MARGEN_X, y,
               "El botón ATRÁS del celular te lleva siempre a la pantalla "
               "de inicio.", ancho)

    footer_pagina(c, 3)

# ============================================================
#  PÁGINA 5 — Tips finales
# ============================================================
def pagina_tips(c):
    header_pagina(c, "Consejos importantes")
    y = H - 3.5 * cm
    ancho = W - 2 * MARGEN_X

    y = titulo_seccion(c, y, "Antes de empezar a usarla en serio")
    y -= 0.1 * cm

    # Caja importante - backup
    c.setFillColor(HexColor("#FFF5D5"))
    c.setStrokeColor(KLENO_DARK)
    c.setLineWidth(0.8)
    c.roundRect(MARGEN_X, y - 4.5 * cm, ancho, 4.5 * cm, 0.3 * cm, fill=1, stroke=1)
    c.setFillColor(KLENO_DARK)
    _draw_mixto(c, MARGEN_X + 0.5 * cm, y - 0.8 * cm,
                "⚠  HACÉ BACKUP UNA VEZ POR SEMANA", FONT_B, FONT_SYM, 13)
    yy = y - 1.6 * cm
    yy = parrafo(c, MARGEN_X + 0.5 * cm, yy, ancho=ancho - 1 * cm, size=10.5,
        color=GRIS_OSC, lh=1.35,
        texto="Los datos de los salones que cargás se guardan en tu celular. "
              "Si por accidente borrás la app, formateás el teléfono o lo "
              "cambiás por uno nuevo, podés perder todo.")
    yy -= 0.2 * cm
    yy = parrafo(c, MARGEN_X + 0.5 * cm, yy, ancho=ancho - 1 * cm, size=10.5,
        color=GRIS_OSC, lh=1.35,
        texto="Por eso: Menú ⋮ → 💾 Backup JSON. Te baja un archivo. "
              "Mandátelo por mail/WhatsApp a vos misma. Queda guardado y, "
              "si pasa algo, lo importás de nuevo en 30 segundos.")

    y -= 5 * cm
    y = titulo_seccion(c, y, "Si no te pueden atender")
    y -= 0.1 * cm
    y = parrafo(c, MARGEN_X, y, ancho=ancho, size=11, lh=1.4,
        texto="Cargá igual el salón con el nombre y la ubicación. En vez de "
              "poner estrellas, tocá ⏳ MARCAR COMO PENDIENTE. Te queda en "
              "una lista aparte (filtro 'Pendientes') para acordarte de "
              "volver otro día.")

    y -= 0.6 * cm
    y = titulo_seccion(c, y, "Funciona sin internet")
    y -= 0.1 * cm
    y = parrafo(c, MARGEN_X, y, ancho=ancho, size=11, lh=1.4,
        texto="Una vez que la abriste con conexión, la app sigue funcionando "
              "sin señal: podés cargar salones, sacar fotos y verlos en la "
              "lista. Lo único que necesita internet es el autocompletado "
              "de calles y la vista de mapa.")

    # Caja inferior con URL grande
    c.setFillColor(NEGRO)
    c.roundRect(MARGEN_X, 2.2 * cm, ancho, 2 * cm, 0.3 * cm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(FONT, 10)
    c.drawCentredString(W / 2, 3.5 * cm, "Abrila desde el celular en:")
    c.setFillColor(KLENO)
    c.setFont(FONT_B, 13)
    c.drawCentredString(W / 2, 2.6 * cm, URL_APP)

    footer_pagina(c, 4)

# ============================================================
#  BUILD
# ============================================================
def main():
    c = canvas.Canvas(str(SALIDA), pagesize=A4)
    c.setTitle("Salones Recorridos — Guía rápida")
    c.setAuthor("Kleno")

    pagina_portada(c);   c.showPage()
    pagina_que_es(c);    c.showPage()
    pagina_cargar(c);    c.showPage()
    pagina_funciones(c); c.showPage()
    pagina_tips(c);      c.showPage()

    c.save()
    print(f"Generado: {SALIDA}")
    print(f"Tamano: {SALIDA.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    main()
