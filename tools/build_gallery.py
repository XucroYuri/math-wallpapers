#!/usr/bin/env python3
"""Build gallery/index.html from pieces/*/meta.json."""
import json
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
PIECES = ROOT / "pieces"
OUT = ROOT / "gallery" / "index.html"

META_DEFAULTS = {
    "title": "未命名",
    "problem": "",
    "tagline": "",
    "description": "",
    "duration": 20,
    "tech": "",
    "order": 999,
    "palette": ["#05070a", "#7ef0d4", "#c8a2ff"],
}


def load():
    items = []
    for folder in sorted(PIECES.iterdir()):
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"skip {folder.name}: bad meta.json ({exc})")
            continue
        meta = {**META_DEFAULTS, **meta}
        meta["slug"] = folder.name
        meta["preview"] = f"../pieces/{folder.name}/preview.png"
        if not (folder / "preview.png").exists():
            meta["preview"] = ""
        items.append(meta)
    items.sort(key=lambda m: (m["order"], m["title"]))
    return items


def card(meta):
    preview = meta["preview"]
    if preview:
        media = f'<img src="{escape(preview)}" alt="{escape(meta["title"])}" loading="lazy">'
    else:
        media = '<div class="placeholder">preview pending</div>'
    palette = meta.get("palette") or []
    dots = "".join(f'<span style="background:{escape(c)}"></span>' for c in palette[:3])
    return f"""
    <a class="card" href="../pieces/{escape(meta['slug'])}/" target="_blank" rel="noopener">
      <div class="media">{media}<div class="badge">{escape(str(meta['problem']))}</div></div>
      <div class="body">
        <div class="title-row"><h2>{escape(meta['title'])}</h2><div class="dots">{dots}</div></div>
        <p class="tagline">{escape(meta['tagline'])}</p>
        <p class="desc">{escape(meta['description'])}</p>
        <div class="foot"><span>{escape(meta['tech'])}</span><span>{meta['duration']}s loop</span><span>open ↗</span></div>
      </div>
    </a>"""


def main():
    items = load()
    cards = "\n".join(card(m) for m in items)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>数学壁纸 · 10 个原型</title>
<style>
  :root {{
    --bg: #05070a; --panel: #0b1017; --line: #1b2430;
    --ink: #e7edf3; --muted: #8fa0b3; --accent: #7ef0d4;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.55 "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  }}
  .wrap {{ max-width: 1560px; margin: 0 auto; padding: 42px 28px 80px; }}
  header {{ display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }}
  h1 {{ font-size: 28px; font-weight: 500; letter-spacing: -0.02em; margin: 0; }}
  .sub {{ color: var(--muted); margin: 8px 0 0; }}
  .count {{ color: var(--accent); white-space: nowrap; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; }}
  .card {{
    display: block; text-decoration: none; color: inherit;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    overflow: hidden; transition: transform .25s ease, border-color .25s ease;
  }}
  .card:hover {{ transform: translateY(-3px); border-color: #37506a; }}
  .media {{ position: relative; aspect-ratio: 16/9; background: #020305; overflow: hidden; }}
  .media img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
  .placeholder {{ width: 100%; height: 100%; display: grid; place-items: center; color: #34424f; font-size: 12px; }}
  .badge {{
    position: absolute; left: 12px; bottom: 12px; padding: 5px 9px; border-radius: 999px;
    background: rgba(3, 6, 10, .72); border: 1px solid rgba(255,255,255,.12);
    color: #d8e4ee; font-size: 11px; backdrop-filter: blur(8px);
  }}
  .body {{ padding: 16px 16px 13px; }}
  .title-row {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; }}
  h2 {{ font-size: 17px; margin: 0; font-weight: 500; }}
  .dots {{ display: flex; gap: 5px; }}
  .dots span {{ width: 7px; height: 7px; border-radius: 50%; display: block; }}
  .tagline {{ color: var(--accent); margin: 6px 0 0; font-size: 12px; }}
  .desc {{ color: var(--muted); margin: 10px 0 16px; font-size: 12.5px; min-height: 3.1em; }}
  .foot {{ display: flex; justify-content: space-between; gap: 10px; border-top: 1px solid var(--line); padding-top: 10px; color: #748396; font-size: 11px; }}
  footer {{ margin-top: 42px; color: #5f6f81; font-size: 12px; }}
  code {{ color: #c7d3df; }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>数学壁纸 · 10 个原型</h1>
      <p class="sub">点击卡片打开全屏实时效果。全部为确定性循环，可直接录制为壁纸视频。</p>
    </div>
    <span class="count">{len(items)} pieces</span>
  </header>
  <div class="grid">
    {cards}
  </div>
  <footer>
    本地预览：<code>cd ~/math-wallpapers && python3 -m http.server 8090 --bind 127.0.0.1</code><br>
    打开 <code>http://127.0.0.1:8090/gallery/</code>。点击卡片后按 F11 全屏。
  </footer>
</div>
</body>
</html>
""", encoding="utf-8")
    print(f"wrote {OUT} with {len(items)} pieces")


if __name__ == "__main__":
    main()
