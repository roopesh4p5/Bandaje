# Writes media.json from the files in "photos and video/". Only needed if your web host
# doesn't show folder listings (python -m http.server and VS Code Live Server do).
import json, os
EXT = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.mp4', '.webm', '.mov', '.m4v')
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photos and video')
ls = lambda d: sorted(f for f in os.listdir(os.path.join(root, d)) if f.lower().endswith(EXT))
data = {'flora': ls('flora founa'), 'memories': ls('memories')}
with open(os.path.join(os.path.dirname(root), 'media.json'), 'w') as f: json.dump(data, f, indent=2)
print(f"media.json: {len(data['flora'])} flora/fauna, {len(data['memories'])} memories")
