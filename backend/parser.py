import fitz  # PyMuPDF
import os
import base64
from openai import OpenAI


# ─── Supported file extensions ─────────────────────────────

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}
PDF_EXTENSIONS = {".pdf"}


def _get_extension(file_path: str) -> str:
    """Return the lowercase file extension."""
    _, ext = os.path.splitext(file_path)
    return ext.lower()


# ─── PDF Parsing (existing logic) ──────────────────────────

def extract_text_and_lines(file_path: str) -> list[dict]:
    """
    Route to the correct parser based on file extension.
    Always returns the same data structure:
    [{ "page_number": int, "line_number": int, "text": str }, ...]
    """
    ext = _get_extension(file_path)

    if ext in IMAGE_EXTENSIONS:
        return _extract_from_image(file_path)
    elif ext in PDF_EXTENSIONS:
        return _extract_from_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _extract_from_pdf(file_path: str) -> list[dict]:
    """Extract text from a PDF file using PyMuPDF."""
    # Open the PDF file
    doc = fitz.open(file_path)
    master_list = []

    # Loop through every page in the document
    for page_index in range(len(doc)):
        page = doc[page_index]

        # Extract the page layout as a Python dictionary
        page_dict = page.get_text("dict")
        blocks = page_dict["blocks"]

        # Start at line 1 for every new page
        line_counter = 1

        # Dig into the hierarchy: Blocks -> Lines -> Spans
        for block in blocks:
            # Check if it is a text block (ignoring images/graphics)
            if "lines" in block:
                for line in block["lines"]:
                    line_text = ""

                    # Glue the spans together
                    for span in line["spans"]:
                        line_text += span["text"] + " "

                    # Remove any weird trailing spaces
                    clean_text = line_text.strip()

                    # If the line isn't blank, save it to our master list
                    if clean_text:
                        master_list.append({
                            "page_number": page_index + 1,  # +1 because Python starts counting at 0
                            "line_number": line_counter,
                            "text": clean_text
                        })
                        line_counter += 1

    doc.close()
    return master_list


# ─── Image OCR Parsing ─────────────────────────────────────

def _extract_from_image(file_path: str) -> list[dict]:
    """
    Extract text from an image file using Groq's Vision LLM.
    Returns the same structure as the PDF parser, with page_number = 1.
    """
    with open(file_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')

    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1"),
    )

    response = client.chat.completions.create(
        model="llama-3.2-11b-vision-preview",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text", 
                        "text": "Extract all the text from this image exactly as it appears. Do not include any extra commentary, introductions, or markdown formatting. Just output the raw text."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}",
                        },
                    },
                ],
            }
        ],
        temperature=0.1,
    )
    raw_text = response.choices[0].message.content or ""

    master_list = []
    line_counter = 1

    for line in raw_text.split("\n"):
        clean_text = line.strip()
        if clean_text:
            master_list.append({
                "page_number": 1,
                "line_number": line_counter,
                "text": clean_text,
            })
            line_counter += 1

    return master_list