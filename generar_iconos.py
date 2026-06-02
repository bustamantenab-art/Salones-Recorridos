"""
Genera los iconos PNG (192 y 512) para la PWA Salones Recorridos.
Fondo amarillo Kleno con el logo de Kleno y una etiqueta 'SALONES'.
Se puede correr de nuevo cuando se quiera regenerar.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

AQUI = Path(__file__).parent
LOGO_FUENTE = AQUI.parent / "logo_raw.png"
DEST = AQUI / "icons"
DEST.mkdir(exist_ok=True)

AMARILLO = (255, 193, 7)         # #ffc107
NEGRO = (26, 29, 35)             # fondo dark de Kleno
GRIS_OSCURO = (45, 51, 61)

def cargar_fuente(tam):
    candidatos = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for f in candidatos:
        if Path(f).exists():
            try:
                return ImageFont.truetype(f, tam)
            except Exception:
                pass
    return ImageFont.load_default()

def render(size, salida):
    img = Image.new("RGBA", (size, size), AMARILLO)
    draw = ImageDraw.Draw(img)

    # Banda inferior negra
    banda_h = int(size * 0.22)
    draw.rectangle([0, size - banda_h, size, size], fill=NEGRO)

    # Logo o "K" enorme arriba
    if LOGO_FUENTE.exists():
        try:
            logo = Image.open(LOGO_FUENTE).convert("RGBA")
            max_w = int(size * 0.75)
            max_h = int(size * 0.50)
            ratio = min(max_w / logo.width, max_h / logo.height)
            new_size = (max(1, int(logo.width * ratio)), max(1, int(logo.height * ratio)))
            logo = logo.resize(new_size, Image.LANCZOS)
            pos = ((size - logo.width) // 2, int(size * 0.10))
            img.paste(logo, pos, logo)
        except Exception as e:
            print(f"No pude usar logo_raw.png ({e}), uso 'K' grande.")
            fuente_k = cargar_fuente(int(size * 0.55))
            bbox = draw.textbbox((0, 0), "K", font=fuente_k)
            w = bbox[2] - bbox[0]; h = bbox[3] - bbox[1]
            draw.text(((size - w) // 2 - bbox[0], int(size * 0.10)), "K",
                      fill=NEGRO, font=fuente_k)
    else:
        fuente_k = cargar_fuente(int(size * 0.55))
        bbox = draw.textbbox((0, 0), "K", font=fuente_k)
        w = bbox[2] - bbox[0]
        draw.text(((size - w) // 2 - bbox[0], int(size * 0.10)), "K",
                  fill=NEGRO, font=fuente_k)

    # Texto SALONES centrado en banda inferior
    fuente_t = cargar_fuente(int(size * 0.13))
    texto = "SALONES"
    bbox = draw.textbbox((0, 0), texto, font=fuente_t)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = size - banda_h + (banda_h - th) // 2 - bbox[1] - int(size * 0.01)
    draw.text((tx, ty), texto, fill=AMARILLO, font=fuente_t)

    img.save(salida, "PNG")
    print(f"Generado: {salida}")

if __name__ == "__main__":
    render(192, DEST / "icon-192.png")
    render(512, DEST / "icon-512.png")
    # tambien una version simple para favicon
    render(64, DEST / "favicon.png")
