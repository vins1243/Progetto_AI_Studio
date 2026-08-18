import React, { useState, useEffect, useRef, Component } from 'react';
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
  AlertTriangle,
  FileSearch,
  ShieldCheck,
  Check,
  Bot,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Type,
  Wand2,
  Undo2,
  CornerDownLeft
} from 'lucide-react';

// IndexedDB Helper
const DB_NAME = 'StudyAIDB_V5';
const STORE_NAME = 'project_data_store';

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

async function saveProjectDataToDB(projectId, data) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ projectId, ...data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB save error:", err);
  }
}

async function getProjectDataFromDB(projectId) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("IndexedDB get error:", err);
    return null;
  }
}

// Estrazione testo client-side nel browser
async function extractTextFromPdf(arrayBuffer) {
  if (typeof window === 'undefined' || !window.pdfjsLib) {
    throw new Error("Libreria PDF.js non pronta.");
  }
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 120);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    text += `\n[Pagina ${i}]: ` + pageText;
  }
  return { text: text.trim(), pagesCount: pdf.numPages };
}

async function extractTextFromDocx(arrayBuffer) {
  if (typeof window === 'undefined' || !window.mammoth) {
    throw new Error("Libreria Word non pronta.");
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return { text: result.value || '', pagesCount: 1 };
}

async function extractTextFromPptx(arrayBuffer) {
  if (typeof window === 'undefined' || !window.JSZip) {
    throw new Error("Libreria PPTX non pronta.");
  }
  const zip = await window.JSZip.loadAsync(arrayBuffer);
  let text = '';
  const slideFiles = [];
  zip.forEach((path, file) => {
    if (path.startsWith('ppt/slides/slide') && path.endsWith('.xml')) {
      slideFiles.push({ path, file });
    }
  });
  slideFiles.sort((a, b) => {
    const nA = parseInt(a.path.match(/\d+/) || '0');
    const nB = parseInt(b.path.match(/\d+/) || '0');
    return nA - nB;
  });
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await slideFiles[i].file.async('text');
    const matches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
    const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
    text += `\n[Slide ${i + 1}]: ${slideText}`;
  }
  return { text: text.trim(), pagesCount: slideFiles.length };
}

// Convertitore Markdown di base a HTML per visualizzazione modificabile WYSIWYG
function markdownToHtml(md) {
  if (!md) return '';
  let html = md;
  // Intestazioni
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  // Grassetto e Corsivo
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<b><i>$1</i></b>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/gim, '<i>$1</i>');
  // Elenchi puntati
  html = html.replace(/^\s*-\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul>\s*<ul>/gim, '');
  // Paragrafi e a capo
  html = html.replace(/\n\n/gim, '</p><p>');
  html = html.replace(/\n/gim, '<br/>');
  if (!html.startsWith('<h') && !html.startsWith('<p') && !html.startsWith('<ul')) {
    html = '<p>' + html + '</p>';
  }
  return html;
}

// Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-geminiDark text-gray-200 p-6 text-center">
          <div className="bg-geminiDarkSecondary border border-red-500/30 p-8 rounded-3xl max-w-md space-y-4 shadow-2xl">
            <AlertTriangle size={36} className="text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-gray-100">Si è verificato un problema</h2>
            <p className="text-xs text-gray-400">
              I tuoi dati sono al sicuro. Clicca qui sotto per ricaricare l'app.
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

export default function App() {
  return (
    <ErrorBoundary>
      <MainAppContent />
    </ErrorBoundary>
  );
}

