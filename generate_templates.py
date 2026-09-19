import base64
import io
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parent

# Primary: Self-contained kernel directory within mobile repository
qwen_file = root / "kernels" / "serve_qwen38.py"
glm_file = root / "kernels" / "serve_glm53.py"
engine_dir = root / "kernels" / "glm53"

# Fallback: Upstream monorepo layout if running from parent repo
if not qwen_file.exists():
    qwen_file = root.parent / "qwen38-27b" / "kernel" / "serve_qwen38.py"
    glm_file = root.parent / "glm53-flash" / "kernel" / "serve_glm53.py"
    engine_dir = root.parent / "glm53-flash" / "engine" / "glm53"

if not qwen_file.exists() or not glm_file.exists() or not engine_dir.is_dir():
    raise FileNotFoundError(
        f"Missing required kernel or engine sources:\n"
        f"  Qwen: {qwen_file} (exists: {qwen_file.exists()})\n"
        f"  GLM: {glm_file} (exists: {glm_file.exists()})\n"
        f"  GLM Engine: {engine_dir} (exists: {engine_dir.is_dir()})"
    )

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tf:
    for f in sorted(engine_dir.glob("*.py")):
        tf.add(f, arcname=f"{engine_dir.name}/{f.name}")
engine_b64 = base64.b64encode(buf.getvalue()).decode()

out_file = root / "src" / "services" / "templates_data.ts"
out_file.parent.mkdir(parents=True, exist_ok=True)

ts_content = f"""// Auto-generated kernel templates from kaggle-tpu-lab
export const QWEN_TEMPLATE = {json.dumps(qwen_file.read_text(encoding='utf-8'))};

export const GLM_TEMPLATE = {json.dumps(glm_file.read_text(encoding='utf-8'))};

export const GLM_ENGINE_B64 = {json.dumps(engine_b64)};
"""

out_file.write_text(ts_content, encoding="utf-8")
print(f"Successfully generated {out_file} ({len(ts_content)} bytes)")
