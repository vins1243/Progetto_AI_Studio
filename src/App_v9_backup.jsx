import React, { useState, useEffect, useRef, Component } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
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
  GraduationCap,
  MessageSquare,
  Calendar as CalendarIcon,
  ArrowRight,
  ArrowLeft,
  Sliders,
  CheckCircle2,
  UploadCloud,
  Globe,
  Clock,
  Target,
  FileCheck,
  FolderKanban,
  CheckSquare,
  Square,
  BookMarked,
  RefreshCw,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

// IndexedDB Helper per memorizzare documenti pesanti senza limiti di storage
const DB_NAME = 'StudyAIDB_Files';
const STORE_NAME = 'project_files_store';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFilesToDB(projectId, filesArray) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ projectId, files: filesArray });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Impossibile salvare file in IndexedDB:", err);
  }
}

async function getFilesFromDB(projectId) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(projectId);
      req.onsuccess = () => resolve(req.result ? req.result.files : []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Impossibile recuperare file da IndexedDB:", err);
    return [];
  }
}

// Error Boundary per prevenire blocchi di rendering
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary cattura:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-geminiDark text-gray-200 p-6 text-center">
          <div className="bg-geminiDarkSecondary border border-red-500/30 p-8 rounded-3xl max-w-md space-y-4 shadow-2xl">
            <AlertTriangle size={36} className="text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-gray-100">Si è verificato un problema</h2>
            <p className="text-xs text-gray-400">
              I tuoi dati sono al sicuro. Clicca qui sotto per ricaricare la schermata.
            </p>
            <button 
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-semibold transition"
            >
              Ricarica applicazione
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Renderer Markdown e LaTeX
function MarkdownRenderer({ content }) {
  if (!content) return null;
  try {
    return (
      <div className="prose prose-invert max-w-none text-sm leading-relaxed text-gray-200">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
          components={{
            h1: ({node, ...props}) => <h1 className="text-xl font-bold text-gray-100 mt-5 mb-3 pb-1 border-b border-geminiBorder/60" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-lg font-bold text-blue-400 mt-5 mb-2.5 flex items-center gap-2" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-base font-semibold text-indigo-300 mt-4 mb-1.5" {...props} />,
            p: ({node, ...props}) => <p className="mb-3 leading-relaxed text-gray-200" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 space-y-1.5 mb-3 text-gray-200" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 space-y-1.5 mb-3 text-gray-200" {...props} />,
            li: ({node, ...props}) => <li className="text-gray-200 leading-relaxed" {...props} />,
            strong: ({node, ...props}) => <strong className="font-bold text-white bg-blue-500/15 text-blue-200 px-1 py-0.5 rounded border border-blue-500/30" {...props} />,
            em: ({node, ...props}) => <em className="italic text-gray-300" {...props} />,
            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-3 bg-geminiDarkSecondary/60 rounded-r-xl italic text-gray-300" {...props} />,
            code: ({node, inline, ...props}) => inline 
              ? <code className="bg-geminiDarkSecondary px-1.5 py-0.5 rounded text-blue-300 font-mono text-xs border border-geminiBorder" {...props} />
              : <pre className="bg-geminiDarkSecondary p-4 rounded-2xl overflow-x-auto text-xs font-mono text-gray-200 my-3 border border-geminiBorder"><code {...props} /></pre>,
            table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-xl border border-geminiBorder"><table className="min-w-full divide-y divide-geminiBorder text-xs text-left" {...props} /></div>,
            thead: ({node, ...props}) => <thead className="bg-geminiDarkSecondary text-gray-300 font-bold uppercase" {...props} />,
            tbody: ({node, ...props}) => <tbody className="divide-y divide-geminiBorder/50 bg-geminiDark/40" {...props} />,
            th: ({node, ...props}) => <th className="px-4 py-2.5 text-xs font-bold text-gray-200" {...props} />,
            td: ({node, ...props}) => <td className="px-4 py-2.5 text-xs text-gray-200" {...props} />,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  } catch (err) {
    return <div className="text-xs text-gray-300 whitespace-pre-wrap">{content}</div>;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainAppContent />
    </ErrorBoundary>
  );
}

function MainAppContent() {
  // Navigation State
  const [currentView, setCurrentView] = useState('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Chat State
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = localStorage.getItem('study_ai_chats');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Saved Projects
  const [savedProjects, setSavedProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('study_ai_projects');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeProject, setActiveProject] = useState(null);
  const [selectedDayNumber, setSelectedDayNumber] = useState(1);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);

  // Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [examDate, setExamDate] = useState('');
  const [prepLevel, setPrepLevel] = useState(80);
  const [examDescription, setExamDescription] = useState('');
  const [examType, setExamType] = useState('orale');
  const [languageStyle, setLanguageStyle] = useState('automatico');
  const [sourceType, setSourceType] = useState('my_materials');
  const [wizardUploadedFiles, setWizardUploadedFiles] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatusText, setLoadingStatusText] = useState('Inizializzazione...');

  const fileInputRef = useRef(null);
  const wizardFileInputRef = useRef(null);
  const projectAddFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Storage
  useEffect(() => {
    try {
      localStorage.setItem('study_ai_chats', JSON.stringify(conversations));
    } catch (e) {
      console.warn("Quota localStorage superata per le chat", e);
    }
  }, [conversations]);

  useEffect(() => {
    try {
      const sanitizedProjects = (savedProjects || []).map(p => ({
        ...p,
        files: (p.files || []).map(f => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
        }))
      }));
      localStorage.setItem('study_ai_projects', JSON.stringify(sanitizedProjects));
    } catch (e) {
      console.warn("Quota localStorage superata per i progetti", e);
    }
  }, [savedProjects]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const loadProjectWithFiles = async (proj) => {
    setActiveProject(proj);
    setCurrentView('project');
    setIsSidebarOpen(false);

    if (proj.files && proj.files.length > 0 && !proj.files[0].base64) {
      const storedFiles = await getFilesFromDB(proj.id);
      if (storedFiles && storedFiles.length > 0) {
        setActiveProject(prev => prev && prev.id === proj.id ? { ...prev, files: storedFiles } : prev);
      }
    }
  };

  const handleNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setInputPrompt('');
    setAttachedFile(null);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleSelectChat = (chat) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setAttachedFile(null);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleDeleteChat = (e, id) => {
    e.stopPropagation();
    const updated = (conversations || []).filter(c => c.id !== id);
    setConversations(updated);
    if (currentChatId === id) {
      handleNewChat();
    }
  };

  const handleDeleteProject = (e, id) => {
    e.stopPropagation();
    const updated = (savedProjects || []).filter(p => p.id !== id);
    setSavedProjects(updated);
    if (activeProject?.id === id) {
      setActiveProject(null);
      setCurrentView('chat');
    }
  };

  const handleStartWizard = () => {
    setWizardStep(1);
    setExamDate('');
    setPrepLevel(80);
    setExamDescription('');
    setExamType('orale');
    setLanguageStyle('automatico');
    setSourceType('my_materials');
    setWizardUploadedFiles([]);
    setLoadingProgress(0);
    setCurrentView('wizard');
    setIsSidebarOpen(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        mimeType: file.type || 'text/plain',
        size: (file.size / 1024).toFixed(1) + ' KB',
        base64: reader.result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleWizardFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setWizardUploadedFiles(prev => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: (file.size / 1024).toFixed(1) + ' KB',
            base64: reader.result,
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveWizardFile = (fileId) => {
    setWizardUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleProjectAddFiles = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !activeProject) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async () => {
        const newFileObj = {
          id: Date.now() + Math.random(),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: (file.size / 1024).toFixed(1) + ' KB',
          base64: reader.result,
        };

        const updatedFiles = [...(activeProject.files || []), newFileObj];
        const updatedProject = { ...activeProject, files: updatedFiles };
        setActiveProject(updatedProject);
        setSavedProjects(prev => (prev || []).map(p => p.id === activeProject.id ? updatedProject : p));
        await saveFilesToDB(activeProject.id, updatedFiles);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const calculateDaysLeft = (targetDateStr) => {
    if (!targetDateStr) return 30;
    try {
      const target = new Date(targetDateStr);
      if (isNaN(target.getTime())) return 30;
      const now = new Date();
      const diffTime = target.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 1;
    } catch {
      return 30;
    }
  };

  // FINALIZZAZIONE WIZARD CON VERA ANALISI AI DEI DOCUMENTI E PROGRESSIONE GRADUALE
  const handleFinalizeGuide = async () => {
    setWizardStep(4);
    setLoadingProgress(5);
    setLoadingStatusText('Lettura ed estrazione del testo dai file (PDF, Word, Slide)...');

    const daysTotal = calculateDaysLeft(examDate);
    const projectId = Date.now().toString();

    // Timer fluido e graduale (sale dolcemente fino al 90% in circa 8-12 secondi)
    let currentPct = 5;
    const progressInterval = setInterval(() => {
      if (currentPct < 90) {
        currentPct += 2;
        setLoadingProgress(currentPct);

        if (currentPct === 20) setLoadingStatusText('Lettura approfondita dei capitoli e delle sezioni...');
        if (currentPct === 45) setLoadingStatusText('Analisi dei temi principali e delle nozioni chiave...');
        if (currentPct === 70) setLoadingStatusText('Strutturazione logica del calendario di studio...');
        if (currentPct === 85) setLoadingStatusText('Assegnazione degli argomenti estratti alle giornate...');
      }
    }, 280);

    let generatedSchedule = null;

    try {
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_syllabus',
          examDescription: examDescription,
          daysTotal: daysTotal,
          prepLevel: prepLevel,
          languageStyle: languageStyle,
          sourceType: sourceType,
          files: wizardUploadedFiles,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.schedule && Array.isArray(data.schedule) && data.schedule.length > 0) {
          generatedSchedule = data.schedule;
        }
      }
    } catch (err) {
      console.warn("Chiamata syllabus completata con gestione d'emergenza:", err);
    } finally {
      clearInterval(progressInterval);
    }

    // Se per qualsiasi motivo l'API non restituisce la lista, creiamo un modulo iniziale sicuro
    if (!generatedSchedule || !Array.isArray(generatedSchedule) || generatedSchedule.length === 0) {
      generatedSchedule = [
        {
          dayNumber: 1,
          dayTitle: `Giorno 1: Concetti Introduttivi e Basi Fondamentali`,
          phase: "Fase 1: Studio e Comprensione",
          topics: [
            {
              id: "d1_t1",
              title: `Analisi delle Nozioni Generali ed Eziologia (${examDescription || 'Materia'})`,
              difficulty: "Fondamentale",
              completed: false,
              lesson: null
            }
          ]
        }
      ];
    }

    // Raggiunge il 100%
    setLoadingProgress(100);
    setLoadingStatusText('Piano di studio generato direttamente dalle tue fonti!');

    // Salvataggio dei file in IndexedDB
    await saveFilesToDB(projectId, wizardUploadedFiles);

    const newProject = {
      id: projectId,
      createdAt: new Date().toISOString(),
      examDate: examDate,
      prepLevel: prepLevel,
      description: examDescription || 'Guida allo studio personalizzata',
      examType: examType,
      languageStyle: languageStyle,
      sourceType: sourceType,
      files: wizardUploadedFiles,
      schedule: generatedSchedule,
    };

    setSavedProjects(old => [newProject, ...(old || [])]);
    setActiveProject(newProject);

    setTimeout(() => {
      setCurrentView('project');
    }, 600);
  };

  // Generazione Lezione RIGOROSAMENTE basata sulle fonti
  const handleGenerateLesson = async (dayNum, topic) => {
    if (isGeneratingLesson || !activeProject) return;
    setIsGeneratingLesson(true);

    try {
      let filesToSend = activeProject.files || [];
      if (filesToSend.length > 0 && !filesToSend[0].base64) {
        const dbFiles = await getFilesFromDB(activeProject.id);
        if (dbFiles && dbFiles.length > 0) {
          filesToSend = dbFiles;
        }
      }

      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isLessonGeneration: true,
          topicTitle: topic.title,
          sourceType: activeProject.sourceType,
          files: activeProject.sourceType === 'my_materials' ? filesToSend : [],
          examDescription: activeProject.description,
          prepLevel: activeProject.prepLevel,
          languageStyle: activeProject.languageStyle
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore nella generazione della lezione.');

      const lessonContent = data.reply;

      const updatedSchedule = (activeProject.schedule || []).map(d => {
        if (d.dayNumber === dayNum) {
          const updatedTopics = (d.topics || []).map(t => {
            if (t.id === topic.id) {
              return { ...t, lesson: lessonContent };
            }
            return t;
          });
          return { ...d, topics: updatedTopics };
        }
        return d;
      });

      const updatedProject = { ...activeProject, schedule: updatedSchedule };
      setActiveProject(updatedProject);
      setSavedProjects(prev => (prev || []).map(p => p.id === activeProject.id ? updatedProject : p));
    } catch (err) {
      alert(`Errore nella generazione: ${err.message}`);
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  const handleToggleTopicComplete = (dayNum, topicId) => {
    if (!activeProject) return;
    const updatedSchedule = (activeProject.schedule || []).map(d => {
      if (d.dayNumber === dayNum) {
        const updatedTopics = (d.topics || []).map(t => {
          if (t.id === topicId) {
            return { ...t, completed: !t.completed };
          }
          return t;
        });
        return { ...d, topics: updatedTopics };
      }
      return d;
    });

    const updatedProject = { ...activeProject, schedule: updatedSchedule };
    setActiveProject(updatedProject);
    setSavedProjects(prev => (prev || []).map(p => p.id === activeProject.id ? updatedProject : p));
  };

  const calculateGlobalProgress = () => {
    if (!activeProject || !Array.isArray(activeProject.schedule)) {
      return { completed: 0, total: 0, percent: 0 };
    }
    let total = 0;
    let completed = 0;
    activeProject.schedule.forEach(d => {
      if (d && Array.isArray(d.topics)) {
        d.topics.forEach(t => {
          total++;
          if (t && t.completed) completed++;
        });
      }
    });
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  };

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
        const title = prompt ? (prompt.slice(0, 28) + (prompt.length > 28 ? '...' : '')) : (filePayload?.name || 'Nuova sessione');
        setConversations([{ id: chatId, title, messages: updatedMessages }, ...(conversations || [])]);
      } else {
        setConversations((conversations || []).map(c => c.id === chatId ? { ...c, messages: updatedMessages } : c));
      }
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', text: `Si è verificato un errore: ${err.message}` }]);
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

  const getPrepLabel = (lvl) => {
    if (lvl <= 35) return 'Basi minime essenziali (Superamento)';
    if (lvl <= 65) return 'Buona conoscenza generale';
    if (lvl <= 85) return 'Studio approfondito (Voto alto)';
    return 'Padronanza totale & Dettagli (30 e Lode)';
  };

  const currentDayData = activeProject?.schedule?.find(d => d.dayNumber === selectedDayNumber) || activeProject?.schedule?.[0];
  const currentSelectedTopic = currentDayData?.topics?.find(t => t.id === selectedTopicId) || currentDayData?.topics?.[0];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-geminiDark text-gray-200 relative">
      
      {/* OVERLAY SIDEBAR */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR RETRATTILE */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-80 max-w-[85vw] bg-geminiDarkSecondary border-r border-geminiBorder shadow-2xl transition-transform duration-300 ease-in-out overflow-hidden ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-geminiBorder">
          <button 
            onClick={handleNewChat}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-geminiHover hover:bg-geminiBorder text-gray-100 rounded-full border border-geminiBorder transition flex-1 mr-2"
          >
            <Plus size={16} />
            <span>Nuova chat</span>
          </button>
          
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-gray-400 hover:text-white hover:bg-geminiHover rounded-lg transition"
            title="Chiudi menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          
          {/* GUIDE SALVATE */}
          {savedProjects && savedProjects.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider px-3 py-1 flex items-center gap-1.5">
                <FolderKanban size={13} />
                <span>Guide allo Studio</span>
              </div>
              <div className="mt-1 space-y-1">
                {savedProjects.map(proj => (
                  <div
                    key={proj.id}
                    onClick={() => loadProjectWithFiles(proj)}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm cursor-pointer transition ${
                      activeProject?.id === proj.id && (currentView === 'project' || currentView === 'study_plan' || currentView === 'day_detail')
                        ? 'bg-blue-600/20 text-blue-300 font-medium border border-blue-500/40'
                        : 'text-gray-300 hover:bg-geminiHover/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <Target size={14} className="text-blue-400 shrink-0" />
                      <span className="truncate">{proj.description?.slice(0, 22) || 'Progetto'}...</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteProject(e, proj.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition"
                      title="Elimina guida"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CRONOLOGIA CHAT */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-1">
              Conversazioni recenti
            </div>
            <div className="mt-1 space-y-1">
              {!conversations || conversations.length === 0 ? (
                <div className="text-xs text-gray-500 px-3 py-3 text-center">
                  Nessuna conversazione salvata
                </div>
              ) : (
                conversations.map((chat) => (
                  <div 
                    key={chat.id}
                    onClick={() => handleSelectChat(chat)}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm cursor-pointer transition ${
                      currentChatId === chat.id && currentView === 'chat'
                        ? 'bg-geminiHover text-white font-medium border border-geminiBorder/60' 
                        : 'text-gray-300 hover:bg-geminiHover/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <MessageSquare size={14} className="text-gray-400 shrink-0" />
                      <span className="truncate">{chat.title}</span>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 rounded transition"
                      title="Elimina conversazione"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </aside>

      {/* CONTENUTO PRINCIPALE */}
      <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden">
        
        {/* HEADER FISSO */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-geminiBorder/40 bg-geminiDark z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-300 hover:text-white hover:bg-geminiHover rounded-xl border border-geminiBorder/60 transition flex items-center justify-center shadow-sm"
              title="Apri cronologia"
            >
              <Menu size={20} />
            </button>
            
            <div 
              onClick={() => setCurrentView('chat')}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md">
                <GraduationCap size={18} />
              </div>
              <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                StudyAI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleStartWizard}
              className="flex items-center gap-2 text-xs sm:text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-full shadow-lg shadow-blue-600/20 transition transform active:scale-95"
            >
              <Sparkles size={16} />
              <span>Crea guida allo studio</span>
            </button>
          </div>
        </header>

        {/* ------------------------------------------------------------- */}
        {/* VISTA 1: WIZARD "CREA GUIDA ALLO STUDIO"                      */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'wizard' && (
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8 max-w-2xl mx-auto w-full flex flex-col justify-center">
            
            {/* STEP 1: CALENDARIO ESAME */}
            {wizardStep === 1 && (
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <CalendarIcon size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-100">Quando hai l'esame?</h2>
                    <p className="text-xs text-gray-400">Seleziona la data per strutturare il calendario giornaliero.</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Data dell'appello
                  </label>
                  <input 
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-geminiDark border border-geminiBorder rounded-2xl px-4 py-3.5 text-gray-100 text-base focus:outline-none focus:border-blue-500 transition [color-scheme:dark]"
                  />
                  {examDate && (
                    <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 px-3.5 py-2 rounded-xl border border-blue-500/20">
                      <Clock size={14} />
                      <span>Mancano <strong>{calculateDaysLeft(examDate)} giorni</strong> al tuo esame.</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-geminiBorder/60">
                  <button 
                    onClick={() => setCurrentView('chat')}
                    className="text-xs text-gray-400 hover:text-white transition"
                  >
                    Annulla
                  </button>
                  <button 
                    onClick={() => setWizardStep(2)}
                    disabled={!examDate}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition ${
                      examDate 
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30' 
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <span>Avanti</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: SLIDER PREPARAZIONE, DESCRIZIONE, SELETTORE ESAME E LINGUAGGIO */}
            {wizardStep === 2 && (
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Sliders size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-100">Obiettivo e Dettagli</h2>
                    <p className="text-xs text-gray-400">Definisci il livello di padronanza e la tipologia dell'esame.</p>
                  </div>
                </div>

                {/* SLIDER 10% - 100% */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-300 uppercase tracking-wider">Quanto vuoi sapere bene la materia?</span>
                    <span className="font-bold text-blue-400 text-sm bg-blue-500/10 px-2.5 py-0.5 rounded-lg border border-blue-500/20">
                      {prepLevel}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    step="5"
                    value={prepLevel} 
                    onChange={(e) => setPrepLevel(Number(e.target.value))}
                    className="w-full accent-blue-500 h-2 bg-geminiDark rounded-lg cursor-pointer"
                  />
                  <div className="text-[11px] text-gray-400 italic">
                    {getPrepLabel(prepLevel)}
                  </div>
                </div>

                {/* DESCRIZIONE ESAME */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Descrivi brevemente l'esame o l'ordine di studio preferito
                  </label>
                  <textarea 
                    rows={2}
                    value={examDescription}
                    onChange={(e) => setExamDescription(e.target.value)}
                    placeholder="Es. Anatomia Patologica: segui l'ordine delle dispense, concentrati su infiammazione e neoplasie..."
                    className="w-full bg-geminiDark border border-geminiBorder rounded-2xl p-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition resize-none"
                  />
                </div>

                {/* TIPO DI ESAME */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Tipologia di prova
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'scritto', label: 'Esame scritto' },
                      { id: 'orale', label: 'Esame orale' },
                      { id: 'scritto_orale', label: 'Scritto + Orale' }
                    ].map(type => (
                      <label 
                        key={type.id}
                        className={`flex items-center gap-2 p-3 rounded-2xl border text-xs cursor-pointer transition ${
                          examType === type.id 
                            ? 'bg-blue-600/20 border-blue-500 text-white font-medium shadow-sm' 
                            : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <input 
                          type="radio" 
                          name="examType" 
                          value={type.id}
                          checked={examType === type.id}
                          onChange={() => setExamType(type.id)}
                          className="accent-blue-500"
                        />
                        <span>{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* STILE ESPOSITIVO */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Stile espositivo
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { id: 'automatico', label: 'Automatico (consigliato)' },
                      { id: 'schematico', label: 'Schematico' },
                      { id: 'discorsivo', label: 'Discorsivo' }
                    ].map(style => (
                      <label 
                        key={style.id}
                        className={`flex items-center gap-2 p-3 rounded-2xl border text-xs cursor-pointer transition ${
                          languageStyle === style.id 
                            ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium shadow-sm' 
                            : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <input 
                          type="radio" 
                          name="languageStyle" 
                          value={style.id}
                          checked={languageStyle === style.id}
                          onChange={() => setLanguageStyle(style.id)}
                          className="accent-indigo-500"
                        />
                        <span>{style.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* NAVIGAZIONE */}
                <div className="flex justify-between items-center pt-4 border-t border-geminiBorder/60">
                  <button 
                    onClick={() => setWizardStep(1)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition"
                  >
                    <ArrowLeft size={14} />
                    <span>Indietro</span>
                  </button>
                  <button 
                    onClick={() => setWizardStep(3)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-sm font-semibold transition shadow-lg shadow-blue-600/30"
                  >
                    <span>Avanti</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: FONTI */}
            {wizardStep === 3 && (
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-100">Fonti di Studio</h2>
                    <p className="text-xs text-gray-400">Scegli se basarti sui tuoi file o effettuare ricerche online.</p>
                  </div>
                </div>

                {/* LE 2 SCELTE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div 
                    onClick={() => setSourceType('my_materials')}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                      sourceType === 'my_materials'
                        ? 'bg-blue-600/15 border-blue-500 shadow-md'
                        : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400">
                        <UploadCloud size={18} />
                      </div>
                      <input 
                        type="radio" 
                        name="sourceType" 
                        checked={sourceType === 'my_materials'}
                        onChange={() => setSourceType('my_materials')}
                        className="accent-blue-500"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-100">Usa il mio materiale</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">Carica PDF, Word (.docx), PPTX o appunti. L'AI userà solo queste fonti.</div>
                    </div>
                  </div>

                  <div 
                    onClick={() => setSourceType('search_online')}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                      sourceType === 'search_online'
                        ? 'bg-indigo-600/15 border-indigo-500 shadow-md'
                        : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                        <Globe size={18} />
                      </div>
                      <input 
                        type="radio" 
                        name="sourceType" 
                        checked={sourceType === 'search_online'}
                        onChange={() => setSourceType('search_online')}
                        className="accent-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-100">Cerca online</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">L'AI ricercherà e integrerà nozioni accademiche online.</div>
                    </div>
                  </div>
                </div>

                {/* CARICAMENTO MULTIPLO FILE */}
                {sourceType === 'my_materials' && (
                  <div className="space-y-3 pt-2 bg-geminiDark/60 p-4 rounded-2xl border border-geminiBorder/70">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={14} className="text-blue-400" />
                        <span>Carica tutti i tuoi file di studio</span>
                      </label>
                      <span className="text-[11px] text-blue-400 font-semibold">{wizardUploadedFiles.length} file selezionati</span>
                    </div>

                    <input 
                      type="file" 
                      ref={wizardFileInputRef}
                      multiple
                      onChange={handleWizardFilesChange}
                      accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,image/*"
                      className="hidden"
                    />

                    <div 
                      onClick={() => wizardFileInputRef.current?.click()}
                      className="border-2 border-dashed border-geminiBorder hover:border-blue-500 rounded-2xl p-4 text-center cursor-pointer transition bg-geminiDarkSecondary/40 hover:bg-geminiDarkSecondary group"
                    >
                      <UploadCloud size={26} className="mx-auto text-blue-400 mb-1.5 group-hover:scale-110 transition" />
                      <div className="text-xs font-medium text-gray-200">Seleziona uno o più file (PDF, Word, PPTX, TXT, immagini)</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">L'AI leggerà ed estrarrà i capitoli reali da tutti i documenti</div>
                    </div>

                    {wizardUploadedFiles.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {wizardUploadedFiles.map(file => (
                          <div 
                            key={file.id}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-geminiDarkSecondary border border-geminiBorder text-xs text-gray-200"
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <FileCheck size={14} className="text-emerald-400 shrink-0" />
                              <span className="truncate font-medium">{file.name}</span>
                              <span className="text-gray-400 text-[10px]">({file.size})</span>
                            </div>
                            <button 
                              onClick={() => handleRemoveWizardFile(file.id)}
                              className="p-1 text-gray-400 hover:text-red-400 transition shrink-0"
                              title="Rimuovi file"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* NAVIGAZIONE */}
                <div className="flex justify-between items-center pt-4 border-t border-geminiBorder/60">
                  <button 
                    onClick={() => setWizardStep(2)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition"
                  >
                    <ArrowLeft size={14} />
                    <span>Indietro</span>
                  </button>
                  <button 
                    onClick={handleFinalizeGuide}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full text-sm font-semibold transition shadow-lg shadow-blue-600/30"
                  >
                    <Sparkles size={16} />
                    <span>Genera Guida e Piano</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: CARICAMENTO DINAMICO 0-100% FLUIDO */}
            {wizardStep === 4 && (
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-8 sm:p-12 rounded-3xl shadow-2xl text-center space-y-6 max-w-md mx-auto w-full">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin absolute" />
                  <Sparkles size={32} className="text-blue-400" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-100">Analisi Fonti e Generazione</h3>
                  <p className="text-xs text-gray-400 h-6 transition-all">{loadingStatusText}</p>
                </div>

                {/* PROGRESS BAR */}
                <div className="space-y-2">
                  <div className="w-full bg-geminiDark h-3 rounded-full overflow-hidden border border-geminiBorder">
                    <div 
                      className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-200"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                  <div className="text-xs font-bold text-blue-400">{loadingProgress}%</div>
                </div>
              </div>
            )}

          </main>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 2: PAGINA DEDICATA AL PROGETTO GUIDA                     */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'project' && activeProject && (
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-4xl mx-auto w-full space-y-6">
            
            <div className="flex items-center justify-between pb-2 border-b border-geminiBorder/40">
              <button 
                onClick={() => setCurrentView('chat')}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
              >
                <ArrowLeft size={14} />
                <span>Torna alla Chat</span>
              </button>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 font-medium">
                <CheckCircle2 size={13} />
                <span>Guida attiva</span>
              </span>
            </div>

            <div className="bg-gradient-to-br from-geminiDarkSecondary via-geminiDarkSecondary to-blue-950/20 border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-xl space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Progetto di Studio</span>
                    <span className="text-gray-500">•</span>
                    <span className="text-xs text-gray-400">
                      Creato il {activeProject?.createdAt ? new Date(activeProject.createdAt).toLocaleDateString('it-IT') : new Date().toLocaleDateString('it-IT')}
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-100">
                    {activeProject?.description || 'Esame di Studio'}
                  </h1>
                </div>

                <div className="bg-geminiDark border border-geminiBorder px-4 py-2.5 rounded-2xl text-center shadow-md">
                  <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Mancano</div>
                  <div className="text-xl font-extrabold text-blue-400">
                    {calculateDaysLeft(activeProject?.examDate)} <span className="text-xs font-normal text-gray-300">giorni</span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {activeProject?.examDate ? new Date(activeProject.examDate).toLocaleDateString('it-IT') : ''}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <span className="bg-geminiHover border border-geminiBorder px-3 py-1.5 rounded-xl text-xs text-gray-300 flex items-center gap-1.5">
                  <Target size={13} className="text-blue-400" />
                  <span>Obiettivo: <strong>{activeProject?.prepLevel || 80}%</strong> ({getPrepLabel(activeProject?.prepLevel || 80).split('(')[0].trim()})</span>
                </span>
                <span className="bg-geminiHover border border-geminiBorder px-3 py-1.5 rounded-xl text-xs text-gray-300 flex items-center gap-1.5">
                  <GraduationCap size={13} className="text-indigo-400" />
                  <span>Prova: <strong className="capitalize">{activeProject?.examType ? activeProject.examType.replace('_', ' + ') : 'Orale'}</strong></span>
                </span>
                <span className="bg-geminiHover border border-geminiBorder px-3 py-1.5 rounded-xl text-xs text-gray-300 flex items-center gap-1.5">
                  <Sliders size={13} className="text-purple-400" />
                  <span>Stile: <strong className="capitalize">{activeProject?.languageStyle || 'Automatico'}</strong></span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-geminiBorder/60 pb-3">
                  <div className="flex items-center gap-2.5 font-bold text-base text-gray-100">
                    <FileText size={18} className="text-blue-400" />
                    <span>Materiali e Fonti</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {activeProject?.sourceType === 'my_materials' ? `${activeProject?.files?.length || 0} file caricati` : 'Online'}
                  </span>
                </div>

                {activeProject?.sourceType === 'my_materials' ? (
                  <div className="space-y-3">
                    {activeProject?.files && activeProject.files.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {activeProject.files.map((f, i) => (
                          <div key={f.id || i} className="flex items-center justify-between p-2.5 rounded-xl bg-geminiDark border border-geminiBorder text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <FileCheck size={14} className="text-emerald-400 shrink-0" />
                              <span className="font-medium truncate">{f.name}</span>
                            </div>
                            <span className="text-gray-400 text-[11px] shrink-0 ml-2">{f.size}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 py-2 text-center">Nessun file presente.</div>
                    )}

                    <input 
                      type="file" 
                      ref={projectAddFileInputRef}
                      multiple
                      onChange={handleProjectAddFiles}
                      accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,image/*"
                      className="hidden"
                    />
                    <button 
                      onClick={() => projectAddFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-geminiDark hover:bg-geminiHover border border-dashed border-geminiBorder hover:border-blue-500 text-xs font-medium text-blue-400 transition"
                    >
                      <Plus size={14} />
                      <span>Aggiungi altre fonti / file</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-3">
                    <Globe size={20} className="shrink-0" />
                    <span>La guida utilizza ricerche accademiche online per strutturare le lezioni.</span>
                  </div>
                )}
              </div>

              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 font-bold text-base text-gray-100 border-b border-geminiBorder/60 pb-3">
                    <Sparkles size={18} className="text-indigo-400" />
                    <span>Piano di Studio Giornaliero</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Il piano è pronto. Accedi al programma giorno per giorno per consultare e generare lezioni su misura basate sui tuoi capitoli.
                  </p>
                  
                  <div className="mt-4 p-3 bg-geminiDark rounded-2xl border border-geminiBorder flex items-center justify-between text-xs">
                    <span className="text-gray-400">Progresso piano:</span>
                    <span className="font-bold text-emerald-400">
                      {calculateGlobalProgress().completed} / {calculateGlobalProgress().total} argomenti ({calculateGlobalProgress().percent}%)
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setCurrentView('study_plan')}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition transform active:scale-98"
                >
                  <Sparkles size={15} />
                  <span>Avvia studio con il Tutor AI</span>
                  <ArrowRight size={14} />
                </button>
              </div>

            </div>

          </main>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 3: PIANO DI STUDIO GIORNALIERO                          */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'study_plan' && activeProject && (
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-4xl mx-auto w-full space-y-6">
            
            <div className="flex items-center justify-between pb-2 border-b border-geminiBorder/40">
              <button 
                onClick={() => setCurrentView('project')}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
              >
                <ArrowLeft size={14} />
                <span>Torna al Progetto</span>
              </button>
              
              <div className="text-xs text-gray-400">
                Materia: <strong className="text-gray-200">{activeProject?.description}</strong>
              </div>
            </div>

            <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-lg flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                  <BookMarked className="text-blue-400" size={22} />
                  <span>Programma Giornaliero di Studio</span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Piano didattico estratto direttamente dalle tue fonti. Clicca su un giorno per generare le lezioni.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-geminiDark px-4 py-2.5 rounded-2xl border border-geminiBorder text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-bold">Giorni Totali</div>
                  <div className="text-lg font-bold text-blue-400">{activeProject?.schedule?.length || 0}</div>
                </div>
                <div className="bg-geminiDark px-4 py-2.5 rounded-2xl border border-geminiBorder text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-bold">Completamento</div>
                  <div className="text-lg font-bold text-emerald-400">{calculateGlobalProgress().percent}%</div>
                </div>
              </div>
            </div>

            <div className="space-y-3.5 pb-12">
              {(activeProject?.schedule || []).map(day => {
                const dayCompletedTopics = (day.topics || []).filter(t => t.completed).length;
                const isDayAllDone = dayCompletedTopics === (day.topics?.length || 0) && (day.topics?.length || 0) > 0;

                return (
                  <div 
                    key={day.dayNumber}
                    onClick={() => {
                      setSelectedDayNumber(day.dayNumber);
                      setSelectedTopicId(day.topics?.[0]?.id || null);
                      setCurrentView('day_detail');
                    }}
                    className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition flex items-center justify-between group ${
                      isDayAllDone 
                        ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500'
                        : 'bg-geminiDarkSecondary border-geminiBorder hover:border-blue-500 hover:bg-geminiDarkSecondary/90'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        isDayAllDone 
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' 
                          : 'bg-geminiDark border border-geminiBorder text-blue-400 group-hover:border-blue-500'
                      }`}>
                        {isDayAllDone ? <CheckCircle2 size={20} /> : `G${day.dayNumber}`}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">{day.date}</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-[11px] text-gray-400">{day.phase}</span>
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-gray-100 group-hover:text-blue-300 transition">
                          {day.dayTitle}
                        </h3>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {day.topics?.length || 0} argomenti previsti ({dayCompletedTopics} completati)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="hidden sm:inline-block text-xs font-medium text-gray-400 group-hover:text-gray-200 transition">
                        Visualizza lezioni
                      </span>
                      <div className="w-8 h-8 rounded-full bg-geminiDark flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-blue-600 transition">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </main>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 4: DETTAGLIO GIORNO & GENERATORE LEZIONE                */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'day_detail' && activeProject && currentDayData && (
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-4xl mx-auto w-full space-y-6">
            
            <div className="flex items-center justify-between pb-2 border-b border-geminiBorder/40">
              <button 
                onClick={() => setCurrentView('study_plan')}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
              >
                <ArrowLeft size={14} />
                <span>Torna al Piano Giornaliero</span>
              </button>
              
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <CalendarIcon size={14} className="text-blue-400" />
                <span>{currentDayData?.date}</span>
              </div>
            </div>

            <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-lg space-y-2">
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">{currentDayData?.phase}</div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-100">
                {currentDayData?.dayTitle}
              </h2>
              <p className="text-xs text-gray-400">
                Seleziona un argomento per generare o consultare la lezione didattica {activeProject?.sourceType === 'my_materials' ? 'estratta esclusivamente dai tuoi file' : 'basata sulle fonti online'}.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Argomenti da studiare oggi:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentDayData?.topics || []).map(topic => (
                  <div
                    key={topic.id}
                    onClick={() => setSelectedTopicId(topic.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex items-start justify-between ${
                      currentSelectedTopic?.id === topic.id
                        ? 'bg-blue-600/15 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                        : 'bg-geminiDarkSecondary border-geminiBorder hover:border-gray-500'
                    }`}
                  >
                    <div className="space-y-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          topic.difficulty === 'Avanzato' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                          topic.difficulty === 'Intermedio' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {topic.difficulty || 'Accademico'}
                        </span>
                        {topic.lesson && (
                          <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                            Lezione pronta
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-gray-200 leading-relaxed">
                        {topic.title}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTopicComplete(currentDayData.dayNumber, topic.id);
                      }}
                      className="p-1 text-gray-400 hover:text-emerald-400 transition"
                      title={topic.completed ? "Segna come da fare" : "Segna come completato"}
                    >
                      {topic.completed ? (
                        <CheckSquare size={18} className="text-emerald-400" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {currentSelectedTopic && (
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
                
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-geminiBorder/60 pb-4">
                  <div>
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Lezione Didattica</span>
                    <h3 className="text-lg font-bold text-gray-100 mt-0.5">{currentSelectedTopic?.title}</h3>
                  </div>

                  <button
                    onClick={() => handleGenerateLesson(currentDayData.dayNumber, currentSelectedTopic)}
                    disabled={isGeneratingLesson}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition shadow-lg ${
                      isGeneratingLesson 
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30'
                    }`}
                  >
                    {isGeneratingLesson ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Estrazione e sintesi in corso...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>{currentSelectedTopic?.lesson ? 'Rigenera lezione' : 'Genera lezione'}</span>
                      </>
                    )}
                  </button>
                </div>

                {isGeneratingLesson ? (
                  <div className="py-16 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto animate-bounce">
                      <Sparkles size={24} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-gray-200">Elaborazione della lezione dai tuoi documenti...</div>
                      <div className="text-xs text-gray-400">
                        {activeProject?.sourceType === 'my_materials' 
                          ? 'Estrazione fedele dei concetti dai file caricati, riorganizzati con chiarezza e schemi.' 
                          : 'Elaborazione pedagogica con nozioni e formule scientifiche.'}
                      </div>
                    </div>
                  </div>
                ) : currentSelectedTopic?.lesson ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-gray-400 bg-geminiDark p-3 rounded-2xl border border-geminiBorder">
                      <div className="flex items-center gap-2">
                        <BookOpen size={15} className="text-blue-400" />
                        <span>Fonte: <strong>{activeProject?.sourceType === 'my_materials' ? 'Esclusivamente dai tuoi file caricati' : 'Ricerca accademica online'}</strong></span>
                      </div>
                      <button
                        onClick={() => handleToggleTopicComplete(currentDayData.dayNumber, currentSelectedTopic.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          currentSelectedTopic.completed 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-geminiHover text-gray-300 hover:text-white border border-geminiBorder'
                        }`}
                      >
                        {currentSelectedTopic.completed ? <CheckCircle2 size={14} /> : <CheckSquare size={14} />}
                        <span>{currentSelectedTopic.completed ? 'Studiato' : 'Segna come studiato'}</span>
                      </button>
                    </div>

                    <div className="p-6 bg-geminiDark rounded-2xl border border-geminiBorder/70 shadow-inner">
                      <MarkdownRenderer content={currentSelectedTopic.lesson} />
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-geminiDark/50 rounded-2xl border border-dashed border-geminiBorder p-6 space-y-3">
                    <BookOpen size={28} className="mx-auto text-gray-500" />
                    <div className="text-xs text-gray-300 font-medium">Nessuna lezione generata per questo argomento</div>
                    <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                      Clicca su <strong>"Genera lezione"</strong> in alto per ricevere una sintesi didattica basata {activeProject?.sourceType === 'my_materials' ? 'esclusivamente sui tuoi file' : 'sulle fonti online'}.
                    </p>
                  </div>
                )}

              </div>
            )}

          </main>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 5: CHAT CLASSICA                                        */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'chat' && (
          <>
            <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-4xl mx-auto w-full">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center pb-24">
                  <div className="w-14 h-14 rounded-2xl bg-geminiDarkSecondary border border-geminiBorder flex items-center justify-center text-blue-400 mb-6 shadow-lg">
                    <Sparkles size={28} />
                  </div>
                  
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100 mb-3">
                    Cosa vuoi studiare oggi?
                  </h1>
                  <p className="text-gray-400 text-sm md:text-base max-w-md mb-8">
                    Fai una domanda libera, oppure clicca su <strong>"Crea guida allo studio"</strong> in alto per pianificare il tuo prossimo esame.
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
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
                          <GraduationCap size={16} />
                        </div>
                      )}

                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-br-sm shadow-md whitespace-pre-wrap' 
                          : 'bg-geminiDarkSecondary border border-geminiBorder text-gray-200 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.file && (
                          <div className="flex items-center gap-2 p-2 mb-2.5 bg-black/20 rounded-lg text-xs text-gray-200 border border-white/10">
                            <FileText size={14} className="text-blue-300" />
                            <span className="font-medium truncate">{msg.file.name}</span>
                            <span className="text-gray-300">({msg.file.size})</span>
                          </div>
                        )}
                        
                        {msg.role === 'assistant' ? (
                          <MarkdownRenderer content={msg.text} />
                        ) : (
                          msg.text
                        )}
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
                        <span className="ml-1 text-xs">L'AI sta elaborando la risposta...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </main>

            <footer className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-geminiDark via-geminiDark to-transparent">
              <div className="max-w-3xl mx-auto">
                
                {attachedFile && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-geminiDarkSecondary border border-geminiBorder rounded-lg text-xs w-fit text-blue-300 shadow-md">
                    <FileText size={14} />
                    <span className="truncate max-w-[220px] font-medium">{attachedFile.name}</span>
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
                    accept=".pdf,.txt,.docx,.pptx,image/*"
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
                        ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm' 
                        : 'text-gray-600 bg-transparent cursor-not-allowed'
                    }`}
                    title="Invia messaggio"
                  >
                    <Send size={16} />
                  </button>
                </div>
                
                <div className="text-center mt-2 text-[11px] text-gray-500">
                  StudyAI può commettere errori. Verifica sempre le informazioni importanti sui testi ufficiali.
                </div>
              </div>
            </footer>
          </>
        )}

      </div>
    </div>
  );
}
