import json
import io
import tarfile
import base64
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
qwen_file = root / "qwen38-27b" / "kernel" / "serve_qwen38.py"
glm_file = root / "glm53-flash" / "kernel" / "serve_glm53.py"
engine_dir = root / "glm53-flash" / "engine" / "glm53"

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tf:
    for f in sorted(engine_dir.glob("*.py")):
        tf.add(f, arcname=f"{engine_dir.name}/{f.name}")
engine_b64 = base64.b64encode(buf.getvalue()).decode()

out_file = root / "apk" / "src" / "services" / "templates_data.ts"
out_file.parent.mkdir(parents=True, exist_ok=True)

ts_content = f"""// Auto-generated kernel templates from kaggle-tpu-lab
export const QWEN_TEMPLATE = {json.dumps(qwen_file.read_text(encoding='utf-8'))};

export const GLM_TEMPLATE = {json.dumps(glm_file.read_text(encoding='utf-8'))};

export const GLM_ENGINE_B64 = {json.dumps(engine_b64)};
"""

out_file.write_text(ts_content, encoding="utf-8")
print(f"Wrote {len(ts_content)} bytes to {out_file}")
