# Build context: apps/demo-app
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY common ./common
COPY payment-service/main.py ./main.py
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["ddtrace-run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
