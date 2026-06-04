"""
Genera los iconos PNG (192 y 512) para la PWA Salones Recorridos.
Logo Kleno (texto blanco original) invertido a negro sobre fondo blanco,
centrado, con margen seguro para los recortes circulares (maskable).
"""
from PIL import Image, ImageDraw, ImageOps
from pathlib import Path

AQUI = Path(__file__).parent
DEST = AQUI / "icons"
DEST.mkdir(exist_ok=True)

# Buscamos en orden: el logo "Professional" que pasó el usuario, después el
# logo viejo "Cosmética Capilar". Soporta nombres con .png.JPG (típico de
# Windows agregando extensión automática).
CANDIDATOS_LOGO = [
    DEST / "logo-kleno-pro.png",
    DEST / "logo-kleno-pro.png.JPG",
    DEST / "logo-kleno-pro.jpg",
    AQUI.parent / "logo_raw.png",
]
LOGO_FUENTE = next((p for p in CANDIDATOS_LOGO if p.exists()), None)
print(f"Logo fuente: {LOGO_FUENTE}")

BLANCO = (255, 255, 255)

def invertir_a_negro(logo_rgba):
    """logo_raw es texto BLANCO sobre fondo NEGRO. Lo necesitamos al revés."""
    # Convertir a escala de grises y luego pasar a alpha: oscuro = transparente,
    # blanco = opaco. Después rellenar de NEGRO con ese alpha.
    gris = logo_rgba.convert("L")
    # alpha = brillo del pixel (blancos quedan opacos, negros transparentes)
    alpha = gris
    # Recortar márgenes negros: bbox del contenido no negro
    bbox = gris.point(lambda p: 255 if p > 40 else 0).getbbox()
    if bbox:
        gris = gris.crop(bbox)
        alpha = alpha.crop(bbox)
    # Construir RGBA: negro con el alpha del brillo
    negro = Image.new("RGBA", gris.size, (0, 0, 0, 0))
    px_neg = negro.load()
    w, h = gris.size
    px_alpha = alpha.load()
    for y in range(h):
        for x in range(w):
            a = px_alpha[x, y]
            # suavizar: pixels grises a alpha proporcional
            if a < 30:
                px_neg[x, y] = (0, 0, 0, 0)
            else:
                px_neg[x, y] = (0, 0, 0, a)
    return negro

def render(size, salida, padding_pct=0.18):
    img = Image.new("RGBA", (size, size), BLANCO + (255,))

    if not LOGO_FUENTE.exists():
        print(f"No encuentro {LOGO_FUENTE} — uso 'K' grande.")
        draw = ImageDraw.Draw(img)
        draw.text((size//2, size//2), "K", fill=(0,0,0), anchor="mm")
        img.save(salida, "PNG")
        return

    logo = Image.open(LOGO_FUENTE).convert("RGBA")
    logo_negro = invertir_a_negro(logo)

    # Caja segura para iconos maskable (Android puede recortar 18% de cada borde)
    pad = int(size * padding_pct)
    max_w = size - 2 * pad
    max_h = size - 2 * pad
    ratio = min(max_w / logo_negro.width, max_h / logo_negro.height)
    new_size = (max(1, int(logo_negro.width * ratio)),
                max(1, int(logo_negro.height * ratio)))
    logo_negro = logo_negro.resize(new_size, Image.LANCZOS)
    pos = ((size - logo_negro.width) // 2, (size - logo_negro.height) // 2)
    img.paste(logo_negro, pos, logo_negro)

    img.save(salida, "PNG")
    print(f"Generado: {salida}")

if __name__ == "__main__":
    render(192, DEST / "icon-192.png")
    render(512, DEST / "icon-512.png")
    render(64,  DEST / "favicon.png", padding_pct=0.10)
