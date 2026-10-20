import asyncio
import io
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from transformers import pipeline


MODEL_NAME = os.getenv("MODERATION_MODEL", "Falconsai/nsfw_image_detection")
NSFW_THRESHOLD = float(os.getenv("MODERATION_NSFW_THRESHOLD", "0.80"))
MAX_IMAGE_BYTES = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 60_000_000

app = FastAPI(title="Luma Moderation API", docs_url=None, redoc_url=None)
classifier = pipeline("image-classification", model=MODEL_NAME, device=-1)
inference_lock = asyncio.Lock()


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/moderate")
async def moderate(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo precisa ser uma imagem.")

    contents = await file.read(MAX_IMAGE_BYTES + 1)
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="A imagem deve ter no máximo 20 MB.")

    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Não foi possível processar a imagem.")

    async with inference_lock:
        results = await asyncio.to_thread(classifier, image)
    scores = {str(result["label"]).lower(): float(result["score"]) for result in results}
    nsfw_score = scores.get("nsfw", 0.0)
    normal_score = scores.get("normal", 0.0)
    allowed = nsfw_score < NSFW_THRESHOLD

    return {
        "allowed": allowed,
        "category": "normal" if allowed else "nsfw",
        "score": nsfw_score,
        "scores": {"normal": normal_score, "nsfw": nsfw_score},
    }
