"""
Toma logo_raw.png (texto KLENO blanco sobre negro), lo recorta a la zona
central útil y hace transparente el fondo negro. Resultado: logo-topbar.png
listo para usar sobre cualquier fondo oscuro.
"""
from PIL import Image
from pathlib import Path

AQUI = Path(__file__).parent
SRC = AQUI / "icons" / "logo-kleno.png"
DST = AQUI / "icons" / "logo-topbar.png"

img = Image.open(SRC).convert("RGBA")
w, h = img.size

# Recortar para descartar bordes vacíos (el logo no llena toda la imagen).
# La imagen es ~2000x2000. La parte útil (texto KLENO + tagline) está
# aproximadamente entre y=750 y y=1450, y horizontalmente entre x=400 y x=1600.
left  = int(w * 0.18)
right = int(w * 0.82)
top   = int(h * 0.36)
bot   = int(h * 0.72)
crop = img.crop((left, top, right, bot))

# Hacer transparente todo lo que sea casi negro (fondo).
pixels = crop.load()
cw, ch = crop.size
for y in range(ch):
    for x in range(cw):
        r, g, b, a = pixels[x, y]
        # Si es muy oscuro -> transparente. Si es claro -> opaco.
        brillo = max(r, g, b)
        if brillo < 40:
            pixels[x, y] = (0, 0, 0, 0)
        elif brillo < 80:
            # zona de borde: semitransparente, suave
            pixels[x, y] = (255, 255, 255, int((brillo - 40) * 255 / 40))
        else:
            # zona blanca: blanco puro opaco
            pixels[x, y] = (255, 255, 255, 255)

# Redimensionar a un alto razonable (mantiene proporción)
ratio = 200 / crop.height
new_size = (int(crop.width * ratio), 200)
crop = crop.resize(new_size, Image.LANCZOS)

crop.save(DST, "PNG")
print(f"Generado: {DST} ({crop.size[0]}x{crop.size[1]})")
