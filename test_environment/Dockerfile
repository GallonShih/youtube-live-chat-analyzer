FROM python:3.11-slim

WORKDIR /app

# Install chat-downloader
RUN pip install chat-downloader

# Create a test script directory
COPY test_chat.py .

CMD ["python", "test_chat.py"]