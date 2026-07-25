"""Generate Expo icon/splash/favicon assets from the Hisab brand logo."""
from PIL import Image
from pathlib import Path

SRC = Path(
    r"C:\Users\biswa\.cursor\projects\d-hisab\assets"
    r"\c__Users_biswa_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_hisab-logo.jpg-15a420c6-3e84-4110-a9f1-49d2d2a5a300.png"
)
OUT = Path(__file__).resolve().parents[1] / "assets"


def main() -> None:
    if not SRC.exists():
        # Fallback: newest matching logo drop in Cursor assets folder
        folder = Path(r"C:\Users\biswa\.cursor\projects\d-hisab\assets")
        matches = sorted(folder.glob("*hisab-logo*"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not matches:
            raise SystemExit(f"Logo source not found: {SRC}")
        src = matches[0]
    else:
        src = SRC

    im = Image.open(src).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)

    im.save(OUT / "icon.png", optimize=True)
    im.save(OUT / "splash-icon.png", optimize=True)
    im.save(OUT / "android-icon-foreground.png", optimize=True)
    im.save(OUT / "logo.png", optimize=True)

    bg = Image.new("RGBA", (1024, 1024), (11, 23, 49, 255))
    bg.save(OUT / "android-icon-background.png", optimize=True)

    im.resize((48, 48), Image.Resampling.LANCZOS).save(OUT / "favicon.png", optimize=True)

    pixels = im.load()
    mono = Image.new("RGBA", im.size, (0, 0, 0, 0))
    mp = mono.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _a = pixels[x, y]
            if r < 40 and g < 50 and b < 80:
                continue
            bright = max(r, g, b)
            mp[x, y] = (255, 255, 255, min(255, int(bright * 1.1)))
    mono.save(OUT / "android-icon-monochrome.png", optimize=True)

    print(f"source={src}")
    for p in sorted(OUT.glob("*")):
        print(f"{p.name}\t{p.stat().st_size}")


if __name__ == "__main__":
    main()
