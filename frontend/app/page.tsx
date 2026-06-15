"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

interface ParsedLine {
  page_number: number;
  line_number: number;
  text: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

interface QuizQuestion {
  question: string;
  hint: string;
}

/* ═══════════════════════════════════════════════════════════
   INLINE SVG ICONS
   ═══════════════════════════════════════════════════════════ */

function IconUpload() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconUnlock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function parseAIMessage(content: string): { body: string; citations: string[] } {
  const citationRegex = /\[Page\s+\d+,\s*Line\s+\d+\]/g;
  const allCitations = content.match(citationRegex) || [];
  let body = content;
  for (const c of allCitations) {
    body = body.replace(c, "");
  }
  body = body.trim();
  const unique = [...new Set(allCitations)];
  return { body, citations: unique };
}

function renderFormattedText(text: string): string {
  let html = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      if (!inList) { result.push("<ul>"); inList = true; }
      result.push(`<li>${trimmed.replace(/^[-•]\s*/, "")}</li>`);
    } else {
      if (inList) { result.push("</ul>"); inList = false; }
      if (trimmed === "") {
        result.push("<br/>");
      } else {
        result.push(`<p style="margin:0 0 4px 0">${trimmed}</p>`);
      }
    }
  }
  if (inList) result.push("</ul>");
  return result.join("");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function MissionControl() {
  // ─── File / parsing state ────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedLine[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);

  // ─── Tab state ───────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"chat" | "quiz">("chat");

  // ─── Chat state ──────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // ─── Quiz state ──────────────────────────────────────
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isQuizLoading, setIsQuizLoading] = useState(false);

  // ─── Quiz Password Lock state ────────────────────────
  const [isQuizUnlocked, setIsQuizUnlocked] = useState(false);
  const [quizPasswordInput, setQuizPasswordInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFeedRef = useRef<HTMLDivElement>(null);
  const chatImageRef = useRef<HTMLInputElement>(null);

  const isDocumentReady = parsedData.length > 0;

  // ─── Auto-scroll chat ───────────────────────────────
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  // ─── File handlers ──────────────────────────────────
  const handleFileSelect = useCallback((selectedFile: File | undefined) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setParsedData([]);
    setFileName("");
    setChatMessages([]);
    setQuizQuestions([]);
    setIsQuizUnlocked(false);
    setQuizPasswordInput("");
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files?.[0]);
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      handleFileSelect(e.dataTransfer.files?.[0]);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const removeFile = useCallback(() => {
    setFile(null);
    setParsedData([]);
    setFileName("");
    setChatMessages([]);
    setQuizQuestions([]);
    setIsQuizUnlocked(false);
    setQuizPasswordInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ─── Upload & Parse ─────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!file) {
      alert("No file selected. Please choose a document first.");
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("http://127.0.0.1:8000/api/upload-lesson", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server responded with ${res.status}: ${errBody || res.statusText}`);
      }
      const json = await res.json();
      const data: ParsedLine[] = json.data ?? json;
      if (!Array.isArray(data)) {
        throw new Error("Unexpected response format from server.");
      }
      setParsedData(data);
      setFileName(json.filename || file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      alert(`Upload Error: ${message}`);
    } finally {
      setIsUploading(false);
    }
  }, [file]);

  // ─── Chat ───────────────────────────────────────────
  const handleSendMessage = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !isDocumentReady) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...chatMessages, userMessage];

    setChatMessages(updatedMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages, parsedData }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server responded with ${res.status}: ${errBody || res.statusText}`);
      }
      const json = await res.json();
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: json.reply || "Sorry, I could not generate a response.",
      };
      setChatMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      alert(`Chat Error: ${message}`);
      setChatMessages(chatMessages);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, chatMessages, isDocumentReady, parsedData]);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // ─── Chat Image Upload ─────────────────────────────
  const handleChatImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const imageFile = e.target.files?.[0];
      if (!imageFile) return;
      // Reset input so the same file can be re-uploaded
      if (chatImageRef.current) chatImageRef.current.value = "";

      const localUrl = URL.createObjectURL(imageFile);

      // Add user message with image preview
      const userMsg: ChatMessage = {
        role: "user",
        content: `📷 Uploaded photo: ${imageFile.name}`,
        imageUrl: localUrl,
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setIsChatLoading(true);

      try {
        // Step 1: OCR the image via backend
        const formData = new FormData();
        formData.append("file", imageFile);
        const ocrRes = await fetch("http://127.0.0.1:8000/api/upload-lesson", {
          method: "POST",
          body: formData,
        });
        if (!ocrRes.ok) {
          const errBody = await ocrRes.text();
          throw new Error(`OCR failed: ${errBody}`);
        }
        const ocrJson = await ocrRes.json();
        const ocrLines: ParsedLine[] = ocrJson.data ?? [];
        if (ocrLines.length === 0) {
          throw new Error("Could not extract any text from the image.");
        }

        const extractedText = ocrLines.map((l) => l.text).join("\n");

        // Step 2: Send extracted text + optional typed question to AI
        const question = chatInput.trim()
          ? chatInput.trim()
          : "Please read and explain the text in this image.";
        setChatInput("");

        const aiMessages: ChatMessage[] = [
          {
            role: "user",
            content: `The student uploaded a photo. Here is the text extracted from the photo:\n\n${extractedText}\n\nStudent's question: ${question}`,
          },
        ];

        const chatRes = await fetch("http://127.0.0.1:8000/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: aiMessages,
            parsedData: ocrLines,
          }),
        });
        if (!chatRes.ok) {
          const errBody = await chatRes.text();
          throw new Error(`Chat failed: ${errBody}`);
        }
        const chatJson = await chatRes.json();
        const aiReply: ChatMessage = {
          role: "assistant",
          content: chatJson.reply || "Sorry, I could not generate a response.",
        };
        setChatMessages((prev) => [...prev, aiReply]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unknown error occurred.";
        alert(`Image Chat Error: ${message}`);
      } finally {
        setIsChatLoading(false);
      }
    },
    [chatInput]
  );

  // ─── Quiz ──────────────────────────────────────────
  const handleGenerateQuiz = useCallback(async () => {
    if (!isDocumentReady) return;
    setIsQuizLoading(true);
    setQuizQuestions([]);
    setIsQuizUnlocked(false);
    setQuizPasswordInput("");

    try {
      const res = await fetch("http://127.0.0.1:8000/api/generate-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedData }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server responded with ${res.status}: ${errBody || res.statusText}`);
      }
      const json = await res.json();
      const questions: QuizQuestion[] = json.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("No questions were generated. Try again.");
      }
      setQuizQuestions(questions);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
      alert(`Quiz Error: ${message}`);
    } finally {
      setIsQuizLoading(false);
    }
  }, [isDocumentReady, parsedData]);

  // ─── Quiz Password Unlock ──────────────────────────
  const handleUnlockQuiz = useCallback(() => {
    if (quizPasswordInput === "study123") {
      setIsQuizUnlocked(true);
    } else {
      alert("Incorrect password. Please try again.");
    }
  }, [quizPasswordInput]);

  const handlePasswordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleUnlockQuiz();
      }
    },
    [handleUnlockQuiz]
  );

  /* ═════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════ */

  return (
    <div style={{ position: "relative" }}>
      {/* Animated grid background */}
      <div className="mission-grid-bg" />

      <div className="app-shell">
        {/* ═══════════════════════════════════════════════════
           LEFT SIDEBAR
           ═══════════════════════════════════════════════════ */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1 id="app-title">Mission Control</h1>
            <p>AI Study Companion</p>
          </div>

          <div className="sidebar-body">
            {/* ── Dropzone ────────────────────────────── */}
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.pptx,.png,.jpg,.jpeg"
              onChange={handleFileInputChange}
              style={{ display: "none" }}
            />

            <div
              id="dropzone"
              className={`dropzone ${isDragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              {file ? (
                <>
                  <div className="file-card-icon" style={{ width: 40, height: 40, borderRadius: 10 }}>
                    <IconFile />
                  </div>
                  <div className="dropzone-label" style={{ fontWeight: 500, color: "var(--text-bright)" }}>
                    {file.name}
                  </div>
                  <div className="dropzone-sublabel">
                    {formatSize(file.size)} • {file.name.split(".").pop()?.toUpperCase()}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: "var(--neon-cyan)", opacity: 0.6 }}>
                    <IconUpload />
                  </div>
                  <div className="dropzone-label">Drop your document or photo here</div>
                  <div className="dropzone-sublabel">PDF, DOCX, TXT, PNG, JPG</div>
                </>
              )}
            </div>

            {/* File remove + Parse button */}
            {file && !isDocumentReady && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  id="parse-btn"
                  type="button"
                  className="neon-btn"
                  style={{ flex: 1 }}
                  disabled={isUploading}
                  onClick={handleUpload}
                >
                  {isUploading ? (
                    <>
                      <span className="spinner-sm" />
                      Parsing…
                    </>
                  ) : (
                    "Upload & Parse"
                  )}
                </button>
                <button
                  id="remove-file-btn"
                  type="button"
                  className="file-card-remove"
                  style={{ padding: 10, border: "1px solid var(--border-dim)", borderRadius: "var(--radius-sm)" }}
                  onClick={removeFile}
                  aria-label="Remove file"
                >
                  <IconX />
                </button>
              </div>
            )}

            {/* Status */}
            {isDocumentReady ? (
              <div className="status-indicator ready">
                <span className="status-dot green" />
                Ready for AI Analysis
              </div>
            ) : isUploading ? (
              <div className="status-indicator loading">
                <span className="status-dot blue" />
                Parsing document…
              </div>
            ) : (
              <div className="status-indicator idle">
                <span className="status-dot gray" />
                Upload a document to start
              </div>
            )}

            {/* Stats */}
            {isDocumentReady && (
              <>
                <div className="sidebar-stats">
                  <div className="stat-card">
                    <div className="stat-value">{parsedData.length}</div>
                    <div className="stat-label">Lines</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value purple">
                      {new Set(parsedData.map((d) => d.page_number)).size}
                    </div>
                    <div className="stat-label">Pages</div>
                  </div>
                </div>

                {/* File card when ready */}
                <div className="file-card">
                  <div className="file-card-icon"><IconFile /></div>
                  <div className="file-card-info">
                    <div className="file-card-name">{fileName}</div>
                    <div className="file-card-meta">
                      {parsedData.length} lines • {new Set(parsedData.map((d) => d.page_number)).size} pages
                    </div>
                  </div>
                  <button
                    type="button"
                    className="file-card-remove"
                    onClick={removeFile}
                    aria-label="Remove file"
                  >
                    <IconX />
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="sidebar-footer">
            Mission Control v2.0
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════
           MAIN CONTENT
           ═══════════════════════════════════════════════════ */}
        <main className="main-content">
          {/* Tab Bar */}
          <div className="tab-bar">
            <button
              id="tab-chat"
              type="button"
              className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
              disabled={!isDocumentReady}
              onClick={() => setActiveTab("chat")}
            >
              Chat with Document
            </button>
            <button
              id="tab-quiz"
              type="button"
              className={`tab-btn ${activeTab === "quiz" ? "active" : ""}`}
              disabled={!isDocumentReady}
              onClick={() => setActiveTab("quiz")}
            >
              Generate Practice Test
            </button>
          </div>

          {/* Content Area */}
          {!isDocumentReady ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <IconFile />
              </div>
              <h3>No Document Loaded</h3>
              <p>
                Upload and parse a document or photo using the sidebar to unlock
                the Chat and Practice Test features.
              </p>
            </div>
          ) : activeTab === "chat" ? (
            /* ═════════════════════════════════════════════
               TAB 1: CHAT
               ═════════════════════════════════════════════ */
            <div className="chat-container">
              <div className="chat-feed" ref={chatFeedRef} id="chat-feed">
                {chatMessages.length === 0 && !isChatLoading ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <IconSend />
                    </div>
                    <h3>Ask a Question</h3>
                    <p>
                      Type a question about <strong style={{ color: "var(--neon-cyan)" }}>{fileName}</strong> and
                      the AI tutor will answer using only the document content.
                    </p>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg, i) => {
                      if (msg.role === "user") {
                        return (
                          <div key={i} className="chat-row user">
                            <div className="chat-bubble user">
                              {msg.imageUrl && (
                                <img
                                  src={msg.imageUrl}
                                  alt="Uploaded photo"
                                  className="chat-image"
                                />
                              )}
                              {msg.content}
                            </div>
                          </div>
                        );
                      }
                      const { body, citations } = parseAIMessage(msg.content);
                      return (
                        <div key={i} className="chat-row ai">
                          <div className="chat-bubble ai">
                            <div dangerouslySetInnerHTML={{ __html: renderFormattedText(body) }} />
                            {citations.length > 0 && (
                              <div className="citation-block">
                                📖 Sources: {citations.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {isChatLoading && (
                      <div className="chat-row ai">
                        <div className="chat-bubble ai">
                          <div className="typing-indicator">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="chat-input-bar">
                {/* Hidden image input for chat */}
                <input
                  ref={chatImageRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.bmp,.webp"
                  onChange={handleChatImageUpload}
                  style={{ display: "none" }}
                />
                <button
                  id="chat-image-btn"
                  type="button"
                  className="chat-image-btn"
                  onClick={() => chatImageRef.current?.click()}
                  disabled={isChatLoading}
                  title="Upload a photo to chat"
                >
                  <IconCamera />
                </button>
                <input
                  id="chat-input"
                  type="text"
                  className="chat-input"
                  placeholder="Ask a question, or upload a photo…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  disabled={isChatLoading}
                />
                <button
                  id="send-btn"
                  type="button"
                  className="send-btn"
                  disabled={!chatInput.trim() || isChatLoading}
                  onClick={handleSendMessage}
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            /* ═════════════════════════════════════════════
               TAB 2: QUIZ (with password lock)
               ═════════════════════════════════════════════ */
            <div className="quiz-container">
              <div className="quiz-header">
                <button
                  id="generate-quiz-btn"
                  type="button"
                  className="generate-quiz-btn"
                  disabled={isQuizLoading}
                  onClick={handleGenerateQuiz}
                >
                  {isQuizLoading ? (
                    <>
                      <span className="spinner-sm" />
                      Generating…
                    </>
                  ) : (
                    "Generate 5-Question Quiz"
                  )}
                </button>
              </div>

              {quizQuestions.length === 0 && !isQuizLoading ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <h3>No Quiz Yet</h3>
                  <p>
                    Click the button above to generate a 5-question descriptive
                    quiz based on <strong style={{ color: "var(--neon-purple)" }}>{fileName}</strong>.
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Question Cards ──────────────────── */}
                  <div className="quiz-cards">
                    {quizQuestions.map((q, qIndex) => (
                      <div key={qIndex} className="quiz-card" id={`quiz-card-${qIndex}`}>
                        <div className="quiz-card-number">
                          Question {qIndex + 1} of {quizQuestions.length}
                        </div>
                        <div className="quiz-card-question">{q.question}</div>

                        {/* Hint — only visible when unlocked */}
                        {isQuizUnlocked && (
                          <div className={`quiz-options options-reveal options-reveal-delay-${qIndex}`}>
                            <div style={{ padding: "12px", background: "rgba(167, 139, 250, 0.1)", borderLeft: "3px solid var(--neon-purple)", borderRadius: "0 6px 6px 0", color: "var(--text-bright)", fontSize: "14px", lineHeight: 1.6 }}>
                              <strong style={{ color: "var(--neon-purple)" }}>Hint:</strong> {q.hint}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Password Lock / Unlock ─────────── */}
                  {!isQuizUnlocked && (
                    <div className="lock-panel">
                      <IconLock />
                      <input
                        id="quiz-password-input"
                        type="password"
                        className="lock-input"
                        placeholder="Enter password to reveal hints…"
                        value={quizPasswordInput}
                        onChange={(e) => setQuizPasswordInput(e.target.value)}
                        onKeyDown={handlePasswordKeyDown}
                      />
                      <button
                        id="unlock-btn"
                        type="button"
                        className="unlock-btn"
                        onClick={handleUnlockQuiz}
                      >
                        Unlock
                      </button>
                    </div>
                  )}

                  {/* ── Unlocked indicator ─────────────── */}
                  {isQuizUnlocked && (
                    <div
                      className="status-indicator ready options-reveal"
                      style={{ marginTop: 16, display: "inline-flex" }}
                    >
                      <IconUnlock />
                      Hints Revealed
                    </div>
                  )}

                  {/* ── Regenerate Questions Button ─────────────── */}
                  <div style={{ marginTop: "24px" }}>
                    <button
                      type="button"
                      className="neon-btn"
                      disabled={isQuizLoading}
                      onClick={handleGenerateQuiz}
                    >
                      {isQuizLoading ? "Generating..." : "Regenerate Different Questions"}
                    </button>
                  </div>


                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
