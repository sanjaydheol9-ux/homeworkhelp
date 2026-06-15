from typing import Annotated
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import os

from parser import extract_text_and_lines
from ai_service import chat_with_document, generate_quiz

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request Models ────────────────────────────────────────

class ChatRequest(BaseModel):
    messages: list[dict]
    parsedData: list[dict]


class QuizRequest(BaseModel):
    parsedData: list[dict]


# ─── Upload Endpoint (existing) ────────────────────────────

import tempfile

@app.post("/api/upload-lesson")
async def process_lesson(file: Annotated[UploadFile, File(...)]):
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"temp_{file.filename}")

    try:
        # Save uploaded file to disk temporarily
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Run the PDF parser
        parsed_lines = extract_text_and_lines(temp_file_path)

        return {
            "message": "File parsed successfully",
            "filename": file.filename,
            "data": parsed_lines,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

    finally:
        # Always clean up the temp file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


# ─── Chat Endpoint ─────────────────────────────────────────

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        reply = chat_with_document(request.messages, request.parsedData)
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


# ─── Quiz Generation Endpoint ──────────────────────────────

@app.post("/api/generate-test")
async def generate_test_endpoint(request: QuizRequest):
    try:
        questions = generate_quiz(request.parsedData)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")