#!/usr/bin/env bash
# Install Gnome Live Wallpaper (GNOME 45–51) and tune it for this machine:
# the mpv source follows the primary monitor, other monitors cover-crop
# instead of stretching, and decode prefers the Intel iGPU when present.
set -euo pipefail

UUID="gnome-wallpaper-engine@gjs.com"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
ZIP="/tmp/${UUID}.zip"
BG_DIR="${HOME}/.local/share/gnome-wallpaper-engine/backgrounds"

if [[ ! -f "$EXT_DIR/metadata.json" ]]; then
  gh release download v1.3.0 -R achu94/gnome-wallpaper-engine -p '*.zip' -O "$ZIP" --clobber
  gnome-extensions install --force "$ZIP"
fi

python3 - "$EXT_DIR/modules/wallpaper50.js" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
original = text

hwdec = '''"--hwdec=vaapi-copy,nvdec-copy",
            "--vaapi-device=/dev/dri/renderD128",'''
if "/dev/dri/renderD128" not in text and '"--hwdec=auto"' in text:
    text = text.replace('"--hwdec=auto",', hwdec, 1)

helper = '''
function pickSourceMonitor(monitors) {
    const primary = Main.layoutManager.primaryMonitor;
    return monitors.find((monitor) => monitor === primary) || monitors[0];
}
'''
if "function pickSourceMonitor" not in text:
    text = text.replace(
        "function getRelativeMonitorBounds(bounds, monitor) {",
        helper + "\nfunction getRelativeMonitorBounds(bounds, monitor) {",
        1,
    )
text = text.replace(
    "const sourceMonitor = monitors[0];",
    "const sourceMonitor = pickSourceMonitor(monitors);",
)

old_clones = '''            this._clones = localMonitorBounds.map((localBounds) => {
                const clone = new Clutter.Clone({ source: windowActor });

                clone.set_position(localBounds.x, localBounds.y);
                clone.set_size(localBounds.width, localBounds.height);
                clone.set_clip_to_allocation(true);
                clone.set_reactive(false);
                backgroundGroup.add_child(clone);
                return clone;
            });'''
new_clones = '''            this._clones = localMonitorBounds.map((localBounds) => {
                const clone = new Clutter.Clone({ source: windowActor });
                const scale = Math.max(
                    localBounds.width / sourceBounds.width,
                    localBounds.height / sourceBounds.height
                );
                const width = sourceBounds.width * scale;
                const height = sourceBounds.height * scale;
                const x = localBounds.x + (localBounds.width - width) / 2;
                const y = localBounds.y + (localBounds.height - height) / 2;
                clone.set_position(x, y);
                clone.set_size(width, height);
                clone.set_clip(localBounds.x - x, localBounds.y - y, localBounds.width, localBounds.height);
                clone.set_reactive(false);
                backgroundGroup.add_child(clone);
                return clone;
            });'''
if old_clones not in text and "localBounds.width / sourceBounds.width" not in text:
    raise SystemExit("clone block not found; extension layout changed")
text = text.replace(old_clones, new_clones)

if text != original:
    path.write_text(text)
    print(f"patched {path}")
else:
    print("already patched")
PY

mkdir -p "$BG_DIR"
gnome-extensions enable "$UUID" || true
echo "extension: $UUID"
echo "videos:    $BG_DIR"
echo "Wayland loads a newly installed extension after the next login."
