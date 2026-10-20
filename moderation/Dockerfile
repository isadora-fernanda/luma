FROM python:3.11-slim

WORKDIR /service
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY moderation_api.py ./
EXPOSE 8000
CMD ["uvicorn", "moderation_api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