function MainAppContent() {
  const [currentView, setCurrentView] = useState('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Chat Homepage
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

  // Projects
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

  // POPUP FLUTTUANTE SU SELEZIONE TESTO
  const [floatingPopup, setFloatingPopup] = useState(null); // { x, y, text }
  const [isRewriting, setIsRewriting] = useState(false);

  // CHATBOT DEDICATO ALLA LEZIONE CON MODIFICA DIRETTA
  const [lessonChatMessages, setLessonChatMessages] = useState([]);
  const [lessonChatInput, setLessonChatInput] = useState('');
  const [isLessonChatLoading, setIsLessonChatLoading] = useState(false);
  const [previousLessonBackup, setPreviousLessonBackup] = useState(null);

  // Toolbar state
  const [activeFont, setActiveFont] = useState('sans');
  const [activeFontSize, setActiveFontSize] = useState('15px');

  // Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [examDate, setExamDate] = useState('');
  const [prepLevel, setPrepLevel] = useState(80);
  const [examDescription, setExamDescription] = useState('');
  const [examType, setExamType] = useState('orale');
  const [languageStyle, setLanguageStyle] = useState('automatico');
  const [sourceType, setSourceType] = useState('my_materials');
  const [wizardUploadedFiles, setWizardUploadedFiles] = useState([]);
  const [extractingCount, setExtractingCount] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatusText, setLoadingStatusText] = useState('Inizializzazione...');

  const fileInputRef = useRef(null);
  const wizardFileInputRef = useRef(null);
  const projectAddFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lessonChatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const wysiwygEditorRef = useRef(null);

  // Sync Storage
  useEffect(() => {
    try {
      localStorage.setItem('study_ai_chats', JSON.stringify(conversations));
    } catch (e) {
      console.warn("Storage chat quota", e);
    }
  }, [conversations]);

  useEffect(() => {
    try {
      const sanitized = (savedProjects || []).map(p => ({
        ...p,
        files: (p.files || []).map(f => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          wordsCount: f.wordsCount || 0,
          pagesCount: f.pagesCount || 1,
          status: f.status || 'ready'
        }))
      }));
      localStorage.setItem('study_ai_projects', JSON.stringify(sanitized));
    } catch (e) {
      console.warn("Storage projects quota", e);
    }
  }, [savedProjects]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    lessonChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lessonChatMessages, isLessonChatLoading]);

  // Gestione selezione testo per far apparire automaticamente il popup fluttuante
  useEffect(() => {
    const handleSelectionChange = () => {
      if (currentView !== 'day_detail') return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        // Nessuna selezione attiva
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 3) {
        setFloatingPopup(null);
        return;
      }

      // Verifica che la selezione si trovi dentro l'editor WYSIWYG
      const editorEl = wysiwygEditorRef.current;
      if (!editorEl) return;

      const anchorNode = selection.anchorNode;
      if (!editorEl.contains(anchorNode)) {
        setFloatingPopup(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect && rect.width > 0) {
          setFloatingPopup({
            x: Math.max(10, rect.left + rect.width / 2),
            y: Math.max(10, rect.top - 10),
            text: text,
            range: range.cloneRange()
          });
        }
      } catch (err) {
        console.warn("Range rect error:", err);
      }
    };

    const handleMouseDown = (e) => {
      // Se clicchi fuori dal popup, chiudilo
      if (e.target.closest('#floating-selection-popup')) return;
      setTimeout(handleSelectionChange, 150);
    };

    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [currentView]);

  const loadProjectWithFiles = async (proj) => {
    setActiveProject(proj);
    setCurrentView('project');
    setIsSidebarOpen(false);

    const dbData = await getProjectDataFromDB(proj.id);
    if (dbData && dbData.files) {
      setActiveProject(prev => prev && prev.id === proj.id ? { ...prev, files: dbData.files } : prev);
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
    if (currentChatId === id) handleNewChat();
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
    setExtractingCount(0);
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

  const handleWizardFilesChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const newFileEntries = files.map(file => ({
      id: Date.now() + Math.random(),
      fileRef: file,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: (file.size / 1024).toFixed(1) + ' KB',
      status: 'extracting',
      extractedText: '',
      wordsCount: 0,
      pagesCount: 1,
    }));

    setWizardUploadedFiles(prev => [...prev, ...newFileEntries]);
    setExtractingCount(prev => prev + newFileEntries.length);
    e.target.value = '';

    for (const entry of newFileEntries) {
      const file = entry.fileRef;
      const name = file.name.toLowerCase();
      const mime = file.type.toLowerCase();

      try {
        let text = '';
        let pages = 1;

        if (name.endsWith('.pdf') || mime.includes('pdf')) {
          const buffer = await file.arrayBuffer();
          const res = await extractTextFromPdf(buffer);
          text = res.text;
          pages = res.pagesCount;
        } else if (name.endsWith('.docx') || mime.includes('word')) {
          const buffer = await file.arrayBuffer();
          const res = await extractTextFromDocx(buffer);
          text = res.text;
        } else if (name.endsWith('.pptx') || mime.includes('presentation') || mime.includes('powerpoint')) {
          const buffer = await file.arrayBuffer();
          const res = await extractTextFromPptx(buffer);
          text = res.text;
          pages = res.pagesCount;
        } else {
          text = await file.text();
        }

        const words = text ? text.trim().split(/\s+/).length : 0;

        setWizardUploadedFiles(prev => prev.map(f => f.id === entry.id ? {
          ...f,
          status: 'ready',
          extractedText: text,
          wordsCount: words,
          pagesCount: pages,
        } : f));

      } catch (err) {
        console.error(`Errore estrazione ${file.name}:`, err);
        setWizardUploadedFiles(prev => prev.map(f => f.id === entry.id ? {
          ...f,
          status: 'error',
          extractedText: '',
          wordsCount: 0,
        } : f));
      } finally {
        setExtractingCount(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleRemoveWizardFile = (fileId) => {
    setWizardUploadedFiles(prev => prev.filter(f => f.id !== fileId));
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

  // FINALIZZAZIONE WIZARD
  const handleFinalizeGuide = async () => {
    const isOnlineSearch = sourceType === 'search_online';

    if (!isOnlineSearch) {
      const stillExtracting = wizardUploadedFiles.some(f => f.status === 'extracting');
      if (stillExtracting || extractingCount > 0) {
        alert("Attendi il completamento della lettura di tutti i file prima di proseguire.");
        return;
      }

      const readyFiles = wizardUploadedFiles.filter(f => f.status === 'ready' && f.wordsCount > 0);
      if (readyFiles.length === 0) {
        alert("Nessun testo è stato estratto dai file caricati. Assicurati che i documenti contengano testo selezionabile.");
        return;
      }
    }

    setWizardStep(4);
    setLoadingProgress(15);
    setLoadingStatusText(isOnlineSearch 
      ? `Ricerca e strutturazione accademica online per "${examDescription || 'Esame'}"...`
      : `Analisi delle fonti caricate...`
    );

    const daysTotal = calculateDaysLeft(examDate);
    const projectId = Date.now().toString();

    let currentPct = 15;
    const progressInterval = setInterval(() => {
      if (currentPct < 90) {
        currentPct += 3;
        setLoadingProgress(currentPct);
        if (currentPct === 35) setLoadingStatusText('Mappatura dei capitoli e concetti chiave...');
        if (currentPct === 65) setLoadingStatusText('Organizzazione logica del piano didattico...');
        if (currentPct === 85) setLoadingStatusText('Finalizzazione delle giornate di studio...');
      }
    }, 280);

    try {
      const readyFiles = wizardUploadedFiles.filter(f => f.status === 'ready');

      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_syllabus',
          examDescription: examDescription,
          daysTotal: daysTotal,
          prepLevel: prepLevel,
          examType: examType,
          languageStyle: languageStyle,
          sourceType: sourceType,
          files: isOnlineSearch ? [] : readyFiles.map(f => ({
            name: f.name,
            size: f.size,
            mimeType: f.mimeType,
            text: f.extractedText,
            wordsCount: f.wordsCount
          })),
        }),
      });

      const data = await response.json();
      clearInterval(progressInterval);

      if (!response.ok || !data.schedule || !Array.isArray(data.schedule) || data.schedule.length === 0) {
        throw new Error(data.error || "Impossibile generare il piano di studio.");
      }

      setLoadingProgress(100);
      setLoadingStatusText('Piano di studio creato con successo!');

      if (!isOnlineSearch) {
        await saveProjectDataToDB(projectId, { files: readyFiles });
      }

      const newProject = {
        id: projectId,
        createdAt: new Date().toISOString(),
        examDate: examDate,
        prepLevel: prepLevel,
        description: examDescription || 'Guida allo studio personalizzata',
        examType: examType,
        languageStyle: languageStyle,
        sourceType: sourceType,
        files: isOnlineSearch ? [] : readyFiles.map(f => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          wordsCount: f.wordsCount,
          pagesCount: f.pagesCount,
        })),
        schedule: data.schedule,
      };

      setSavedProjects(old => [newProject, ...(old || [])]);
      setActiveProject(newProject);

      setTimeout(() => {
        setCurrentView('project');
      }, 500);

    } catch (err) {
      clearInterval(progressInterval);
      console.error("Errore generazione syllabus:", err);
      alert(`Errore: ${err.message}`);
      setWizardStep(3);
    }
  };

  // Generazione Lezione
  const handleGenerateLesson = async (dayNum, topic) => {
    if (isGeneratingLesson || !activeProject) return;
    setIsGeneratingLesson(true);

    try {
      const dbData = await getProjectDataFromDB(activeProject.id);
      const fullFilesList = dbData?.files || activeProject.files || [];

      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isLessonGeneration: true,
          topicTitle: topic.title,
          sourceType: activeProject.sourceType,
          files: activeProject.sourceType === 'my_materials' ? fullFilesList.map(f => ({ name: f.name, text: f.extractedText || f.text })) : [],
          examDescription: activeProject.description,
          prepLevel: activeProject.prepLevel,
          languageStyle: activeProject.languageStyle
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore nella generazione della lezione.');

      const lessonContent = data.reply;
      updateTopicLessonContent(dayNum, topic.id, lessonContent);
    } catch (err) {
      alert(`Errore nella generazione: ${err.message}`);
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  // Aggiornamento testo della lezione (salva in state e IndexedDB)
  const updateTopicLessonContent = (dayNum, topicId, newContent) => {
    if (!activeProject) return;
    const updatedSchedule = (activeProject.schedule || []).map(d => {
      if (d.dayNumber === dayNum) {
        const updatedTopics = (d.topics || []).map(t => {
          if (t.id === topicId) {
            return { ...t, lesson: newContent };
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

  // COMANDI DI FORMATTAZIONE WYSIWYG
  const executeEditorCommand = (command, value = null) => {
    if (typeof document !== 'undefined') {
      document.execCommand(command, false, value);
      if (wysiwygEditorRef.current) {
        wysiwygEditorRef.current.focus();
        handleEditorInput();
      }
    }
  };

  // Sincronizzazione input da ContentEditable
  const handleEditorInput = () => {
    if (!wysiwygEditorRef.current || !currentDayData || !currentSelectedTopic) return;
    const innerText = wysiwygEditorRef.current.innerText || '';
    updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, innerText);
  };

  // RISCRITTURA DA POPUP AUTOMATICO SULLA SELEZIONE DEL TESTO
  const handleRewriteFromPopup = async (mode) => {
    if (!floatingPopup || !floatingPopup.text || isRewriting) return;

    const selectedText = floatingPopup.text;
    setIsRewriting(true);

    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rewrite_selection',
          selectedText: selectedText,
          rewriteMode: mode,
          fullContext: currentSelectedTopic?.title || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore riscrittura.');

      const newRewrittenText = data.rewrittenText;

      // Sostituzione diretta nel ContentEditable o nel testo
      if (wysiwygEditorRef.current) {
        const currentFullText = wysiwygEditorRef.current.innerText || '';
        if (currentFullText.includes(selectedText)) {
          const updatedFull = currentFullText.replace(selectedText, newRewrittenText);
          wysiwygEditorRef.current.innerText = updatedFull;
          updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, updatedFull);
        }
      }

      setFloatingPopup(null);
    } catch (err) {
      alert(`Errore: ${err.message}`);
    } finally {
      setIsRewriting(false);
    }
  };

  // CHATBOT LEZIONE: MODIFICA DIRETTA DEL TESTO DELLA LEZIONE
  const handleSendLessonChatMessage = async (preset = null) => {
    const promptText = (preset || lessonChatInput).trim();
    if (!promptText || isLessonChatLoading || !currentSelectedTopic?.lesson) return;

    const currentDocText = wysiwygEditorRef.current ? (wysiwygEditorRef.current.innerText || currentSelectedTopic.lesson) : currentSelectedTopic.lesson;

    const userMsg = { role: 'user', text: promptText };
    const updatedHistory = [...lessonChatMessages, userMsg];
    setLessonChatMessages(updatedHistory);
    setLessonChatInput('');
    setIsLessonChatLoading(true);

    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lesson_chat',
          prompt: promptText,
          lessonContent: currentDocText,
          lessonChatHistory: updatedHistory,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore risposta tutor');

      // Se l'AI ha modificato direttamente il documento, applichiamo subito la modifica al file!
      if (data.hasUpdatedLesson && data.updatedLessonContent) {
        setPreviousLessonBackup(currentDocText); // salva per eventuale annulla
        updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, data.updatedLessonContent);
        if (wysiwygEditorRef.current) {
          wysiwygEditorRef.current.innerText = data.updatedLessonContent;
        }
      }

      const aiMsg = {
        role: 'assistant',
        text: data.reply,
        hasUpdatedLesson: data.hasUpdatedLesson,
      };

      setLessonChatMessages([...updatedHistory, aiMsg]);
    } catch (err) {
      setLessonChatMessages([...updatedHistory, { role: 'assistant', text: `Si è verificato un errore: ${err.message}` }]);
    } finally {
      setIsLessonChatLoading(false);
    }
  };

  // Annulla ultima modifica del chatbot
  const handleUndoChatbotChange = () => {
    if (previousLessonBackup && currentDayData && currentSelectedTopic) {
      updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, previousLessonBackup);
      if (wysiwygEditorRef.current) {
        wysiwygEditorRef.current.innerText = previousLessonBackup;
      }
      setPreviousLessonBackup(null);
      alert("Modifica del chatbot annullata.");
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

  // Chat Homepage (Layout centrato e stabile)
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

  const totalFilesSelected = wizardUploadedFiles.length;
  const totalFilesReady = wizardUploadedFiles.filter(f => f.status === 'ready').length;
  const isAnyFileExtracting = extractingCount > 0 || wizardUploadedFiles.some(f => f.status === 'extracting');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-geminiDark text-gray-200 relative font-sans">
      
      {/* POPUP FLUTTUANTE AUTOMATICO SU SELEZIONE TESTO */}
      {floatingPopup && (
        <div 
          id="floating-selection-popup"
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 bg-geminiDarkSecondary border border-indigo-500/60 shadow-2xl rounded-2xl p-1.5 flex items-center gap-1 animate-popup text-xs backdrop-blur-md"
          style={{
            left: `${floatingPopup.x}px`,
            top: `${floatingPopup.y}px`,
          }}
        >
          {isRewriting ? (
            <div className="flex items-center gap-2 px-3 py-1 text-xs text-indigo-300">
              <RefreshCw size={13} className="animate-spin text-indigo-400" />
              <span>Elaborazione testo in corso...</span>
            </div>
          ) : (
            <>
              <button
                onClick={() => handleRewriteFromPopup('riassumi')}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-indigo-600/30 text-gray-200 hover:text-white rounded-xl transition text-xs font-semibold"
                title="Sintetizza il passaggio selezionato"
              >
                <span>📝 Riassumi</span>
              </button>
              <div className="w-[1px] h-4 bg-geminiBorder" />
              <button
                onClick={() => handleRewriteFromPopup('approfondisci')}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-indigo-600/30 text-gray-200 hover:text-white rounded-xl transition text-xs font-semibold"
                title="Aggiungi dettagli, spiegazioni ed esempi"
              >
                <span>🔍 Approfondisci</span>
              </button>
              <div className="w-[1px] h-4 bg-geminiBorder" />
              <button
                onClick={() => handleRewriteFromPopup('chiaro')}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-indigo-600/30 text-gray-200 hover:text-white rounded-xl transition text-xs font-semibold"
                title="Riscrivi con parole più chiare e semplici"
              >
                <span>💡 Riscrivi meglio</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* OVERLAY SIDEBAR */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
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

      {/* CONTENITORE PRINCIPALE */}
      <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden">
        
        {/* HEADER FISSO */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-geminiBorder/40 bg-geminiDark z-20 shrink-0">
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

            {/* STEP 2: DETTAGLI ESAME */}
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

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Descrivi brevemente l'esame o l'ordine di studio preferito
                  </label>
                  <textarea 
                    rows={2}
                    value={examDescription}
                    onChange={(e) => setExamDescription(e.target.value)}
                    placeholder="Es. Anatomia Patologica, Fisiologia, Diritto..."
                    className="w-full bg-geminiDark border border-geminiBorder rounded-2xl p-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition resize-none"
                  />
                </div>

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
                    <p className="text-xs text-gray-400">Scegli come strutturare il tuo materiale di studio.</p>
                  </div>
                </div>

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
                      <div className="text-[11px] text-gray-400 mt-0.5">Carica PDF, Word, PPTX o appunti. L'AI estrarrà solo questi contenuti.</div>
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
                      <div className="text-[11px] text-gray-400 mt-0.5">Nessun file necessario: l'AI strutturerà il programma accademico completo.</div>
                    </div>
                  </div>
                </div>

                {sourceType === 'my_materials' ? (
                  <div className="space-y-3 pt-2 bg-geminiDark/60 p-4 rounded-2xl border border-geminiBorder/70">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={14} className="text-blue-400" />
                        <span>Carica i tuoi documenti</span>
                      </label>
                      <span className="text-[11px] text-blue-400 font-semibold">
                        {totalFilesReady} di {totalFilesSelected} pronti
                      </span>
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
                      <div className="text-xs font-medium text-gray-200">Seleziona i tuoi file (PDF, Word, Slide, TXT)</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">Lettura istantanea ed esaustiva di tutti i capitoli</div>
                    </div>

                    {isAnyFileExtracting && (
                      <div className="flex items-center justify-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 animate-pulse">
                        <RefreshCw size={14} className="animate-spin text-blue-400" />
                        <span>Estrazione testo in corso per {extractingCount} file...</span>
                      </div>
                    )}

                    {wizardUploadedFiles.length > 0 && (
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                        {wizardUploadedFiles.map(file => (
                          <div 
                            key={file.id}
                            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs transition ${
                              file.status === 'ready' && file.wordsCount > 0
                                ? 'bg-geminiDarkSecondary border-emerald-500/30 text-gray-200'
                                : file.status === 'extracting'
                                ? 'bg-geminiDarkSecondary/80 border-blue-500/40 text-blue-200'
                                : 'bg-geminiDarkSecondary border-amber-500/40 text-amber-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 truncate pr-2">
                              {file.status === 'ready' && file.wordsCount > 0 ? (
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                  <Check size={14} />
                                </div>
                              ) : file.status === 'extracting' ? (
                                <RefreshCw size={15} className="animate-spin text-blue-400 shrink-0" />
                              ) : (
                                <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                              )}

                              <div className="truncate">
                                <div className="font-semibold truncate text-gray-100">{file.name}</div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                  <span>{file.size}</span>
                                  {file.status === 'ready' && file.wordsCount > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="text-emerald-400 font-bold">{file.wordsCount.toLocaleString()} parole</span>
                                      {file.pagesCount > 1 && <span>({file.pagesCount} pag.)</span>}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button 
                              onClick={() => handleRemoveWizardFile(file.id)}
                              className="p-1 text-gray-400 hover:text-red-400 transition shrink-0 ml-2"
                              title="Rimuovi file"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-indigo-300">
                      <Globe size={16} />
                      <span>Ricerca e Strutturazione Online Attiva</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-indigo-200/80">
                      L'AI costruirà il piano di studio basandosi sui programmi accademici per <strong>"{examDescription || 'la materia scelta'}"</strong> senza richiedere file.
                    </p>
                  </div>
                )}

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
                    disabled={sourceType === 'my_materials' && (isAnyFileExtracting || totalFilesReady === 0 || totalFilesSelected === 0)}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition shadow-lg ${
                      sourceType === 'my_materials' && (isAnyFileExtracting || totalFilesReady === 0 || totalFilesSelected === 0)
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30'
                    }`}
                  >
                    <Sparkles size={16} />
                    <span>Genera Guida e Piano</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: CARICAMENTO PROGRESSIVO */}
            {wizardStep === 4 && (
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-8 sm:p-12 rounded-3xl shadow-2xl text-center space-y-6 max-w-md mx-auto w-full">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin absolute" />
                  <ShieldCheck size={32} className="text-blue-400" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-100">Generazione del Piano</h3>
                  <p className="text-xs text-gray-400 h-6 transition-all">{loadingStatusText}</p>
                </div>

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
                <ShieldCheck size={13} />
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
                    <span>Fonti e Materiali</span>
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
                            <span className="text-gray-400 text-[11px] shrink-0 ml-2">
                              {f.wordsCount ? `${f.wordsCount.toLocaleString()} parole` : f.size}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 py-2 text-center">Nessun file presente.</div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-3">
                    <Globe size={20} className="shrink-0" />
                    <span>Programma basato sulla ricerca e strutturazione didattica accademica.</span>
                  </div>
                )}
              </div>

              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 font-bold text-base text-gray-100 border-b border-geminiBorder/60 pb-3">
                    <Sparkles size={18} className="text-indigo-400" />
                    <span>Piano Didattico Giornaliero</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Accedi alle singole giornate per consultare, personalizzare o generare lezioni con il chatbot dedicato.
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
                  Seleziona una giornata per consultare, personalizzare o generare lezioni.
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
                      setLessonChatMessages([]);
                      setFloatingPopup(null);
                      setPreviousLessonBackup(null);
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
        {/* VISTA 4: DETTAGLIO GIORNO WYSIWYG CON TOOLBAR & CHATBOT FISSO */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'day_detail' && activeProject && currentDayData && (
          <main className="flex-1 flex flex-col h-full w-full overflow-hidden">
            
            {/* Top Bar 1: Breadcrumbs e selezione argomento */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-b border-geminiBorder/40 bg-geminiDarkSecondary/70 shrink-0">
              <button 
                onClick={() => setCurrentView('study_plan')}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
              >
                <ArrowLeft size={14} />
                <span>Torna al Piano Giornaliero</span>
              </button>
              
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <CalendarIcon size={14} className="text-blue-400" />
                <span>{currentDayData?.date} • {currentDayData?.dayTitle}</span>
              </div>
            </div>

            {/* Layout Rigido a Due Colonne: Nessun traboccamento o spaginatura */}
            <div className="flex-1 flex flex-col md:flex-row h-full w-full overflow-hidden">
              
              {/* COLONNA SINISTRA: EDITOR WYSIWYG FORMATTATO E MODIFICABILE NATIVAMENTE */}
              <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-geminiBorder/40">
                
                {/* Selettore Argomenti e Toolbar Superiore */}
                <div className="px-4 py-2 border-b border-geminiBorder/40 bg-geminiDarkSecondary/30 shrink-0 space-y-2">
                  
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                    <div className="flex items-center gap-1.5">
                      {(currentDayData?.topics || []).map(topic => (
                        <button
                          key={topic.id}
                          onClick={() => {
                            setSelectedTopicId(topic.id);
                            setFloatingPopup(null);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border ${
                            currentSelectedTopic?.id === topic.id
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-geminiDarkSecondary text-gray-400 border-geminiBorder hover:text-gray-200'
                          }`}
                        >
                          <span>{topic.title}</span>
                          {topic.lesson && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                        </button>
                      ))}
                    </div>

                    {currentSelectedTopic && (
                      <button
                        onClick={() => handleGenerateLesson(currentDayData.dayNumber, currentSelectedTopic)}
                        disabled={isGeneratingLesson}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition shadow-sm shrink-0 ${
                          isGeneratingLesson 
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/20'
                        }`}
                      >
                        {isGeneratingLesson ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        <span>{currentSelectedTopic.lesson ? 'Rigenera lezione' : 'Genera lezione'}</span>
                      </button>
                    )}
                  </div>

                  {/* BARRA FORMATTAZIONE RICCA (Font, Dimensione, B/I/U, Allineamento, Elenchi) */}
                  {currentSelectedTopic?.lesson && (
                    <div className="flex items-center gap-1 pt-1 overflow-x-auto text-xs text-gray-300 border-t border-geminiBorder/40">
                      
                      {/* Carattere del testo */}
                      <select 
                        value={activeFont}
                        onChange={(e) => {
                          setActiveFont(e.target.value);
                          executeEditorCommand('fontName', e.target.value);
                        }}
                        className="bg-geminiDark border border-geminiBorder rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none"
                      >
                        <option value="sans">Sans-serif</option>
                        <option value="serif">Serif</option>
                        <option value="monospace">Monospace</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Arial">Arial</option>
                      </select>

                      {/* Dimensione del testo */}
                      <select 
                        value={activeFontSize}
                        onChange={(e) => {
                          setActiveFontSize(e.target.value);
                          executeEditorCommand('fontSize', e.target.value === '12px' ? '2' : e.target.value === '14px' ? '3' : e.target.value === '18px' ? '5' : '4');
                        }}
                        className="bg-geminiDark border border-geminiBorder rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none"
                      >
                        <option value="12px">Piccolo (12px)</option>
                        <option value="15px">Normale (15px)</option>
                        <option value="18px">Grande (18px)</option>
                        <option value="22px">Titolo (22px)</option>
                      </select>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      {/* Stili base */}
                      <button 
                        onClick={() => executeEditorCommand('bold')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Grassetto (Cmd+B)"
                      >
                        <Bold size={13} />
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('italic')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Corsivo (Cmd+I)"
                      >
                        <Italic size={13} />
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('underline')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Sottolineato (Cmd+U)"
                      >
                        <UnderlineIcon size={13} />
                      </button>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      {/* Allineamento */}
                      <button 
                        onClick={() => executeEditorCommand('justifyLeft')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Allinea a sinistra"
                      >
                        <AlignLeft size={13} />
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('justifyCenter')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Centra"
                      >
                        <AlignCenter size={13} />
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('justifyRight')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Allinea a destra"
                      >
                        <AlignRight size={13} />
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('justifyFull')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Giustifica"
                      >
                        <AlignJustify size={13} />
                      </button>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      {/* Elenchi */}
                      <button 
                        onClick={() => executeEditorCommand('insertUnorderedList')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Elenco puntato"
                      >
                        <List size={13} />
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('insertOrderedList')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Elenco numerato"
                      >
                        <ListOrdered size={13} />
                      </button>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      {/* Intestazioni */}
                      <button 
                        onClick={() => executeEditorCommand('formatBlock', '<h2>')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition text-[11px] font-bold"
                        title="Titolo H2"
                      >
                        H2
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('formatBlock', '<h3>')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition text-[11px] font-bold"
                        title="Titolo H3"
                      >
                        H3
                      </button>
                      <button 
                        onClick={() => executeEditorCommand('formatBlock', '<p>')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition text-[11px]"
                        title="Paragrafo normale"
                      >
                        P
                      </button>
                    </div>
                  )}

                </div>

                {/* CORPO DOCUMENTO: SCROLLABILE E TOTALMENTE MODIFICABILE WYSIWYG */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 relative">
                  
                  {isGeneratingLesson ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-16">
                      <Sparkles size={28} className="text-blue-400 animate-bounce" />
                      <div className="text-sm font-semibold text-gray-200">Generazione della lezione in corso...</div>
                      <div className="text-xs text-gray-400">Creazione di spiegazioni, tabelle e formule didattiche</div>
                    </div>
                  ) : currentSelectedTopic?.lesson ? (
                    <div className="max-w-3xl mx-auto space-y-4">
                      
                      {/* Badge info e stato studiato */}
                      <div className="flex items-center justify-between text-xs text-gray-400 bg-geminiDarkSecondary/60 px-4 py-2 rounded-2xl border border-geminiBorder">
                        <span className="text-[11px]">
                          ✏️ <strong>Documento modificabile</strong>: puoi cliccare e digitare direttamente sopra il testo.
                        </span>
                        <button
                          onClick={() => handleToggleTopicComplete(currentDayData.dayNumber, currentSelectedTopic.id)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                            currentSelectedTopic.completed 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-geminiHover text-gray-300 hover:text-white border border-geminiBorder'
                          }`}
                        >
                          {currentSelectedTopic.completed ? <CheckCircle2 size={13} /> : <CheckSquare size={13} />}
                          <span>{currentSelectedTopic.completed ? 'Studiato' : 'Segna studiato'}</span>
                        </button>
                      </div>

                      {/* FOGLIO WYSIWYG EDITABLE IN-PLACE SENZA CODICE MARKDOWN */}
                      <div className="bg-geminiDarkSecondary/70 border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-xl min-h-[500px]">
                        <div
                          ref={wysiwygEditorRef}
                          contentEditable="true"
                          suppressContentEditableWarning={true}
                          onInput={handleEditorInput}
                          className="wysiwyg-editor focus:outline-none"
                          style={{
                            fontFamily: activeFont === 'serif' ? 'Georgia, serif' : activeFont === 'monospace' ? 'monospace' : 'inherit',
                            fontSize: activeFontSize
                          }}
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(currentSelectedTopic.lesson) }}
                        />
                      </div>

                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-3">
                      <BookOpen size={32} className="mx-auto text-gray-500" />
                      <div className="text-sm font-semibold text-gray-300">Nessuna lezione presente per questo argomento</div>
                      <p className="text-xs text-gray-500 max-w-sm">
                        Clicca su <strong>"Genera lezione"</strong> in alto a destra per creare la sintesi didattica.
                      </p>
                    </div>
                  )}

                </div>

              </div>

              {/* COLONNA DESTRA: CHATBOT DEDICATO ALLA LEZIONE CON MODIFICA DIRETTA */}
              <div className="w-full md:w-80 lg:w-96 h-80 md:h-full flex flex-col bg-geminiDarkSecondary border-l border-geminiBorder/60 shrink-0 overflow-hidden">
                
                <div className="px-4 py-3 border-b border-geminiBorder/40 bg-geminiDarkSecondary flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-100">
                    <Bot size={16} className="text-blue-400" />
                    <span>Tutor della Lezione</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-geminiDark px-2 py-0.5 rounded-md border border-geminiBorder">
                    Contestuale
                  </span>
                </div>

                {/* MESSAGGI CHATBOT LEZIONE */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
                  {lessonChatMessages.length === 0 ? (
                    <div className="h-full flex flex-col justify-center text-center p-3 text-gray-400 space-y-2">
                      <Sparkles size={20} className="mx-auto text-blue-400 mb-1" />
                      <p className="font-semibold text-gray-200">Chiedi o modifica il testo</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        Chiedi spiegazioni oppure istruisci il tutor a inserire nuove informazioni direttamente nel documento.
                      </p>
                      <div className="space-y-1.5 pt-2 text-left">
                        <button
                          onClick={() => handleSendLessonChatMessage("Aggiungi una tabella di riassunto dei punti chiave")}
                          className="w-full text-[11px] p-2 rounded-xl bg-geminiDark hover:bg-geminiHover border border-geminiBorder text-gray-300 text-left transition"
                        >
                          + "Aggiungi una tabella di riassunto"
                        </button>
                        <button
                          onClick={() => handleSendLessonChatMessage("Spiegami questo passaggio con un esempio pratico")}
                          className="w-full text-[11px] p-2 rounded-xl bg-geminiDark hover:bg-geminiHover border border-geminiBorder text-gray-300 text-left transition"
                        >
                          + "Spiegami con un esempio pratico"
                        </button>
                        <button
                          onClick={() => handleSendLessonChatMessage("Fammi 3 domande d'esame su questa lezione")}
                          className="w-full text-[11px] p-2 rounded-xl bg-geminiDark hover:bg-geminiHover border border-geminiBorder text-gray-300 text-left transition"
                        >
                          + "Fammi 3 domande d'esame"
                        </button>
                      </div>
                    </div>
                  ) : (
                    lessonChatMessages.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`p-3 rounded-2xl max-w-[90%] leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-geminiDark border border-geminiBorder text-gray-200 rounded-tl-none'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {msg.hasUpdatedLesson && (
                            <div className="mt-2 pt-2 border-t border-geminiBorder/60 flex items-center justify-between text-[10px] text-emerald-400 font-semibold">
                              <span>✨ Documento aggiornato</span>
                              {previousLessonBackup && (
                                <button
                                  onClick={handleUndoChatbotChange}
                                  className="text-gray-400 hover:text-red-300 underline font-normal"
                                >
                                  Annulla
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {isLessonChatLoading && (
                    <div className="flex items-center gap-2 p-2 text-[11px] text-gray-400 bg-geminiDark rounded-xl w-fit">
                      <RefreshCw size={12} className="animate-spin text-blue-400" />
                      <span>Il tutor sta elaborando...</span>
                    </div>
                  )}
                  <div ref={lessonChatEndRef} />
                </div>

                {/* Input Chatbot Lezione */}
                <div className="p-3 border-t border-geminiBorder/40 bg-geminiDarkSecondary shrink-0">
                  <div className="flex items-center gap-1.5 bg-geminiDark border border-geminiBorder rounded-2xl px-3 py-1.5 focus-within:border-blue-500 transition">
                    <input
                      type="text"
                      value={lessonChatInput}
                      onChange={(e) => setLessonChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendLessonChatMessage();
                        }
                      }}
                      placeholder="Chiedi o aggiungi info alla lezione..."
                      className="flex-1 bg-transparent text-xs text-gray-100 placeholder-gray-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleSendLessonChatMessage()}
                      disabled={!lessonChatInput.trim() || isLessonChatLoading}
                      className={`p-1.5 rounded-full transition ${
                        lessonChatInput.trim() && !isLessonChatLoading 
                          ? 'bg-blue-600 text-white hover:bg-blue-500' 
                          : 'text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      <Send size={13} />
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </main>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 5: CHAT HOMEPAGE CORRETTA (CENTRATA E NON SPAGINATA)   */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'chat' && (
          <div className="flex-1 flex flex-col h-full w-full overflow-hidden relative">
            
            {/* Scrollable Container centrato */}
            <div className="flex-1 overflow-y-auto w-full px-4 sm:px-6">
              <div className="max-w-3xl mx-auto py-6 space-y-6 pb-36">
                
                {messages.length === 0 ? (
                  <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
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
                  messages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
                          <GraduationCap size={16} />
                        </div>
                      )}

                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words overflow-hidden ${
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
                        
                        <div className="prose prose-invert max-w-none text-sm leading-relaxed text-gray-200">
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}

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
            </div>

            {/* Input Bar Fisso in Basso */}
            <footer className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-geminiDark via-geminiDark to-transparent z-10">
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

                <div className="flex items-end gap-2 bg-geminiDarkSecondary border border-geminiBorder rounded-3xl px-4 py-2.5 shadow-xl focus-within:border-blue-500 transition">
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

          </div>
        )}

      </div>
    </div>
  );
}
