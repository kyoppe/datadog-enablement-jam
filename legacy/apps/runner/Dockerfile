# Build context: apps/runner
# NOTE: For Phase 2 the runner typically runs on the host (EC2) rather than in a
# container, because it invokes Docker/Make. This Dockerfile is provided for
# completeness; running on the host is the recommended model.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY runner.py ./runner.py
ENV PYTHONUNBUFFERED=1
CMD ["python", "runner.py"]
