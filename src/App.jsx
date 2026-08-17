import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, 
  X, 
  Plus, 
  Send, 
  Paperclip, 
  FileText, 
  Trash2, 
  Sparkles, 
  BookOpen, 
  GraduationCap 
} from 'lucide-react';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('study_ai_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Salvataggio conversazioni in localStorage
  useEffect(() => {
    localStorage.setItem('study_ai_chats', JSON.stringify(conversations));
  }, [conversations]);

  // Scroll automatico alla fine dei messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Gestione nuova chat
  const handleNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setInputPrompt('');
    setAttachedFile(null);
    setIsSidebarOpen(false);
  };

  // Caricamento chat esistente
  const handleSelectChat = (chat) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setAttachedFile(null);
    setIsSidebarOpen(false);
  };

  // Eliminazione chat
  const handleDeleteChat = (e, id) => {
    e.stopPropagation();
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    if (currentChatId === id) {
      handleNewChat();
    }
  };

  // Gestione caricamento file
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        mimeType: file.type,
        size: (file.size / 1024).toFixed(1) + ' KB',
        base64: reader.result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Invio messaggio
  const handleSendMessage = async (textToSend = inputPrompt) => {
    const prompt = textToSend.trim();
    if (!prompt && !attachedFile) return;
    if (isLoading) return;

    const userMessage = {
      role: 'user',
      text: prompt,
      file: attachedFile ? { name: attachedFile.name, size: attachedFile.size } : null,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputPrompt('');
    const filePayload = attachedFile;
    setAttachedFile(null);
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          history: messages,
          file: filePayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore di risposta');

      const aiMessage = { role: 'assistant', text: data.reply };
      const updatedMessages = [...newMessages, aiMessage];
      setMessages(updatedMessages);

      let chatId = currentChatId;
      if (!chatId) {
        chatId = Date.now().toString();
        setCurrentChatId(chatId);
        const title = prompt ? (prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '')) : (filePayload?.name || 'Nuova conversazione');
        setConversations([{ id: chatId, title, messages: updatedMessages }, ...conversations]);
      } else {
        setConversations(conversations.map(c => c.id === chatId ? { ...c, messages: updatedMessages } : c));
      }
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', text: `Si e verificato un errore: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaInput = (e) => {
    setInputPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-geminiDark text-gray-200">
      
      {/* OVERLAY PER MOBILE */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR RETRATTILE */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-72 bg-geminiDarkSecondary border-r border-geminiBorder transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-full md:w-0 md:border-none'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-geminiBorder">
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-geminiHover hover:bg-geminiBorder text-gray-100 rounded-full border border-geminiBorder transition w-full"
          >
            <Plus size={16} />
            <span>Nuova chat</span>
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 ml-2 text-gray-400 hover:text-white rounded-lg md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* LISTA CONVERSAZIONI PRECEDENTI */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">
            Recenti
          </div>
          {conversations.length === 0 ? (
            <div className="text-xs text-gray-500 px-3 py-2">Nessuna conversazione precedente</div>
          ) : (
            conversations.map((chat) => (
              <div 
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition ${
                  currentChatId === chat.id 
                    ? 'bg-geminiHover text-white font-medium' 
                    : 'text-gray-300 hover:bg-geminiHover/60'
                }`}
              >
                <span className="truncate pr-2">{chat.title}</span>
                <button 
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* AREA PRINCIPALE */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* HEADER FISSO */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-geminiBorder/40 bg-geminiDark z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-gray-300 hover:text-white hover:bg-geminiHover rounded-lg transition"
              title="Apri/Chiudi cronologia"
            >
              <Menu size={20} />
            </button>
            
            {/* LOGO FISSO */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-400 flex items-center justify-center text-white font-bold shadow-md">
                <GraduationCap size={18} />
              </div>
              <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                StudyAI
              </span>
            </div>
          </div>

          <button 
            onClick={handleNewChat}
            className="flex items-center gap-1.5 text-xs bg-geminiDarkSecondary hover:bg-geminiHover border border-geminiBorder px-3 py-1.5 rounded-full text-gray-300 hover:text-white transition"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nuova sessione</span>
          </button>
        </header>

        {/* AREA MESSAGGI */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-4xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center pb-20">
              <div className="w-14 h-14 rounded-2xl bg-geminiDarkSecondary border border-geminiBorder flex items-center justify-center text-blue-400 mb-6 shadow-lg">
                <Sparkles size={28} />
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100 mb-3">
                Cosa vuoi studiare oggi?
              </h1>
              <p className="text-gray-400 text-sm md:text-base max-w-md mb-8">
                Fai una domanda, incolla i tuoi appunti o carica un PDF per riassunti, schemi e spiegazioni personalizzate.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {[
                  { icon: BookOpen, text: "Spiegami un argomento complesso con parole semplici" },
                  { icon: FileText, text: "Crea uno schema riassuntivo con i punti chiave" },
                  { icon: GraduationCap, text: "Fammi 5 domande a risposta multipla per testarmi" },
                  { icon: Sparkles, text: "Analizza e sintetizza il materiale che carico" }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.text)}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-geminiDarkSecondary/70 hover:bg-geminiDarkSecondary border border-geminiBorder/60 hover:border-gray-500 text-left transition group"
                  >
                    <item.icon size={18} className="text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-300 group-hover:text-white leading-relaxed">
                      {item.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-28">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1">
                      <GraduationCap size={16} />
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-blue-600/90 text-white rounded-br-sm' 
                      : 'bg-geminiDarkSecondary border border-geminiBorder text-gray-200 rounded-tl-sm shadow-sm'
                  }`}>
                    {msg.file && (
                      <div className="flex items-center gap-2 p-2 mb-2 bg-black/20 rounded-lg text-xs text-gray-200 border border-white/10">
                        <FileText size={14} />
                        <span className="font-medium truncate">{msg.file.name}</span>
                        <span className="text-gray-300">({msg.file.size})</span>
                      </div>
                    )}
                    
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1">
                    <GraduationCap size={16} />
                  </div>
                  <div className="bg-geminiDarkSecondary border border-geminiBorder px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-gray-400 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-150" />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-300" />
                    <span className="ml-1 text-xs">L'AI sta elaborando...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* INPUT BAR */}
        <footer className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-geminiDark via-geminiDark to-transparent">
          <div className="max-w-3xl mx-auto">
            
            {attachedFile && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-geminiDarkSecondary border border-geminiBorder rounded-lg text-xs w-fit text-blue-300">
                <FileText size={14} />
                <span className="truncate max-w-[200px] font-medium">{attachedFile.name}</span>
                <span className="text-gray-400">({attachedFile.size})</span>
                <button 
                  onClick={() => setAttachedFile(null)}
                  className="p-0.5 hover:text-red-400 transition"
                  title="Rimuovi allegato"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 bg-geminiDarkSecondary border border-geminiBorder rounded-3xl px-4 py-2.5 shadow-xl focus-within:border-gray-500 transition">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.txt,.docx,image/*"
                className="hidden"
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-blue-400 hover:bg-geminiHover rounded-full transition mb-0.5"
                title="Carica PDF, documento o immagine"
              >
                <Paperclip size={18} />
              </button>

              <textarea 
                ref={textareaRef}
                value={inputPrompt}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Fai una domanda o incolla i tuoi appunti..."
                rows={1}
                className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none py-1 max-h-44"
              />

              <button 
                type="button"
                onClick={() => handleSendMessage()}
                disabled={(!inputPrompt.trim() && !attachedFile) || isLoading}
                className={`p-2 rounded-full transition mb-0.5 ${
                  (inputPrompt.trim() || attachedFile) && !isLoading
                    ? 'bg-blue-600 text-white hover:bg-blue-500' 
                    : 'text-gray-600 bg-transparent cursor-not-allowed'
                }`}
                title="Invia messaggio"
              >
                <Send size={16} />
              </button>
            </div>
            
            <div className="text-center mt-2 text-[11px] text-gray-500">
              StudyAI puo commettere errori. Verifica sempre le informazioni importanti sui testi ufficiali.
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
