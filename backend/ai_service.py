import os
import json
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

# Initialize the OpenAI client.
# Swap OPENAI_BASE_URL in .env to point at Groq, a local server, etc.
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY", ""),
    base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


# ─── Helpers ────────────────────────────────────────────────

def _build_document_context(parsed_data: list[dict], max_chars: int = 8000) -> str:
    """
    Convert the parsed document lines into a single text block
    with clear [Page X, Line Y] tags for the LLM to reference.
    Truncates if the text gets too long to avoid token limits.
    """
    lines: list[str] = []
    current_chars = 0
    for entry in parsed_data:
        page = entry.get("page_number", "?")
        line = entry.get("line_number", "?")
        text = entry.get("text", "")
        line_str = f"[Page {page}, Line {line}] {text}"
        
        if current_chars + len(line_str) > max_chars:
            lines.append("\n[Document truncated due to API token limits.]")
            break
            
        lines.append(line_str)
        current_chars += len(line_str)
        
    return "\n".join(lines)


# ─── Chat with Document ────────────────────────────────────

CHAT_SYSTEM_PROMPT = """You are a patient and encouraging study tutor helping an ICSE board student who struggles with complex text.

STRICT RULES YOU MUST FOLLOW:

1. **Readability**: Use extremely simple, easy-to-understand English. Avoid heavy jargon unless it is explicitly defined in the document text below. If you must use a technical term, immediately explain it in simple words.

2. **ICSE Answering Format**: Structure ALL your answers point-wise using bullet points. NEVER write long, thick paragraphs. Each bullet point should be short and focused on a single idea.

3. **Clarity**: **Bold** the most important keywords and terms in your answer so they are easy to spot and memorize.

4. **Source Rule**: Answer the student's question using ONLY the provided document text below. If the answer cannot be found in the document, say so honestly — do not make up information.

5. **Citations**: You MUST append the exact [Page X, Line Y] citation at the very end of your answer. List every page and line reference you used.

DOCUMENT TEXT:
{document_text}

Remember: Be kind, be patient, keep it simple, and always use bullet points."""


def chat_with_document(messages: list[dict], parsed_data: list[dict]) -> str:
    """
    Send the user's chat history along with the document context
    to the LLM and return the assistant's reply.

    `messages` is a list of {"role": "user"|"assistant", "content": "..."}
    """
    document_text = _build_document_context(parsed_data)
    system_prompt = CHAT_SYSTEM_PROMPT.replace("{document_text}", document_text)

    api_messages = [{"role": "system", "content": system_prompt}]
    # Only pass role + content to the LLM — strip any extra frontend fields
    for msg in messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    response = client.chat.completions.create(
        model=MODEL,
        messages=api_messages,
        temperature=0.3,
        max_tokens=800,
    )

    return response.choices[0].message.content or ""


# ─── Generate Quiz ─────────────────────────────────────────

QUIZ_SYSTEM_PROMPT = """You are a helpful study tutor. Your task is to generate 5 descriptive, short-answer questions based on the provided document text.

1. The questions should test **basic comprehension** and **core definitions** from the text. Do NOT create overly tricky, confusing, or misleading questions.

2. Keep the language **simple and direct** — the student struggles with complex wording.

3. Instead of giving the full answer, provide a **hint** for each question. The hint MUST include the exact Page Number where the answer is found, and 1 or 2 important **keywords** to help the student find it.

4. Return ONLY a valid JSON array with no extra text, no markdown fences, and no explanation. The format must be:
[
  {
    "question": "What is ...?",
    "hint": "Page X — Look for the keyword '...'"
  }
]

DOCUMENT TEXT:
{document_text}

Return ONLY the JSON array. No other text."""


def generate_quiz(parsed_data: list[dict]) -> list[dict]:
    """
    Ask the LLM to produce 5 MCQ questions from the document.
    Returns a parsed Python list of question dicts.
    """
    document_text = _build_document_context(parsed_data)
    system_prompt = QUIZ_SYSTEM_PROMPT.replace("{document_text}", document_text)

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Generate the 5-question quiz now."},
        ],
        temperature=0.4,
        max_tokens=1000,
    )

    raw = response.choices[0].message.content or "[]"

    # Strip markdown code fences if the model wraps the JSON
    raw = raw.strip()
    if raw.startswith("```"):
        # Remove opening fence (```json or ```)
        raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    questions = json.loads(raw)

    if not isinstance(questions, list):
        raise ValueError("LLM did not return a JSON array.")

    return questions
