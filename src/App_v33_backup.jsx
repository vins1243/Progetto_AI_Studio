import logoImg from './logo.png';
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
  Wand2,
  Undo2,
  Award,
  BarChart3,
  Layers,
  HelpCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  TrendingUp,
  Activity,
  Mic,
  MicOff,
  Image as ImageIcon,
  Sun,
  Moon,
  Download
,
  User,
  LogIn,
  LogOut,
  Mail,
  Lock,
  Key,
  Cloud
} from 'lucide-react';

import { 
  supabase, 
  isSupabaseConfigured, 
  signUpUser, 
  signInUser, 
  signOutUser, 
  resetUserPassword, 
  fetchProjectsFromCloud, 
  saveProjectToCloud, 
  deleteProjectFromCloud, 
  fetchChatsFromCloud, 
  saveChatToCloud, 
  deleteChatFromCloud,
  fetchUserProfile,
  setSubscriptionActive
} from './supabaseClient.js';

const STRIPE_PAYMENT_URL = 'https://buy.stripe.com/test_fZu14p1No81J5Eg9nme7m00';


// IndexedDB Helper
const DB_NAME = 'MinervaAIDB_V11';
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

// RENDERING AUTOMATICO MARKDOWN + LATEX KATEX VERSO HTML WYSIWYG
function renderMarkdownAndLatexToHtml(md) {
  if (!md) return '';
  let html = md;

  // 1. Render LaTeX display blocks $$ ... $$
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, expr) => {
    try {
      if (typeof window !== 'undefined' && window.katex) {
        return `<div class="katex-display" contenteditable="false">${window.katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false })}</div>`;
      }
    } catch (e) {
      console.warn("KaTeX display error:", e);
    }
    return `<div class="katex-display" contenteditable="false">${expr}</div>`;
  });

  // 2. Render LaTeX inline math $ ... $
  html = html.replace(/\$([^\$\n]+?)\$/g, (match, expr) => {
    try {
      if (typeof window !== 'undefined' && window.katex) {
        return `<span class="katex-inline" contenteditable="false">${window.katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false })}</span>`;
      }
    } catch (e) {
      console.warn("KaTeX inline error:", e);
    }
    return `<span class="katex-inline" contenteditable="false">${expr}</span>`;
  });

  // 3. Intestazioni Markdown
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 4. Grassetto e Corsivo
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<b><i>$1</i></b>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/gim, '<i>$1</i>');

  // 5. Elenchi
  html = html.replace(/^\s*-\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul>\s*<ul>/gim, '');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
  html = html.replace(/<\/ol>\s*<ol>/gim, '');

  // 6. Citazioni
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // 7. Paragrafi
  html = html.replace(/\n\n/gim, '</p><p>');
  html = html.replace(/\n/gim, '<br/>');

  if (!html.startsWith('<h') && !html.startsWith('<p') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<div')) {
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


// Componente Logo Ufficiale MinervaAI
function AppLogo({ className = "w-8 h-8", imgClassName = "w-full h-full object-contain" }) {
  return (
    <div className={`${className} flex items-center justify-center shrink-0 select-none overflow-hidden`}>
      <img 
        src={logoImg} 
        alt="MinervaAI Logo" 
        className={imgClassName} 
      />
    </div>
  );
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
  const [sidebarTab, setSidebarTab] = useState('projects');

  // Chat Homepage (Supportata solo per utente autenticato)
  const [conversations, setConversations] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);

  // DETTATURA VOCALE CON OPENAI WHISPER
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Progetti salvati (Cloud Supabase)
  const [savedProjects, setSavedProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [selectedDayNumber, setSelectedDayNumber] = useState(1);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // POPUP FLUTTUANTE SU SELEZIONE TESTO
  const [floatingPopup, setFloatingPopup] = useState(null);
  const [isRewriting, setIsRewriting] = useState(false);

  // GESTIONE SELEZIONE E RIDIMENSIONAMENTO TRASCINABILE IMMAGINI
  const [selectedImageEl, setSelectedImageEl] = useState(null);
  const [imageBoxRect, setImageBoxRect] = useState(null); // { left, top, width, height }
  const [imageToolPos, setImageToolPos] = useState(null);
  const resizingStateRef = useRef(null); // { handle, startX, startY, startW, startH }

  // CHATBOT LEZIONE CON MODIFICA DIRETTA
  const [lessonChatMessages, setLessonChatMessages] = useState([]);
  const [lessonChatInput, setLessonChatInput] = useState('');
  const [isLessonChatLoading, setIsLessonChatLoading] = useState(false);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = "MinervaAI";
    }
  }, []);

  // STATO TEMA GIORNO / NOTTE (DEFAULT: SEGUE IL SISTEMA OPERATIVO IN TEMPO REALE)
  const [theme, setTheme] = useState(() => {
    try {
      const manual = localStorage.getItem('minerva_theme_manual');
      const saved = localStorage.getItem('minerva_theme');
      if (manual && (saved === 'light' || saved === 'dark')) return saved;
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {}
    return 'dark';
  });

  // Sincronizzazione immediata su DOM (html e body)
  useEffect(() => {
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(theme);
        document.documentElement.style.colorScheme = theme;
        if (document.body) {
          document.body.classList.remove('dark', 'light');
          document.body.classList.add(theme);
          document.body.style.backgroundColor = theme === 'light' ? '#f8fafc' : '#131314';
          document.body.style.color = theme === 'light' ? '#0f172a' : '#e3e3e3';
        }
      }
    } catch (err) {
      console.warn('Theme update error:', err);
    }
  }, [theme]);

  // Ascolto in tempo reale dei cambiamenti del tema del dispositivo (es. macOS/iOS/Windows Night Mode)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e) => {
      const manual = localStorage.getItem('minerva_theme_manual');
      if (!manual) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    try {
      if (darkQuery.addEventListener) {
        darkQuery.addEventListener('change', handleSystemThemeChange);
        return () => darkQuery.removeEventListener('change', handleSystemThemeChange);
      } else if (darkQuery.addListener) {
        darkQuery.addListener(handleSystemThemeChange);
        return () => darkQuery.removeListener(handleSystemThemeChange);
      }
    } catch (e) {
      console.warn('Media query listener error:', e);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem('minerva_theme', nextTheme);
      localStorage.setItem('minerva_theme_manual', 'true');
    } catch {}
  };

  // DETTATURA VOCALE PER CHAT DELLA LEZIONE
  const [isRecordingLessonAudio, setIsRecordingLessonAudio] = useState(false);
  const [isTranscribingLessonAudio, setIsTranscribingLessonAudio] = useState(false);
  const lessonMediaRecorderRef = useRef(null);
  const lessonAudioChunksRef = useRef([]);
  const [previousLessonBackup, setPreviousLessonBackup] = useState(null);

  // Toolbar stato
  const [selectedFontSize, setSelectedFontSize] = useState('15');
  const [selectedFontFamily, setSelectedFontFamily] = useState('sans-serif');

  // MODULO VERIFICA COMPETENZE (STATI)
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(1);
  const [selectedTopicsForQuiz, setSelectedTopicsForQuiz] = useState([]);
  const [quizQuestionTypes, setQuizQuestionTypes] = useState(['scelta_multipla', 'completamento', 'accoppiamento', 'aperta']);
  const [quizNumQuestions, setQuizNumQuestions] = useState(10);
  const [quizDifficulty, setQuizDifficulty] = useState('automatico');
  const [quizFeedbackMode, setQuizFeedbackMode] = useState('immediato');
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [matchingSelections, setMatchingSelections] = useState({});
  const [immediateEvaluations, setImmediateEvaluations] = useState({});
  const [isEvaluatingOpen, setIsEvaluatingOpen] = useState(false);
  const [isSingleLessonQuiz, setIsSingleLessonQuiz] = useState(false);

  // Wizard State
  // STATO AUTENTICAZIONE E CLOUD SYNC SUPABASE
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

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
  const imageUploadInputRef = useRef(null);
  const wizardFileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lessonChatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const wysiwygEditorRef = useRef(null);
  const lastLoadedTopicIdRef = useRef(null);

  // Sincronizzazione Sessione Utente Supabase
  useEffect(() => {
    if (!supabase) {
      setIsAuthInitializing(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadCloudData(session.user.id);
      } else {
        setUser(null);
        setSavedProjects([]);
        setConversations([]);
        setActiveProject(null);
        setCurrentChatId(null);
        setMessages([]);
      }
      setIsAuthInitializing(false);
    }).catch(err => {
      console.warn('Supabase getSession error:', err);
      setIsAuthInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadCloudData(session.user.id);
      } else {
        setUser(null);
        setSavedProjects([]);
        setConversations([]);
        setActiveProject(null);
        setCurrentChatId(null);
        setMessages([]);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const loadCloudData = async (userId) => {
    if (!userId) return;
    setIsCloudSyncing(true);
    try {
      const profile = await fetchUserProfile(userId);
      setUserProfile(profile);

      const cloudProjects = await fetchProjectsFromCloud(userId);
      setSavedProjects(cloudProjects || []);
      const cloudChats = await fetchChatsFromCloud(userId);
      setConversations(cloudChats || []);
    } catch (err) {
      console.warn('Errore sync dati cloud:', err);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Rilevamento automatico ritorno da Stripe (?payment=success)
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('payment') === 'success') {
        setSubscriptionActive(user.id, 'monthly_14.99').then(() => {
          fetchUserProfile(user.id).then(p => setUserProfile(p));
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        });
      }
    } catch (e) {
      console.warn('Payment success url check:', e);
    }
  }, [user?.id]);

  const handleAuthSubmit = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setIsAuthSubmitting(true);
    try {
      if (authMode === 'login') {
        const res = await signInUser(authEmail, authPassword);
        const loggedUser = res?.user || res?.session?.user;
        if (loggedUser) {
          setUser(loggedUser);
          await loadCloudData(loggedUser.id);
        }
        setAuthPassword('');
      } else if (authMode === 'signup') {
        const res = await signUpUser(authEmail, authPassword, authFullName);
        const signedUser = res?.user || res?.session?.user;
        if (signedUser && res?.session) {
          setUser(signedUser);
          await loadCloudData(signedUser.id);
        } else {
          setAuthSuccess("Registrazione completata con successo! Se richiesto, controlla la tua email per confermare l'account o accedi subito con le tue credenziali.");
          setTimeout(() => {
            setAuthMode('login');
            setAuthSuccess('');
          }, 3500);
        }
      } else if (authMode === 'reset') {
        await resetUserPassword(authEmail);
        setAuthSuccess("Ti abbiamo inviato un'email con il link per reimpostare la tua password.");
      }
    } catch (err) {
      console.error('Auth error:', err);
      setAuthError(err.message || "Si è verificato un errore durante l'operazione.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    try {
      await signOutUser();
      setUser(null);
      setSavedProjects([]);
      setConversations([]);
      setActiveProject(null);
      setCurrentChatId(null);
      setMessages([]);
      setCurrentView('chat');
    } catch (err) {
      console.warn('Logout error:', err);
    }
  };

  // Storage sync
  useEffect(() => {
    try {
      localStorage.setItem('study_ai_chats', JSON.stringify(conversations));
    } catch (e) {
      console.warn("Quota chat", e);
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
      console.warn("Quota projects", e);
    }
  }, [savedProjects]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    lessonChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lessonChatMessages, isLessonChatLoading]);

  const currentDayData = activeProject?.schedule?.find(d => d.dayNumber === selectedDayNumber) || activeProject?.schedule?.[0];
  const currentSelectedTopic = currentDayData?.topics?.find(t => t.id === selectedTopicId) || currentDayData?.topics?.[0];

  // Inizializza il contenuto dell'editor WYSIWYG
  useEffect(() => {
    if (currentView === 'day_detail' && currentSelectedTopic && wysiwygEditorRef.current) {
      const currentId = currentSelectedTopic.id;
      if (lastLoadedTopicIdRef.current !== currentId || !wysiwygEditorRef.current.innerHTML.trim()) {
        lastLoadedTopicIdRef.current = currentId;
        const html = renderMarkdownAndLatexToHtml(currentSelectedTopic.lesson || '');
        wysiwygEditorRef.current.innerHTML = html;
        setSelectedImageEl(null);
        setImageBoxRect(null);
      }
    }
  }, [currentView, currentSelectedTopic?.id, currentSelectedTopic?.lesson]);

  // Aggiorna posizione rettangolo di selezione immagine
  const updateImageBoxPosition = (img) => {
    if (!img) {
      setImageBoxRect(null);
      setImageToolPos(null);
      return;
    }
    const rect = img.getBoundingClientRect();
    setImageBoxRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    setImageToolPos({
      x: Math.max(10, rect.left + rect.width / 2),
      y: Math.max(50, rect.top - 12)
    });
  };

  // Listener per selezione immagini nell'editor
  useEffect(() => {
    const handleEditorClick = (e) => {
      if (currentView !== 'day_detail') return;

      if (e.target && e.target.tagName === 'IMG') {
        const img = e.target;
        setSelectedImageEl(img);
        updateImageBoxPosition(img);
      } else if (!e.target.closest('#image-editing-toolbar') && !e.target.closest('#image-resize-overlay')) {
        setSelectedImageEl(null);
        setImageBoxRect(null);
        setImageToolPos(null);
      }
    };

    const handleScrollOrResize = () => {
      if (selectedImageEl) updateImageBoxPosition(selectedImageEl);
    };

    document.addEventListener('click', handleEditorClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('click', handleEditorClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [currentView, selectedImageEl]);

  // GESTIONE TRASCINAMENTO MANIGLIE DI RIDIMENSIONAMENTO IMMAGINE (CORNER & EDGE HANDLES)
  const handleResizeHandleMouseDown = (e, handleType) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedImageEl) return;
    const rect = selectedImageEl.getBoundingClientRect();

    resizingStateRef.current = {
      handle: handleType,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      aspectRatio: rect.width / rect.height
    };

    const handleMouseMove = (moveEvent) => {
      if (!resizingStateRef.current || !selectedImageEl) return;
      const { handle, startX, startY, startWidth, startHeight, aspectRatio } = resizingStateRef.current;
      
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;

      if (handle === 'se' || handle === 'e') {
        newWidth = Math.max(80, startWidth + deltaX);
      } else if (handle === 'sw' || handle === 'w') {
        newWidth = Math.max(80, startWidth - deltaX);
      } else if (handle === 'ne') {
        newWidth = Math.max(80, startWidth + deltaX);
      } else if (handle === 'nw') {
        newWidth = Math.max(80, startWidth - deltaX);
      } else if (handle === 's') {
        newWidth = Math.max(80, (startHeight + deltaY) * aspectRatio);
      } else if (handle === 'n') {
        newWidth = Math.max(80, (startHeight - deltaY) * aspectRatio);
      }

      selectedImageEl.style.width = `${Math.round(newWidth)}px`;
      selectedImageEl.style.height = 'auto';
      updateImageBoxPosition(selectedImageEl);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      resizingStateRef.current = null;
      handleEditorInput();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Rilevamento selezione testo per popup fluttuante
  useEffect(() => {
    const handleSelection = () => {
      if (currentView !== 'day_detail') return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setFloatingPopup(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 3) {
        setFloatingPopup(null);
        return;
      }

      const editorEl = wysiwygEditorRef.current;
      if (!editorEl || !editorEl.contains(selection.anchorNode)) {
        setFloatingPopup(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect && rect.width > 0) {
          setFloatingPopup({
            x: Math.max(20, Math.min(window.innerWidth - 180, rect.left + rect.width / 2)),
            y: Math.max(60, rect.top - 12),
            text: text,
            range: range.cloneRange()
          });
        }
      } catch (err) {
        console.warn("Selection rect error:", err);
      }
    };

    const handleMouseDown = (e) => {
      if (e.target.closest('#floating-selection-popup') || e.target.closest('#image-editing-toolbar') || e.target.closest('#image-resize-overlay')) return;
      setTimeout(handleSelection, 120);
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleSelection);
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
    setAttachedFiles([]);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleSelectChat = (chat) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setAttachedFiles([]);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleDeleteChat = (e, id) => {
    e.stopPropagation();
    const updated = (conversations || []).filter(c => c.id !== id);
    setConversations(updated);
    if (user) {
      deleteChatFromCloud(user.id, id);
    }
    if (currentChatId === id) handleNewChat();
  };

  const handleDeleteProject = (e, id) => {
    e.stopPropagation();
    const updated = (savedProjects || []).filter(p => p.id !== id);
    setSavedProjects(updated);
    if (user) {
      deleteProjectFromCloud(user.id, id);
    }
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

  // -------------------------------------------------------------
  // ESPORTAZIONE PDF DELLA LEZIONE CON HTML2PDF
  // -------------------------------------------------------------
  const handleDownloadLessonPDF = () => {
    if (!wysiwygEditorRef.current || !currentSelectedTopic) return;
    setIsExportingPDF(true);

    try {
      const topicTitle = currentSelectedTopic.title || 'Lezione';
      const examName = activeProject?.description || 'Studio';
      const dayTitle = currentDayData?.dayTitle || '';
      const dayDate = currentDayData?.date || '';

      // Crea contenitore temporaneo per la formattazione A4 pulita
      const printContainer = document.createElement('div');
      printContainer.className = 'pdf-export-container';
      
      printContainer.innerHTML = `
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
          <div style="font-size: 11px; color: #2563eb; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
            MinervaAI • Guida Didattica
          </div>
          <h1 style="margin: 6px 0 2px 0; font-size: 22px; color: #0f172a;">${topicTitle}</h1>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
            <strong>Materia:</strong> ${examName} • <strong>${dayTitle}</strong> (${dayDate})
          </div>
        </div>
        <div style="font-size: 13px; color: #1e293b; line-height: 1.7;">
          ${wysiwygEditorRef.current.innerHTML}
        </div>
        <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 10px; font-size: 10px; color: #94a3b8; text-align: center;">
          Documento generato con MinervaAI • ${new Date().toLocaleDateString('it-IT')}
        </div>
      `;

      const opt = {
        margin: [12, 12, 12, 12],
        filename: `${topicTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_Lezione.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (typeof window !== 'undefined' && window.html2pdf) {
        window.html2pdf().set(opt).from(printContainer).save().then(() => {
          setIsExportingPDF(false);
        });
      } else {
        // Fallback stampa browser
        const printWin = window.open('', '', 'width=800,height=900');
        printWin.document.write(`<html><head><title>${topicTitle}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/></head><body style="padding:20px; font-family:sans-serif;">${printContainer.innerHTML}</body></html>`);
        printWin.document.close();
        printWin.focus();
        printWin.print();
        printWin.close();
        setIsExportingPDF(false);
      }
    } catch (err) {
      console.error("Errore esportazione PDF:", err);
      alert("Errore durante la generazione del PDF.");
      setIsExportingPDF(false);
    }
  };

  // -------------------------------------------------------------
  // GESTIONE FILE E DRAG & DROP PER LA CHAT (MAX 10 FILE)
  // -------------------------------------------------------------
  const processFilesForChat = async (filesList) => {
    const remainingSlots = 10 - attachedFiles.length;
    if (remainingSlots <= 0) {
      alert("Puoi caricare un massimo di 10 file per richiesta.");
      return;
    }

    const filesToProcess = Array.from(filesList).slice(0, remainingSlots);

    for (const file of filesToProcess) {
      const name = file.name.toLowerCase();
      const mime = (file.type || '').toLowerCase();

      try {
        if (mime.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => {
            setAttachedFiles(prev => [...prev.slice(0, 9), {
              id: Date.now() + Math.random(),
              name: file.name,
              size: (file.size / 1024).toFixed(1) + ' KB',
              mimeType: file.type || 'image/jpeg',
              base64: reader.result,
              isImage: true
            }]);
          };
          reader.readAsDataURL(file);
        } else {
          let text = '';
          if (name.endsWith('.pdf') || mime.includes('pdf')) {
            const buffer = await file.arrayBuffer();
            const res = await extractTextFromPdf(buffer);
            text = res.text;
          } else if (name.endsWith('.docx') || mime.includes('word')) {
            const buffer = await file.arrayBuffer();
            const res = await extractTextFromDocx(buffer);
            text = res.text;
          } else if (name.endsWith('.pptx') || mime.includes('presentation')) {
            const buffer = await file.arrayBuffer();
            const res = await extractTextFromPptx(buffer);
            text = res.text;
          } else {
            text = await file.text();
          }

          setAttachedFiles(prev => [...prev.slice(0, 9), {
            id: Date.now() + Math.random(),
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            mimeType: file.type || 'text/plain',
            text: text,
            isImage: false
          }]);
        }
      } catch (err) {
        console.error("Errore lettura file per chat:", err);
      }
    }
  };

  const handleChatFileSelect = (e) => {
    if (e.target.files && e.target.files.length) {
      processFilesForChat(e.target.files);
    }
    e.target.value = '';
  };

  const handleChatDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChat(true);
  };

  const handleChatDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChat(false);
  };

  const handleChatDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChat(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      processFilesForChat(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachedChatFile = (fileId) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // -------------------------------------------------------------
  // DETTATURA VOCALE CON OPENAI WHISPER
  // -------------------------------------------------------------
  const handleToggleVoiceRecording = async () => {
    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingAudio(false);
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Il tuo browser non supporta la registrazione microfonica.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm');

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());

          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          if (audioBlob.size < 500) return;

          setIsTranscribingAudio(true);

          try {
            const reader = new FileReader();
            reader.onload = async () => {
              const base64Audio = reader.result;

              const res = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'transcribe_audio',
                  audioBase64: base64Audio,
                  audioMimeType: mimeType
                }),
              });

              const data = await res.json();
              if (data.text) {
                setInputPrompt(prev => prev ? `${prev.trim()} ${data.text.trim()}` : data.text.trim());
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (err) {
            console.error("Errore dettatura Whisper:", err);
          } finally {
            setIsTranscribingAudio(false);
          }
        };

        mediaRecorder.start();
        setIsRecordingAudio(true);
      } catch (err) {
        alert("Permesso microfono non concesso o errore audio.");
        setIsRecordingAudio(false);
      }
    }
  };

  // -------------------------------------------------------------
  // GESTIONE IMMAGINI NELLE LEZIONI (PASTE, UPLOAD & CONTROLLI)
  // -------------------------------------------------------------
  const insertImageAtCaret = (base64Url) => {
    if (!wysiwygEditorRef.current) return;

    wysiwygEditorRef.current.focus();
    const imgHtml = `<div class="lesson-image-wrapper my-4 text-center select-none" contenteditable="false"><img src="${base64Url}" alt="Immagine didattica" class="lesson-img rounded-2xl shadow-xl border border-geminiBorder/80 max-w-full inline-block cursor-pointer transition hover:opacity-90" style="width: 60%;" /></div><p><br></p>`;
    
    document.execCommand('insertHTML', false, imgHtml);
    handleEditorInput();
  };

  const handleEditorPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => insertImageAtCaret(reader.result);
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  };

  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => insertImageAtCaret(reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleAlignImage = (alignClass) => {
    if (selectedImageEl) {
      const wrapper = selectedImageEl.closest('.lesson-image-wrapper');
      if (wrapper) {
        wrapper.className = `lesson-image-wrapper my-4 select-none ${alignClass}`;
        handleEditorInput();
        updateImageBoxPosition(selectedImageEl);
      }
    }
  };

  const handleDeleteImage = () => {
    if (selectedImageEl) {
      const wrapper = selectedImageEl.closest('.lesson-image-wrapper');
      if (wrapper) wrapper.remove();
      else selectedImageEl.remove();
      setSelectedImageEl(null);
      setImageBoxRect(null);
      setImageToolPos(null);
      handleEditorInput();
    }
  };

  // Wizard multi-file
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
        } else if (name.endsWith('.pptx') || mime.includes('presentation')) {
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
        quizHistory: []
      };

      setSavedProjects(old => [newProject, ...(old || [])]);
    if (user) {
      saveProjectToCloud(user.id, newProject);
    }
      setActiveProject(newProject);
      setSidebarTab('projects');

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
      if (wysiwygEditorRef.current) {
        wysiwygEditorRef.current.innerHTML = renderMarkdownAndLatexToHtml(lessonContent);
      }
    } catch (err) {
      alert(`Errore nella generazione: ${err.message}`);
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  // Aggiornamento testo della lezione
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
    if (user) {
      saveProjectToCloud(user.id, updatedProject);
    }
  };

  // Sincronizzazione in tempo reale durante la digitazione nell'editor WYSIWYG
  const handleEditorInput = () => {
    if (!wysiwygEditorRef.current || !currentDayData || !currentSelectedTopic) return;
    const rawText = wysiwygEditorRef.current.innerText || '';
    updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, rawText);
  };

  // COMANDI FORMATTAZIONE TESTO
  const applyFormattingCommand = (command, value = null) => {
    if (typeof document !== 'undefined') {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(command, false, value);
      if (wysiwygEditorRef.current) {
        wysiwygEditorRef.current.focus();
        handleEditorInput();
      }
    }
  };

  // DIMENSIONE TESTO (DA 4 A 32 PX)
  const applyCustomFontSize = (sizePx) => {
    setSelectedFontSize(sizePx);
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    try {
      document.execCommand('styleWithCSS', false, true);
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontSize = `${sizePx}px`;
      span.appendChild(range.extractContents());
      range.insertNode(span);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.addRange(newRange);
      handleEditorInput();
    } catch (e) {
      console.warn("Font size error:", e);
    }
  };

  // CARATTERE TESTO (FONT FAMILY)
  const applyCustomFontFamily = (fontName) => {
    setSelectedFontFamily(fontName);
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    try {
      document.execCommand('styleWithCSS', false, true);
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontFamily = fontName;
      span.appendChild(range.extractContents());
      range.insertNode(span);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.addRange(newRange);
      handleEditorInput();
    } catch (e) {
      console.warn("Font family error:", e);
    }
  };

  // ALLINEAMENTO TESTO
  const applyAlignment = (alignType) => {
    document.execCommand('styleWithCSS', false, true);
    if (alignType === 'left') document.execCommand('justifyLeft', false, null);
    else if (alignType === 'center') document.execCommand('justifyCenter', false, null);
    else if (alignType === 'right') document.execCommand('justifyRight', false, null);
    else if (alignType === 'justify') document.execCommand('justifyFull', false, null);
    handleEditorInput();
  };

  // RISCRITTURA DA POPUP FLUTTUANTE
  const handleRewriteFromPopup = async (mode) => {
    if (!floatingPopup || !floatingPopup.text || isRewriting) return;

    const selectedText = floatingPopup.text;
    const targetRange = floatingPopup.range;
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
      const formattedHtmlReplacement = renderMarkdownAndLatexToHtml(newRewrittenText);

      if (targetRange) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedHtmlReplacement;
        targetRange.deleteContents();
        const frag = document.createDocumentFragment();
        while (tempDiv.firstChild) {
          frag.appendChild(tempDiv.firstChild);
        }
        targetRange.insertNode(frag);
        handleEditorInput();
      }

      setFloatingPopup(null);
    } catch (err) {
      alert(`Errore: ${err.message}`);
    } finally {
      setIsRewriting(false);
    }
  };

  // DETTATURA VOCALE CHAT DELLA LEZIONE CON WHISPER
  const handleToggleLessonVoiceRecording = async () => {
    if (isRecordingLessonAudio) {
      if (lessonMediaRecorderRef.current && lessonMediaRecorderRef.current.state !== 'inactive') {
        lessonMediaRecorderRef.current.stop();
      }
      setIsRecordingLessonAudio(false);
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Il tuo browser non supporta la registrazione microfonica.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        lessonAudioChunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm');

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        lessonMediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            lessonAudioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());

          const audioBlob = new Blob(lessonAudioChunksRef.current, { type: mimeType });
          if (audioBlob.size < 500) return;

          setIsTranscribingLessonAudio(true);

          try {
            const reader = new FileReader();
            reader.onload = async () => {
              const base64Audio = reader.result;

              const res = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'transcribe_audio',
                  audioBase64: base64Audio,
                  audioMimeType: mimeType
                }),
              });

              const data = await res.json();
              if (data.text) {
                setLessonChatInput(prev => prev ? `${prev.trim()} ${data.text.trim()}` : data.text.trim());
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (err) {
            console.error("Errore dettatura Whisper lezione:", err);
          } finally {
            setIsTranscribingLessonAudio(false);
          }
        };

        mediaRecorder.start();
        setIsRecordingLessonAudio(true);
      } catch (err) {
        alert("Permesso microfono non concesso o errore audio.");
        setIsRecordingLessonAudio(false);
      }
    }
  };

    // CHATBOT LEZIONE: MODIFICA DIRETTA
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

      if (data.hasUpdatedLesson && data.updatedLessonContent) {
        setPreviousLessonBackup(currentDocText);
        updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, data.updatedLessonContent);
        if (wysiwygEditorRef.current) {
          wysiwygEditorRef.current.innerHTML = renderMarkdownAndLatexToHtml(data.updatedLessonContent);
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

  const handleUndoChatbotChange = () => {
    if (previousLessonBackup && currentDayData && currentSelectedTopic) {
      updateTopicLessonContent(currentDayData.dayNumber, currentSelectedTopic.id, previousLessonBackup);
      if (wysiwygEditorRef.current) {
        wysiwygEditorRef.current.innerHTML = renderMarkdownAndLatexToHtml(previousLessonBackup);
      }
      setPreviousLessonBackup(null);
      alert("Modifica del chatbot annullata.");
    }
  };

  // -----------------------------------------------------------------
  // LOGICA VERIFICA COMPETENZE & GRADO DI PREPARAZIONE
  // -----------------------------------------------------------------
  const getAllProjectTopics = () => {
    if (!activeProject || !Array.isArray(activeProject.schedule)) return [];
    const list = [];
    activeProject.schedule.forEach(d => {
      if (Array.isArray(d.topics)) {
        d.topics.forEach(t => {
          list.push({
            id: t.id,
            title: t.title,
            dayNumber: d.dayNumber,
            dayTitle: d.dayTitle,
            hasLesson: Boolean(t.lesson),
            quizScore: t.quizScore || null
          });
        });
      }
    });
    return list;
  };

  const handleOpenGeneralQuizModal = () => {
    const allTopics = getAllProjectTopics();
    setSelectedTopicsForQuiz(allTopics.map(t => t.title));
    setIsSingleLessonQuiz(false);
    setQuizStep(1);
    setIsQuizModalOpen(true);
    setQuizQuestions([]);
    setUserAnswers({});
    setMatchingSelections({});
    setImmediateEvaluations({});
  };

  const handleOpenSingleLessonQuizModal = () => {
    if (!currentSelectedTopic) return;
    setSelectedTopicsForQuiz([currentSelectedTopic.title]);
    setIsSingleLessonQuiz(true);
    setQuizNumQuestions(5);
    setQuizStep(2);
    setIsQuizModalOpen(true);
    setQuizQuestions([]);
    setUserAnswers({});
    setMatchingSelections({});
    setImmediateEvaluations({});
  };

  const handleToggleSelectAllTopics = () => {
    const allTopics = getAllProjectTopics();
    if (selectedTopicsForQuiz.length === allTopics.length) {
      setSelectedTopicsForQuiz([]);
    } else {
      setSelectedTopicsForQuiz(allTopics.map(t => t.title));
    }
  };

  const handleToggleTopicSelection = (topicTitle) => {
    if (selectedTopicsForQuiz.includes(topicTitle)) {
      setSelectedTopicsForQuiz(prev => prev.filter(t => t !== topicTitle));
    } else {
      setSelectedTopicsForQuiz(prev => [...prev, topicTitle]);
    }
  };

  const handleToggleQuestionType = (typeId) => {
    if (quizQuestionTypes.includes(typeId)) {
      if (quizQuestionTypes.length > 1) {
        setQuizQuestionTypes(prev => prev.filter(t => t !== typeId));
      }
    } else {
      setQuizQuestionTypes(prev => [...prev, typeId]);
    }
  };

  const handleGenerateQuizSession = async () => {
    if (selectedTopicsForQuiz.length === 0) {
      alert("Seleziona almeno una lezione da includere nella prova.");
      return;
    }

    setQuizStep(3);

    try {
      const dbData = await getProjectDataFromDB(activeProject.id);
      const files = dbData?.files || activeProject.files || [];

      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_quiz',
          topicsList: selectedTopicsForQuiz,
          questionTypes: quizQuestionTypes,
          numQuestions: quizNumQuestions,
          difficulty: quizDifficulty,
          examDescription: activeProject.description,
          sourceType: activeProject.sourceType,
          files: activeProject.sourceType === 'my_materials' ? files : [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error(data.error || "Impossibile generare le domande di verifica.");
      }

      setQuizQuestions(data.questions);
      setCurrentQuestionIndex(0);
      setUserAnswers({});
      setMatchingSelections({});
      setImmediateEvaluations({});
      setQuizStep(4);
    } catch (err) {
      alert(`Errore generazione verifica: ${err.message}`);
      setQuizStep(2);
    }
  };

  const evaluateCompletionIntelligently = (userAns, correctAns, altAnswers = [], explanation = '') => {
    if (!userAns || !userAns.trim()) {
      return { 
        isCorrect: false, 
        score: 0, 
        feedback: `Non hai inserito alcuna risposta. Il termine corretto atteso era: "${correctAns}".` 
      };
    }

    const cleanUser = userAns.trim().toLowerCase();
    const cleanCorrect = (correctAns || '').trim().toLowerCase();
    
    if (cleanUser === cleanCorrect) {
      return { 
        isCorrect: true, 
        score: 30, 
        feedback: `Perfetto! Risposta corretta (30/30). ${explanation}` 
      };
    }

    if (Array.isArray(altAnswers) && altAnswers.some(alt => alt.trim().toLowerCase() === cleanUser)) {
      return { 
        isCorrect: true, 
        score: 30, 
        feedback: `Ottimo! La risposta "${userAns}" è corretta (30/30). ${explanation}` 
      };
    }

    const userWords = cleanUser.split(/\s+/).filter(w => w.length > 2);
    const correctWords = cleanCorrect.split(/\s+/).filter(w => w.length > 2);
    const hasOverlap = userWords.some(w => cleanCorrect.includes(w)) || correctWords.some(w => cleanUser.includes(w));

    if (hasOverlap) {
      return {
        isCorrect: true,
        score: 27,
        feedback: `Molto bene! Hai individuato il concetto fondamentale ("${userAns}"). La dicitura specialistica più precisa è "${correctAns}". ${explanation}`
      };
    }

    return {
      isCorrect: false,
      score: 10,
      feedback: `Il termine specifico richiesto dalla domanda era "${correctAns}". ${explanation}`
    };
  };

  const handleEvaluateCurrentOpenAnswer = async (q) => {
    const studentAnswer = (userAnswers[q.id] || '').trim();
    if (!studentAnswer) {
      alert("Scrivi la tua risposta prima di richiedere la valutazione.");
      return;
    }

    setIsEvaluatingOpen(true);
    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate_open_answer',
          question: q.question,
          idealAnswerCriteria: q.idealAnswerCriteria,
          studentAnswer: studentAnswer,
          topicTitle: q.topicTitle,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore valutazione.");

      setImmediateEvaluations(prev => ({
        ...prev,
        [q.id]: data
      }));
    } catch (err) {
      alert(`Errore valutazione risposta: ${err.message}`);
    } finally {
      setIsEvaluatingOpen(false);
    }
  };

  const handleCheckImmediateAnswer = (q) => {
    if (q.type === 'aperta') {
      handleEvaluateCurrentOpenAnswer(q);
      return;
    }

    let evaluation = { isCorrect: false, score: 0, feedback: '' };
    const userAns = userAnswers[q.id];

    if (q.type === 'scelta_multipla') {
      const isCorrect = (userAns || '').trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
      evaluation = {
        isCorrect,
        score: isCorrect ? 30 : 0,
        feedback: isCorrect ? `Risposta esatta! ${q.explanation || ''}` : `Risposta non corretta. Quella esatta è: "${q.correctAnswer}". ${q.explanation || ''}`
      };
    } else if (q.type === 'completamento') {
      evaluation = evaluateCompletionIntelligently(userAns, q.correctAnswer, q.alternativeAnswers, q.explanation);
    } else if (q.type === 'accoppiamento') {
      const userPairs = matchingSelections[q.id] || {};
      const totalPairs = q.matchingPairs?.length || 0;
      let matchedCount = 0;
      (q.matchingPairs || []).forEach((pair, idx) => {
        if (userPairs[idx] === pair.right) matchedCount++;
      });
      const isCorrect = matchedCount === totalPairs && totalPairs > 0;
      const score = Math.round((matchedCount / Math.max(1, totalPairs)) * 30);
      evaluation = {
        isCorrect: score >= 18,
        score: score,
        feedback: isCorrect 
          ? `Tutte le associazioni sono corrette! (30/30)` 
          : `Hai associato correttamente ${matchedCount} su ${totalPairs} elementi. (${score}/30). ${q.explanation || ''}`
      };
    }

    setImmediateEvaluations(prev => ({
      ...prev,
      [q.id]: evaluation
    }));
  };

  const calculateFinalQuizScore = () => {
    if (!quizQuestions.length) return { total: 0, correct: 0, percentage: 0, averageScore: 0 };
    let correctCount = 0;
    let totalScore = 0;

    quizQuestions.forEach(q => {
      const ev = immediateEvaluations[q.id];
      if (ev) {
        if (ev.isCorrect) correctCount++;
        totalScore += (ev.score !== undefined ? ev.score : (ev.isCorrect ? 30 : 0));
      } else {
        const userAns = userAnswers[q.id];
        if (q.type === 'scelta_multipla' && (userAns || '').trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase()) {
          correctCount++;
          totalScore += 30;
        }
      }
    });

    const percentage = Math.round((correctCount / quizQuestions.length) * 100);
    const averageScore = Math.round(totalScore / quizQuestions.length);
    return { total: quizQuestions.length, correct: correctCount, percentage, averageScore };
  };

  const handleFinishQuiz = () => {
    quizQuestions.forEach(q => {
      if (!immediateEvaluations[q.id]) {
        handleCheckImmediateAnswer(q);
      }
    });

    const results = calculateFinalQuizScore();

    if (activeProject) {
      const newHistoryEntry = {
        date: new Date().toISOString(),
        score: results.averageScore,
        percentage: results.percentage,
        topics: selectedTopicsForQuiz,
        numQuestions: quizQuestions.length
      };

      const updatedHistory = [newHistoryEntry, ...(activeProject.quizHistory || [])];

      let updatedSchedule = activeProject.schedule;
      if (isSingleLessonQuiz && currentSelectedTopic && currentDayData) {
        updatedSchedule = (activeProject.schedule || []).map(d => {
          if (d.dayNumber === currentDayData.dayNumber) {
            const updatedTopics = (d.topics || []).map(t => {
              if (t.id === currentSelectedTopic.id) {
                return { ...t, quizScore: results.averageScore };
              }
              return t;
            });
            return { ...d, topics: updatedTopics };
          }
          return d;
        });
      }

      const updatedProj = { ...activeProject, quizHistory: updatedHistory, schedule: updatedSchedule };
      setActiveProject(updatedProj);
      setSavedProjects(prev => (prev || []).map(p => p.id === activeProject.id ? updatedProj : p));
      if (user) {
        saveProjectToCloud(user.id, updatedProj);
      }
    }

    setQuizStep(5);
  };

  const calculateOverallReadiness = () => {
    if (!activeProject) return { percentage: 0, label: 'Inizio percorso', averageQuizScore: 0, testsCount: 0 };

    const globalProg = calculateGlobalProgress();
    const studiedPercent = globalProg.percent;

    const history = activeProject.quizHistory || [];
    const testsCount = history.length;

    let avgQuizScore = 0;
    if (testsCount > 0) {
      const sum = history.reduce((acc, h) => acc + (h.score || 0), 0);
      avgQuizScore = Math.round(sum / testsCount);
    }

    const quizScorePercentage = Math.round((avgQuizScore / 30) * 100);

    let finalReadiness = 0;
    if (testsCount === 0) {
      finalReadiness = Math.round(studiedPercent * 0.7);
    } else {
      finalReadiness = Math.round((studiedPercent * 0.4) + (quizScorePercentage * 0.6));
    }

    finalReadiness = Math.max(0, Math.min(100, finalReadiness));

    let label = 'Basi in costruzione';
    if (finalReadiness >= 90) label = 'Padronanza Eccellente (Livello 30 e Lode)';
    else if (finalReadiness >= 75) label = 'Padronanza Approfondita (Voto Alto)';
    else if (finalReadiness >= 55) label = 'Buona Preparazione Generale';
    else if (finalReadiness >= 30) label = 'Conoscenza di Base';

    return {
      percentage: finalReadiness,
      label,
      averageQuizScore: avgQuizScore,
      testsCount
    };
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
    if (user) {
      saveProjectToCloud(user.id, updatedProject);
    }
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

  // Chat Homepage: invio messaggi con multi-file (fino a 10 file)
  const handleSendMessage = async (textToSend = inputPrompt) => {
    const prompt = textToSend.trim();
    if (!prompt && attachedFiles.length === 0) return;
    if (isLoading) return;

    const userMessage = {
      role: 'user',
      text: prompt,
      files: attachedFiles.map(f => ({ name: f.name, size: f.size, isImage: f.isImage })),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputPrompt('');
    const filesPayload = [...attachedFiles];
    setAttachedFiles([]);
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
          files: filesPayload,
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
        const title = prompt ? (prompt.slice(0, 28) + (prompt.length > 28 ? '...' : '')) : (filesPayload[0]?.name || 'Nuova sessione');
        setConversations([{ id: chatId, title, messages: updatedMessages }, ...(conversations || [])]);
      if (user) {
        saveChatToCloud(user.id, { id: chatId, title, messages: updatedMessages });
      }
      } else {
        setConversations((conversations || []).map(c => c.id === chatId ? { ...c, messages: updatedMessages } : c));
      if (user) {
        saveChatToCloud(user.id, { id: chatId, title: conversations.find(c => c.id === chatId)?.title || 'Conversazione', messages: updatedMessages });
      }
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

  const totalFilesSelected = wizardUploadedFiles.length;
  const totalFilesReady = wizardUploadedFiles.filter(f => f.status === 'ready').length;
  const isAnyFileExtracting = extractingCount > 0 || wizardUploadedFiles.some(f => f.status === 'extracting');

  const fontSizes = [4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32];
  const allProjectTopics = getAllProjectTopics();
  const currentQuizQ = quizQuestions[currentQuestionIndex];
  const readiness = calculateOverallReadiness();

  // CONTROLLO ABBONAMENTO OBBLIGATORIO (PAYWALL STRIPE 14,99 €/MESE)
  const isSubscribed = Boolean(userProfile?.subscription_status === 'active' || userProfile?.is_premium);

  if (!isSubscribed) {
    const stripeCheckoutUrl = `${STRIPE_PAYMENT_URL}?prefilled_email=${encodeURIComponent(user?.email || '')}&client_reference_id=${user?.id || ''}`;

    return (
      <div className={`min-h-screen w-screen flex flex-col items-center justify-center p-4 sm:p-6 transition ${
        theme === 'light' ? 'bg-[#f8fafc] text-slate-900' : 'bg-geminiDark text-gray-100'
      }`}>
        {/* Toggle Tema in alto a destra */}
        <button
          onClick={toggleTheme}
          className={`absolute top-6 right-6 p-2.5 rounded-2xl border transition shadow-lg ${
            theme === 'light' 
              ? 'bg-white border-slate-200 text-slate-600 hover:text-amber-500' 
              : 'bg-geminiDarkSecondary border-geminiBorder text-gray-400 hover:text-amber-400'
          }`}
          title={theme === 'dark' ? "Passa a Modalità Giorno" : "Passa a Modalità Notte"}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className={`w-full max-w-lg border rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 transition animate-popup ${
          theme === 'light' ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-geminiDarkSecondary border-geminiBorder'
        }`}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto flex items-center justify-center overflow-hidden">
              <AppLogo className="w-16 h-16" imgClassName="w-16 h-16 object-contain drop-shadow-xl" />
            </div>
            
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                Abbonamento Obbligatorio
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
                Sblocca MinervaAI Premium
              </h1>
              <p className={`text-xs max-w-sm mx-auto ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                Accedi senza limiti alla piattaforma intelligente per la preparazione dei tuoi esami universitari.
              </p>
            </div>
          </div>

          {/* Scheda Prezzo */}
          <div className={`p-6 rounded-3xl border relative overflow-hidden transition ${
            theme === 'light'
              ? 'bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/40 border-blue-200'
              : 'bg-gradient-to-br from-blue-950/40 via-indigo-950/20 to-geminiDark border-blue-500/30'
          }`}>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-blue-500">Piano Mensile</div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight text-blue-600 mt-1">
                  14,99 € <span className={`text-xs font-normal ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>/ mese</span>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                Rinnovo Mensile
              </span>
            </div>

            {/* Lista Vantaggi */}
            <div className="mt-5 space-y-2.5 text-xs">
              {[
                "Accesso illimitato a tutte le lezioni con scalette complete al 100%",
                "Formule scientifiche renderizzate in tempo reale con KaTeX/LaTeX",
                "Verifiche e Quiz con valutazione in trentesimi (0-30/30)",
                "Dettatura vocale ad altissima precisione con OpenAI Whisper",
                "Analisi e confronto simultaneo fino a 10 file (PDF, Word, PPTX)",
                "Sincronizzazione cloud e accesso da tutti i tuoi dispositivi"
              ].map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <CheckCircle2 size={15} className="text-blue-500 shrink-0" />
                  <span className={theme === 'light' ? 'text-slate-700 font-medium' : 'text-gray-300'}>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pulsante di Pagamento Stripe */}
          <div className="space-y-3 pt-1">
            <a
              href={stripeCheckoutUrl}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-600/30 transition transform active:scale-98 flex items-center justify-center gap-2.5 text-sm"
            >
              <Sparkles size={18} />
              <span>Abbonati a 14,99 €/mese con Stripe</span>
            </a>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={async () => {
                  if (!user?.id) return;
                  setIsCheckingPayment(true);
                  const p = await fetchUserProfile(user.id);
                  setUserProfile(p);
                  setIsCheckingPayment(false);
                }}
                disabled={isCheckingPayment}
                className="text-xs text-blue-500 hover:underline font-semibold flex items-center gap-1.5"
              >
                {isCheckingPayment && <RefreshCw size={12} className="animate-spin" />}
                <span>Hai già pagato? Verifica e Sblocca</span>
              </button>

              <button
                onClick={handleSignOut}
                className={`text-xs hover:underline flex items-center gap-1 ${
                  theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <LogOut size={12} />
                <span>Esci dall'account</span>
              </button>
            </div>
          </div>

          <p className={`text-[10px] text-center ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>
            Pagamenti protetti e gestiti in sicurezza da Stripe • Nessun vincolo, puoi disdire in qualsiasi momento.
          </p>
        </div>
      </div>
    );
  }


  if (isAuthInitializing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-geminiDark text-gray-100">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 flex items-center justify-center animate-pulse">
            <AppLogo className="w-16 h-16" imgClassName="w-16 h-16 object-contain drop-shadow-xl" />
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <RefreshCw size={16} className="animate-spin text-blue-500" />
            <span>Avvio di MinervaAI...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-geminiDark text-gray-100 p-4 sm:p-6 selection:bg-blue-600 selection:text-white relative">
        {/* Toggle Tema Notte / Giorno */}
        <button
          onClick={toggleTheme}
          className="absolute top-6 right-6 p-2.5 rounded-2xl bg-geminiDarkSecondary border border-geminiBorder text-gray-400 hover:text-amber-400 hover:bg-geminiHover transition shadow-lg"
          title={theme === 'dark' ? "Passa a Modalità Giorno (Chiaro)" : "Passa a Modalità Notte (Scuro)"}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-md bg-geminiDarkSecondary border border-geminiBorder rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-popup">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto flex items-center justify-center">
              <AppLogo className="w-16 h-16" imgClassName="w-16 h-16 object-contain drop-shadow-xl" />
            </div>
            <h1 className="text-2xl font-bold text-gray-100 tracking-tight flex items-center justify-center gap-2">
              MinervaAI
            </h1>
            <p className="text-xs text-gray-400">
              {authMode === 'login' && 'Accedi al tuo account per visualizzare i tuoi progetti di studio e le tue lezioni.'}
              {authMode === 'signup' && 'Crea un account gratuito per salvare e sincronizzare i tuoi esami nel cloud.'}
              {authMode === 'reset' && 'Inserisci la tua email per ricevere le istruzioni di recupero password.'}
            </p>
          </div>

          {/* Switcher Tab Accedi / Registrati */}
          {authMode !== 'reset' && (
            <div className="flex bg-geminiDark p-1 rounded-2xl border border-geminiBorder">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
                  authMode === 'login'
                    ? 'bg-geminiDarkSecondary text-blue-400 shadow-md border border-geminiBorder/60'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Accedi
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
                  authMode === 'signup'
                    ? 'bg-geminiDarkSecondary text-blue-400 shadow-md border border-geminiBorder/60'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Registrati
              </button>
            </div>
          )}

          {/* Banner Errore / Successo */}
          {authError && (
            <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs text-red-400">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{authError}</span>
            </div>
          )}
          {authSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                  Nome Completo
                </label>
                <div className="relative flex items-center">
                  <User size={16} className="absolute left-3.5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    placeholder="es. Mario Rossi"
                    className="w-full bg-geminiDark border border-geminiBorder rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                Email
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="absolute left-3.5 text-gray-400" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="nome@esempio.it"
                  className="w-full bg-geminiDark border border-geminiBorder rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            {authMode !== 'reset' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                    Password
                  </label>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setAuthMode('reset'); setAuthError(''); setAuthSuccess(''); }}
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      Password dimenticata?
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <Lock size={16} className="absolute left-3.5 text-gray-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Minimo 6 caratteri"
                    className="w-full bg-geminiDark border border-geminiBorder rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl shadow-lg shadow-blue-600/25 transition transform active:scale-98 flex items-center justify-center gap-2 text-sm"
            >
              {isAuthSubmitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Elaborazione in corso...</span>
                </>
              ) : (
                <>
                  {authMode === 'login' && (
                    <>
                      <LogIn size={16} />
                      <span>Accedi</span>
                    </>
                  )}
                  {authMode === 'signup' && (
                    <>
                      <Sparkles size={16} />
                      <span>Crea Account Gratuito</span>
                    </>
                  )}
                  {authMode === 'reset' && (
                    <>
                      <Mail size={16} />
                      <span>Invia Link di Recupero</span>
                    </>
                  )}
                </>
              )}
            </button>
          </form>

          {authMode === 'reset' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                className="text-xs text-blue-400 hover:underline font-semibold"
              >
                Torna al Login
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-geminiDark text-gray-200 relative font-sans">
      
      {/* POPUP FLUTTUANTE AUTOMATICO SU SELEZIONE TESTO */}
      {floatingPopup && (
        <div 
          id="floating-selection-popup"
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 bg-geminiDarkSecondary/95 border border-blue-500/80 shadow-2xl rounded-2xl p-1.5 flex items-center gap-1.5 animate-popup text-xs backdrop-blur-md"
          style={{
            left: `${floatingPopup.x}px`,
            top: `${floatingPopup.y}px`,
          }}
        >
          {isRewriting ? (
            <div className="flex items-center gap-2 px-3 py-1 text-xs text-blue-300">
              <RefreshCw size={13} className="animate-spin text-blue-400" />
              <span>Elaborazione in corso...</span>
            </div>
          ) : (
            <>
              <button
                onClick={() => handleRewriteFromPopup('riassumi')}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-blue-600/30 text-gray-200 hover:text-white rounded-xl transition text-xs font-semibold"
                title="Sintetizza la parte selezionata"
              >
                <span>📝 Riassumi</span>
              </button>
              <div className="w-[1px] h-4 bg-geminiBorder" />
              <button
                onClick={() => handleRewriteFromPopup('approfondisci')}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-blue-600/30 text-gray-200 hover:text-white rounded-xl transition text-xs font-semibold"
                title="Aggiungi spiegazioni, formule e dettagli"
              >
                <span>🔍 Approfondisci</span>
              </button>
              <div className="w-[1px] h-4 bg-geminiBorder" />
              <button
                onClick={() => handleRewriteFromPopup('chiaro')}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-blue-600/30 text-gray-200 hover:text-white rounded-xl transition text-xs font-semibold"
                title="Riscrivi in modo più chiaro e semplice"
              >
                <span>💡 Riscrivi meglio</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* OVERLAY CORNER & EDGE HANDLES PER RIDIMENSIONAMENTO TRASCINABILE IMMAGINE */}
      {selectedImageEl && imageBoxRect && (
        <div
          id="image-resize-overlay"
          className="fixed z-40 pointer-events-auto border-2 border-blue-500"
          style={{
            left: `${imageBoxRect.left}px`,
            top: `${imageBoxRect.top}px`,
            width: `${imageBoxRect.width}px`,
            height: `${imageBoxRect.height}px`,
          }}
        >
          {/* Maniglie Angoli */}
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'nw')}
            className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition"
            title="Trascina per ridimensionare"
          />
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'ne')}
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition"
            title="Trascina per ridimensionare"
          />
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'sw')}
            className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition"
            title="Trascina per ridimensionare"
          />
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'se')}
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition"
            title="Trascina per ridimensionare"
          />

          {/* Maniglie Lati */}
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'n')}
            className="absolute -top-1.5 left-1/2 transform -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-ns-resize shadow-md hover:scale-125 transition"
            title="Trascina altezza"
          />
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 's')}
            className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-ns-resize shadow-md hover:scale-125 transition"
            title="Trascina altezza"
          />
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'w')}
            className="absolute top-1/2 -left-1.5 transform -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-ew-resize shadow-md hover:scale-125 transition"
            title="Trascina larghezza"
          />
          <div 
            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'e')}
            className="absolute top-1/2 -right-1.5 transform -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-ew-resize shadow-md hover:scale-125 transition"
            title="Trascina larghezza"
          />
        </div>
      )}

      {/* TOOLBAR CONTESTUALE ALLINEAMENTO & ELIMINA IMMAGINE */}
      {selectedImageEl && imageToolPos && (
        <div
          id="image-editing-toolbar"
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 bg-geminiDarkSecondary border border-indigo-500/80 shadow-2xl rounded-2xl p-1.5 flex items-center gap-1.5 animate-popup text-xs backdrop-blur-md"
          style={{
            left: `${imageToolPos.x}px`,
            top: `${imageToolPos.y}px`,
          }}
        >
          <span className="text-[10px] text-gray-400 font-bold px-1">Allinea:</span>
          <button
            onClick={() => handleAlignImage('text-left')}
            className="p-1 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
            title="Allinea a sinistra"
          >
            <AlignLeft size={13} />
          </button>
          <button
            onClick={() => handleAlignImage('text-center')}
            className="p-1 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
            title="Centra"
          >
            <AlignCenter size={13} />
          </button>
          <button
            onClick={() => handleAlignImage('text-right')}
            className="p-1 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
            title="Allinea a destra"
          >
            <AlignRight size={13} />
          </button>

          <div className="w-[1px] h-4 bg-geminiBorder mx-0.5" />

          <button
            onClick={handleDeleteImage}
            className="p-1 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition"
            title="Elimina immagine"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* MODAL DIALOG PER VERIFICA COMPETENZE (5 STEP) */}
      {isQuizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-geminiDarkSecondary border border-geminiBorder w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-geminiBorder/60 bg-geminiDarkSecondary shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <GraduationCap size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-100">
                    {isSingleLessonQuiz ? `Verifica: ${selectedTopicsForQuiz[0]}` : "Verifica Competenze"}
                  </h3>
                  <p className="text-[11px] text-gray-400">Valutazione didattica e consolidamento della preparazione</p>
                </div>
              </div>
              <button 
                onClick={() => setIsQuizModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-geminiHover rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              
              {quizStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-100">1. Scegli le lezioni da verificare</h4>
                      <p className="text-xs text-gray-400 mt-0.5">Seleziona gli argomenti che faranno parte della prova.</p>
                    </div>
                    <button
                      onClick={handleToggleSelectAllTopics}
                      className="px-3 py-1.5 rounded-xl bg-geminiDark hover:bg-geminiHover border border-geminiBorder text-xs text-blue-400 font-semibold transition"
                    >
                      {selectedTopicsForQuiz.length === allProjectTopics.length ? "Deseleziona tutto" : "Seleziona tutto"}
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {allProjectTopics.map(topic => {
                      const isChecked = selectedTopicsForQuiz.includes(topic.title);
                      return (
                        <div
                          key={topic.id}
                          onClick={() => handleToggleTopicSelection(topic.title)}
                          className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                            isChecked 
                              ? 'bg-blue-600/15 border-blue-500 shadow-sm'
                              : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          <div className="flex items-center gap-3 truncate pr-2">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="accent-blue-500 w-4 h-4 rounded"
                            />
                            <div className="truncate">
                              <span className="text-[10px] text-blue-400 font-bold mr-2 uppercase">Giorno {topic.dayNumber}</span>
                              <span className="text-xs font-medium text-gray-200 truncate">{topic.title}</span>
                            </div>
                          </div>
                          {topic.quizScore && (
                            <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/20 shrink-0 font-bold">
                              Ultimo voto: {topic.quizScore}/30
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-geminiBorder/60">
                    <span className="text-xs text-gray-400">
                      {selectedTopicsForQuiz.length} di {allProjectTopics.length} argomenti selezionati
                    </span>
                    <button
                      onClick={() => setQuizStep(2)}
                      disabled={selectedTopicsForQuiz.length === 0}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition ${
                        selectedTopicsForQuiz.length > 0 
                          ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <span>Avanti: Configura Prova</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {quizStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm font-bold text-gray-100">
                      {isSingleLessonQuiz ? "Configura la verifica di questa lezione" : "2. Configura le preferenze della verifica"}
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Argomento/i: <strong>{selectedTopicsForQuiz.length === 1 ? selectedTopicsForQuiz[0] : `${selectedTopicsForQuiz.length} lezioni selezionate`}</strong>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Tipologia di domande
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { id: 'scelta_multipla', label: 'Scelta multipla (4 opzioni)', icon: '🔘' },
                        { id: 'completamento', label: 'Completamenti (parola chiave)', icon: '✍️' },
                        { id: 'accoppiamento', label: 'Accoppiamenti (collega coppie)', icon: '🔗' },
                        { id: 'aperta', label: 'Domande aperte (voto in /30)', icon: '📝' },
                      ].map(type => {
                        const isChecked = quizQuestionTypes.includes(type.id);
                        return (
                          <div
                            key={type.id}
                            onClick={() => handleToggleQuestionType(type.id)}
                            className={`p-3 rounded-2xl border cursor-pointer transition flex items-center gap-2.5 ${
                              isChecked 
                                ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium shadow-sm'
                                : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500'
                            }`}
                          >
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="accent-indigo-500 w-4 h-4 rounded"
                            />
                            <span className="text-xs">{type.icon} {type.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-300 uppercase tracking-wider">Numero di domande (Min 3 - Max 80)</span>
                      <span className="font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20 text-sm">
                        {quizNumQuestions} domande
                      </span>
                    </div>
                    <input 
                      type="range"
                      min="3"
                      max="80"
                      step="1"
                      value={quizNumQuestions}
                      onChange={(e) => setQuizNumQuestions(Number(e.target.value))}
                      className="w-full accent-amber-500 h-2 bg-geminiDark rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Grado di difficoltà
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'automatico', label: 'Automatico (consigliato)' },
                        { id: 'facile', label: 'Facili' },
                        { id: 'intermedia', label: 'Intermedie' },
                        { id: 'difficile', label: 'Difficili' }
                      ].map(d => (
                        <button
                          key={d.id}
                          onClick={() => setQuizDifficulty(d.id)}
                          className={`p-2.5 rounded-xl border text-[11px] font-semibold transition ${
                            quizDifficulty === d.id 
                              ? 'bg-blue-600/20 border-blue-500 text-blue-200' 
                              : 'bg-geminiDark border-geminiBorder text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Quando vuoi ricevere il feedback?
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        onClick={() => setQuizFeedbackMode('immediato')}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition space-y-1 ${
                          quizFeedbackMode === 'immediato'
                            ? 'bg-amber-500/15 border-amber-500 shadow-sm'
                            : 'bg-geminiDark border-geminiBorder text-gray-400'
                        }`}
                      >
                        <div className="text-xs font-bold text-gray-100">
                          ⚡ Subito dopo ogni risposta
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          Spiegazione didattica immediata dopo ogni quesito.
                        </p>
                      </div>

                      <div
                        onClick={() => setQuizFeedbackMode('finale')}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition space-y-1 ${
                          quizFeedbackMode === 'finale'
                            ? 'bg-amber-500/15 border-amber-500 shadow-sm'
                            : 'bg-geminiDark border-geminiBorder text-gray-400'
                        }`}
                      >
                        <div className="text-xs font-bold text-gray-100">
                          📋 Solo alla fine (Simulazione esame)
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          Report complessivo con voto al termine della prova.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-geminiBorder/60">
                    {!isSingleLessonQuiz ? (
                      <button
                        onClick={() => setQuizStep(1)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition"
                      >
                        <ArrowLeft size={14} />
                        <span>Indietro</span>
                      </button>
                    ) : <div />}
                    
                    <button
                      onClick={handleGenerateQuizSession}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-600/30 transition"
                    >
                      <Sparkles size={14} />
                      <span>Genera Verifica</span>
                    </button>
                  </div>
                </div>
              )}

              {quizStep === 3 && (
                <div className="py-16 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto animate-bounce">
                    <Sparkles size={28} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-gray-100">Formulazione delle domande...</h4>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto">
                      L'AI sta strutturando {quizNumQuestions} quesiti con terminologia specialistica e chiarezza didattica.
                    </p>
                  </div>
                </div>
              )}

              {quizStep === 4 && currentQuizQ && (
                <div className="space-y-5">
                  
                  <div className="flex items-center justify-between pb-2 border-b border-geminiBorder/40 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-400">Domanda {currentQuestionIndex + 1} di {quizQuestions.length}</span>
                      <span className="text-gray-500">•</span>
                      <span className="text-[11px] bg-geminiDark px-2.5 py-0.5 rounded-md border border-geminiBorder text-gray-300">
                        {currentQuizQ.topicTitle}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 capitalize px-2 py-0.5 rounded bg-geminiDark border border-geminiBorder">
                      {currentQuizQ.type ? currentQuizQ.type.replace('_', ' ') : 'Domanda'}
                    </span>
                  </div>

                  <div className="bg-geminiDark p-4 rounded-2xl border border-geminiBorder">
                    <h4 className="text-sm font-semibold text-gray-100 leading-relaxed">
                      {currentQuizQ.question}
                    </h4>
                  </div>

                  {currentQuizQ.type === 'scelta_multipla' && (
                    <div className="space-y-2">
                      {(currentQuizQ.options || []).map((opt, oIdx) => {
                        const isSelected = userAnswers[currentQuizQ.id] === opt;
                        return (
                          <div
                            key={oIdx}
                            onClick={() => {
                              setUserAnswers(prev => ({ ...prev, [currentQuizQ.id]: opt }));
                            }}
                            className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center gap-3 ${
                              isSelected 
                                ? 'bg-blue-600/20 border-blue-500 text-white font-medium shadow-sm ring-1 ring-blue-500' 
                                : 'bg-geminiDark border-geminiBorder text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isSelected ? 'bg-blue-600 text-white' : 'bg-geminiDarkSecondary text-gray-400 border border-geminiBorder'
                            }`}>
                              {String.fromCharCode(65 + oIdx)}
                            </div>
                            <span className="text-xs leading-relaxed">{opt}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {currentQuizQ.type === 'completamento' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">Inserisci il termine o concetto mancante:</label>
                      <input 
                        type="text"
                        value={userAnswers[currentQuizQ.id] || ''}
                        onChange={(e) => setUserAnswers(prev => ({ ...prev, [currentQuizQ.id]: e.target.value }))}
                        placeholder="Es. bicarbonato..."
                        className="w-full bg-geminiDark border border-geminiBorder rounded-2xl p-3.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  {currentQuizQ.type === 'accoppiamento' && (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-gray-300">Associa a ciascun elemento la definizione corretta:</label>
                      {(currentQuizQ.matchingPairs || []).map((pair, pIdx) => {
                        const currentVal = matchingSelections[currentQuizQ.id]?.[pIdx] || '';
                        return (
                          <div key={pIdx} className="p-3 bg-geminiDark rounded-2xl border border-geminiBorder flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <span className="text-xs font-bold text-blue-300">{pair.left}</span>
                            <select
                              value={currentVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMatchingSelections(prev => ({
                                  ...prev,
                                  [currentQuizQ.id]: {
                                    ...(prev[currentQuizQ.id] || {}),
                                    [pIdx]: val
                                  }
                                }));
                              }}
                              className="bg-geminiDarkSecondary border border-geminiBorder text-xs text-gray-200 rounded-xl p-2 focus:outline-none"
                            >
                              <option value="">-- Seleziona associazione --</option>
                              {(currentQuizQ.matchingPairs || []).map((p2, i2) => (
                                <option key={i2} value={p2.right}>{p2.right}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {currentQuizQ.type === 'aperta' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-semibold text-gray-300">Scrivi la tua risposta argomentativa:</label>
                        <span className="text-[10px] text-amber-400">Valutazione didattica /30</span>
                      </div>
                      <textarea 
                        rows={5}
                        value={userAnswers[currentQuizQ.id] || ''}
                        onChange={(e) => setUserAnswers(prev => ({ ...prev, [currentQuizQ.id]: e.target.value }))}
                        placeholder="Spiega i concetti, i passaggi e i meccanismi..."
                        className="w-full bg-geminiDark border border-geminiBorder rounded-2xl p-3.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 leading-relaxed"
                      />
                    </div>
                  )}

                  {quizFeedbackMode === 'immediato' && (
                    <div className="pt-2">
                      {immediateEvaluations[currentQuizQ.id] ? (
                        <div className={`p-4 rounded-2xl border text-xs space-y-2.5 animate-fadeIn ${
                          immediateEvaluations[currentQuizQ.id].score >= 24
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : immediateEvaluations[currentQuizQ.id].score >= 18
                            ? 'bg-blue-950/30 border-blue-500/40 text-blue-200'
                            : immediateEvaluations[currentQuizQ.id].score >= 10
                            ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                            : 'bg-red-950/20 border-red-500/30 text-red-200'
                        }`}>
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5">
                              {immediateEvaluations[currentQuizQ.id].score >= 18 
                                ? <CheckCircle size={16} className="text-emerald-400" /> 
                                : <AlertTriangle size={16} className="text-amber-400" />}
                              <span>
                                {immediateEvaluations[currentQuizQ.id].score >= 28 ? "Risposta Eccellente" :
                                 immediateEvaluations[currentQuizQ.id].score >= 24 ? "Concetto Centrato" :
                                 immediateEvaluations[currentQuizQ.id].score >= 18 ? "Risposta Soddisfacente" :
                                 immediateEvaluations[currentQuizQ.id].score >= 10 ? "Risposta Parziale" : "Da Rivedere"}
                              </span>
                            </span>
                            {immediateEvaluations[currentQuizQ.id].score !== undefined && (
                              <span className="bg-geminiDark px-2 py-0.5 rounded border border-geminiBorder font-bold">
                                Voto: {immediateEvaluations[currentQuizQ.id].score}/30
                              </span>
                            )}
                          </div>

                          <p className="leading-relaxed text-gray-200">
                            {immediateEvaluations[currentQuizQ.id].feedback}
                          </p>

                          {immediateEvaluations[currentQuizQ.id].strengths && immediateEvaluations[currentQuizQ.id].strengths.length > 0 && (
                            <div className="text-[11px] text-emerald-300/90 pt-1 border-t border-geminiBorder/40">
                              <strong>Punti individuati bene:</strong> {immediateEvaluations[currentQuizQ.id].strengths.join(', ')}
                            </div>
                          )}

                          {immediateEvaluations[currentQuizQ.id].missedPoints && immediateEvaluations[currentQuizQ.id].missedPoints.length > 0 && (
                            <div className="text-[11px] text-amber-300/90 pt-1 border-t border-geminiBorder/40">
                              <strong>💡 Suggerimenti per completare la risposta:</strong> {immediateEvaluations[currentQuizQ.id].missedPoints.join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCheckImmediateAnswer(currentQuizQ)}
                          disabled={isEvaluatingOpen}
                          className="w-full py-2.5 bg-geminiHover hover:bg-geminiBorder border border-geminiBorder text-xs text-blue-300 font-bold rounded-xl transition flex items-center justify-center gap-2"
                        >
                          {isEvaluatingOpen ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>{isEvaluatingOpen ? "Valutazione didattica in corso..." : "Verifica risposta adesso"}</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-geminiBorder/60">
                    <button
                      onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-4 py-2 bg-geminiDark hover:bg-geminiHover disabled:opacity-30 rounded-xl text-xs font-semibold transition"
                    >
                      Precedente
                    </button>

                    {currentQuestionIndex < quizQuestions.length - 1 ? (
                      <button
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-md"
                      >
                        <span>Successiva</span>
                        <ChevronRight size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={handleFinishQuiz}
                        className="flex items-center gap-1.5 px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-lg"
                      >
                        <CheckCircle size={14} />
                        <span>Concludi e Salva Esito</span>
                      </button>
                    )}
                  </div>

                </div>
              )}

              {quizStep === 5 && (
                <div className="space-y-6 text-center py-4">
                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white mx-auto shadow-xl">
                    <Award size={32} />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-gray-100">Verifica Completata!</h3>
                    <p className="text-xs text-gray-400">I risultati sono stati registrati nel tuo grado di preparazione generale.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                    <div className="bg-geminiDark p-3 rounded-2xl border border-geminiBorder">
                      <div className="text-[10px] uppercase font-bold text-gray-400">Esito</div>
                      <div className="text-lg font-bold text-amber-400">{calculateFinalQuizScore().correct} / {calculateFinalQuizScore().total}</div>
                    </div>
                    <div className="bg-geminiDark p-3 rounded-2xl border border-geminiBorder">
                      <div className="text-[10px] uppercase font-bold text-gray-400">Percentuale</div>
                      <div className="text-lg font-bold text-blue-400">{calculateFinalQuizScore().percentage}%</div>
                    </div>
                    <div className="bg-geminiDark p-3 rounded-2xl border border-geminiBorder">
                      <div className="text-[10px] uppercase font-bold text-gray-400">Voto Medio</div>
                      <div className="text-lg font-bold text-emerald-400">{calculateFinalQuizScore().averageScore}/30</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-4 border-t border-geminiBorder/60">
                    <button
                      onClick={() => setQuizStep(2)}
                      className="px-5 py-2.5 bg-geminiDark hover:bg-geminiHover border border-geminiBorder text-xs text-gray-300 font-bold rounded-xl transition"
                    >
                      Rifai una verifica
                    </button>
                    <button
                      onClick={() => setIsQuizModalOpen(false)}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-md"
                    >
                      Chiudi e Torna allo Studio
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* OVERLAY SIDEBAR */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR CON SEGMENTED SWITCHER */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-80 max-w-[85vw] bg-geminiDarkSecondary border-r border-geminiBorder shadow-2xl transition-transform duration-300 ease-in-out overflow-hidden ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-3.5 border-b border-geminiBorder/60 space-y-3 bg-geminiDarkSecondary shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Archivio Personale</span>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-geminiHover rounded-lg transition"
              title="Chiudi menu"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex bg-geminiDark p-1 rounded-2xl border border-geminiBorder/80">
            <button
              onClick={() => setSidebarTab('conversations')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'conversations'
                  ? 'bg-geminiDarkSecondary text-blue-400 shadow-md border border-geminiBorder/60'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <MessageSquare size={13} />
              <span>Conversazioni</span>
              {conversations.length > 0 && (
                <span className="text-[10px] bg-geminiHover px-1.5 py-0.2 rounded-full text-gray-300 ml-0.5">
                  {conversations.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setSidebarTab('projects')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                sidebarTab === 'projects'
                  ? 'bg-geminiDarkSecondary text-blue-400 shadow-md border border-geminiBorder/60'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <FolderKanban size={13} />
              <span>Progetti</span>
              {savedProjects.length > 0 && (
                <span className="text-[10px] bg-geminiHover px-1.5 py-0.2 rounded-full text-gray-300 ml-0.5">
                  {savedProjects.length}
                </span>
              )}
            </button>
          </div>

          {sidebarTab === 'conversations' ? (
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-geminiHover hover:bg-geminiBorder text-gray-100 rounded-xl border border-geminiBorder transition shadow-sm"
            >
              <Plus size={14} />
              <span>Nuova chat</span>
            </button>
          ) : (
            <button 
              onClick={handleStartWizard}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-md transition transform active:scale-98"
            >
              <Sparkles size={14} />
              <span>Crea guida allo studio</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sidebarTab === 'projects' && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-1 flex items-center justify-between">
                <span>Guide e Corsi ({savedProjects.length})</span>
              </div>
              
              {!savedProjects || savedProjects.length === 0 ? (
                <div className="text-xs text-gray-500 px-3 py-6 text-center space-y-2">
                  <FolderKanban size={24} className="mx-auto text-gray-600" />
                  <p>Nessuna guida creata</p>
                  <button 
                    onClick={handleStartWizard}
                    className="text-xs text-blue-400 underline font-semibold"
                  >
                    Crea la tua prima guida
                  </button>
                </div>
              ) : (
                savedProjects.map(proj => (
                  <div
                    key={proj.id}
                    onClick={() => loadProjectWithFiles(proj)}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm cursor-pointer transition ${
                      activeProject?.id === proj.id && (currentView === 'project' || currentView === 'study_plan' || currentView === 'day_detail')
                        ? 'bg-blue-600/20 text-blue-300 font-medium border border-blue-500/40'
                        : 'text-gray-300 hover:bg-geminiHover/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <Target size={14} className="text-blue-400 shrink-0" />
                      <span className="truncate">{proj.description || 'Progetto di Studio'}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteProject(e, proj.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition rounded"
                      title="Elimina guida"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {sidebarTab === 'conversations' && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-1 flex items-center justify-between">
                <span>Sessioni Recenti ({conversations.length})</span>
              </div>
              
              {!conversations || conversations.length === 0 ? (
                <div className="text-xs text-gray-500 px-3 py-6 text-center space-y-2">
                  <MessageSquare size={24} className="mx-auto text-gray-600" />
                  <p>Nessuna conversazione recente</p>
                </div>
              ) : (
                conversations.map((chat) => (
                  <div 
                    key={chat.id}
                    onClick={() => handleSelectChat(chat)}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm cursor-pointer transition ${
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
          )}

        </div>
            {/* ACCOUNT / PROFILO FOOTER */}
      <div className="p-3 border-t border-geminiBorder/60 bg-geminiDarkSecondary shrink-0">
        {user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 truncate pr-2">
              <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0 uppercase shadow-inner">
                {user.user_metadata?.full_name ? user.user_metadata.full_name[0] : (user.email ? user.email[0] : 'U')}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-gray-200 truncate">{user.user_metadata?.full_name || user.email?.split('@')[0]}</p>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Cloud attivo
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-geminiHover rounded-lg transition"
              title="Esci dall'account"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setIsSidebarOpen(false); setAuthMode('login'); setAuthError(''); setAuthSuccess(''); setIsAuthModalOpen(true); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-geminiHover hover:bg-geminiBorder text-gray-200 border border-geminiBorder rounded-xl text-xs font-semibold transition shadow-sm"
          >
            <LogIn size={15} className="text-blue-400" />
            <span>Accedi o Registrati</span>
          </button>
        )}
      </div>
    </aside>

      {/* CONTENUTO PRINCIPALE */}
      <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden">
        
        {/* HEADER FISSO */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-geminiBorder/40 bg-geminiDark z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-300 hover:text-white hover:bg-geminiHover rounded-xl border border-geminiBorder/60 transition flex items-center justify-center shadow-sm"
              title="Apri menu laterale"
            >
              <Menu size={20} />
            </button>
            
            <div 
              onClick={() => setCurrentView('chat')}
              className="flex items-center gap-2.5 cursor-pointer select-none group"
              title="MinervaAI"
            >
              <img 
                src={logoImg} 
                alt="MinervaAI" 
                className="w-8 h-8 object-contain rounded-lg shadow-sm" 
              />
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
                MinervaAI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
          {/* USER PROFILE / AUTH BUTTON */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsProfileMenuOpen(prev => !prev)}
                className="flex items-center gap-2 bg-geminiDarkSecondary hover:bg-geminiHover border border-geminiBorder px-3 py-1.5 rounded-full cursor-pointer transition shadow-sm"
                title="Opzioni account"
              >
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white uppercase shadow-sm">
                  {user.user_metadata?.full_name ? user.user_metadata.full_name[0] : (user.email ? user.email[0] : 'U')}
                </div>
                <span className="text-xs text-gray-200 hidden sm:inline max-w-[120px] truncate font-medium">
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Sincronizzazione Cloud attiva"></span>
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-11 w-64 bg-geminiDarkSecondary border border-geminiBorder rounded-2xl shadow-2xl p-3 z-50 space-y-2 animate-popup">
                  <div className="px-2 py-1.5 border-b border-geminiBorder/60">
                    <p className="text-xs font-bold text-gray-100 truncate">{user.user_metadata?.full_name || 'Studente'}</p>
                    <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full w-fit">
                      <Cloud size={12} />
                      <span>Cloud Sincronizzato</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setIsProfileMenuOpen(false); handleSignOut(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded-xl transition"
                  >
                    <LogOut size={14} />
                    <span>Disconnetti</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); setIsAuthModalOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold bg-geminiDarkSecondary hover:bg-geminiHover text-gray-200 border border-geminiBorder px-3.5 py-2 rounded-full transition shadow-sm"
            >
              <LogIn size={14} className="text-blue-400" />
              <span>Accedi</span>
            </button>
          )}

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
        {/* VISTA 1: WIZARD                                               */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'wizard' && (
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8 max-w-2xl mx-auto w-full flex flex-col justify-center">
            {wizardStep === 1 && (
              <div className={`border p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 transition ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
                  : 'bg-geminiDarkSecondary border-geminiBorder text-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                    theme === 'light'
                      ? 'bg-blue-50 text-blue-600 border-blue-200'
                      : 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  }`}>
                    <CalendarIcon size={20} />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>Quando hai l'esame?</h2>
                    <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Seleziona la data per strutturare il calendario giornaliero.</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${
                    theme === 'light' ? 'text-slate-700' : 'text-gray-300'
                  }`}>
                    Data dell'appello
                  </label>
                  <input 
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className={`w-full border rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-blue-500 transition ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-900 [color-scheme:light]'
                        : 'bg-geminiDark border-geminiBorder text-gray-100 [color-scheme:dark]'
                    }`}
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

            {wizardStep === 2 && (
              <div className={`border p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 transition ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
                  : 'bg-geminiDarkSecondary border-geminiBorder text-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                    theme === 'light'
                      ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                      : 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                  }`}>
                    <Sliders size={20} />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>Obiettivo e Dettagli</h2>
                    <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Definisci il livello di padronanza e la tipologia dell'esame.</p>
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
                    placeholder="Es. Anatomia Patologica, Fisiologia, Diritto Privato..."
                    className={`w-full border rounded-2xl p-3 text-sm focus:outline-none focus:border-blue-500 transition resize-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                        : 'bg-geminiDark border-geminiBorder text-gray-100 placeholder-gray-500'
                    }`}
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

            {wizardStep === 3 && (
              <div className={`border p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 transition ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
                  : 'bg-geminiDarkSecondary border-geminiBorder text-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                    theme === 'light'
                      ? 'bg-purple-50 text-purple-600 border-purple-200'
                      : 'bg-purple-600/20 text-purple-400 border-purple-500/30'
                  }`}>
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>Fonti di Studio</h2>
                    <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Scegli se usare i tuoi file o cercare online.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div 
                    onClick={() => setSourceType('my_materials')}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                      sourceType === 'my_materials'
                        ? (theme === 'light' ? 'bg-blue-50/80 border-blue-500 shadow-sm' : 'bg-blue-600/15 border-blue-500 shadow-md')
                        : (theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300' : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500')
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        theme === 'light' ? 'bg-blue-100 text-blue-600' : 'bg-blue-600/20 text-blue-400'
                      }`}>
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
                      <div className={`font-semibold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>Usa il mio materiale</div>
                      <div className={`text-[11px] mt-0.5 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Carica PDF, Word, PPTX o appunti.</div>
                    </div>
                  </div>

                  <div 
                    onClick={() => setSourceType('search_online')}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                      sourceType === 'search_online'
                        ? (theme === 'light' ? 'bg-indigo-50/80 border-indigo-500 shadow-sm' : 'bg-indigo-600/15 border-indigo-500 shadow-md')
                        : (theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300' : 'bg-geminiDark border-geminiBorder text-gray-400 hover:border-gray-500')
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        theme === 'light' ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-600/20 text-indigo-400'
                      }`}>
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
                      <div className={`font-semibold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>Cerca online</div>
                      <div className={`text-[11px] mt-0.5 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>L'AI strutturerà il programma accademico completo senza file.</div>
                    </div>
                  </div>
                </div>

                {sourceType === 'my_materials' ? (
                  <div className={`space-y-3 pt-2 p-4 rounded-2xl border transition ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-geminiDark/60 border-geminiBorder/70'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        theme === 'light' ? 'text-slate-800' : 'text-gray-300'
                      }`}>
                        <FileText size={14} className="text-blue-500" />
                        <span>Carica i tuoi documenti</span>
                      </label>
                      <span className="text-[11px] text-blue-500 font-bold">
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
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition group shadow-sm ${
                        theme === 'light'
                          ? 'bg-white border-blue-200 hover:bg-blue-50/60 hover:border-blue-400'
                          : 'bg-geminiDarkSecondary/40 border-geminiBorder hover:border-blue-500 hover:bg-geminiDarkSecondary'
                      }`}
                    >
                      <UploadCloud size={28} className="mx-auto text-blue-500 mb-2 group-hover:scale-110 transition" />
                      <div className={`text-xs font-bold ${theme === 'light' ? 'text-slate-800' : 'text-gray-200'}`}>
                        Seleziona i tuoi file (PDF, Word, Slide, TXT)
                      </div>
                      <div className={`text-[11px] mt-0.5 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                        Lettura istantanea ed esaustiva di tutti i capitoli
                      </div>
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

                <div className={`flex justify-between items-center pt-4 border-t ${
                  theme === 'light' ? 'border-slate-200' : 'border-geminiBorder/60'
                }`}>
                  <button 
                    onClick={() => setWizardStep(2)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                      theme === 'light'
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-geminiDark hover:bg-geminiHover text-gray-300 border-geminiBorder'
                    }`}
                  >
                    <ArrowLeft size={14} />
                    <span>Indietro</span>
                  </button>

                  <button 
                    onClick={handleFinalizeGuide}
                    disabled={sourceType === 'my_materials' && (isAnyFileExtracting || totalFilesReady === 0 || totalFilesSelected === 0)}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold transition shadow-lg ${
                      sourceType === 'my_materials' && (isAnyFileExtracting || totalFilesReady === 0 || totalFilesSelected === 0)
                        ? (theme === 'light' ? 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed' : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700')
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30 active:scale-98 cursor-pointer'
                    }`}
                  >
                    <Sparkles size={16} />
                    <span>Genera Guida e Piano</span>
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className={`border p-8 sm:p-12 rounded-3xl shadow-2xl text-center space-y-6 max-w-md mx-auto w-full transition ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
                  : 'bg-geminiDarkSecondary border-geminiBorder text-gray-100'
              }`}>
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin absolute" />
                  <ShieldCheck size={32} className="text-blue-500" />
                </div>

                <div className="space-y-2">
                  <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>Generazione del Piano</h3>
                  <p className={`text-xs h-6 transition-all ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>{loadingStatusText}</p>
                </div>

                <div className="space-y-2">
                  <div className={`w-full h-3 rounded-full overflow-hidden border ${
                    theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-geminiDark border-geminiBorder'
                  }`}>
                    <div 
                      className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-200"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                  <div className="text-xs font-bold text-blue-500">{loadingProgress}%</div>
                </div>
              </div>
            )}

          </main>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 2: PAGINA PROGETTO CON "GRADO DI PREPARAZIONE GENERALE" */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'project' && activeProject && (
          <main className={`flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-5xl mx-auto w-full space-y-6 transition ${theme === 'light' ? 'text-slate-800' : 'text-gray-200'}`}>

            
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

            {/* CARD PRINCIPALE ESAME */}
            <div className={`border p-6 sm:p-8 rounded-3xl shadow-xl space-y-4 transition ${
              theme === 'light'
                ? 'bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 border-slate-200 shadow-slate-200/50 text-slate-800'
                : 'bg-gradient-to-br from-geminiDarkSecondary via-geminiDarkSecondary to-blue-950/20 border-geminiBorder text-gray-100'
            }`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${
                      theme === 'light' ? 'text-blue-600' : 'text-blue-400'
                    }`}>Progetto di Studio</span>
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

              {/* WIDGET GRADO DI PREPARAZIONE GENERALE */}
              <div className={`mt-4 p-4 rounded-2xl border space-y-2.5 transition ${
                theme === 'light'
                  ? 'bg-white border-blue-200 shadow-sm'
                  : 'bg-geminiDark/80 border-blue-500/30 shadow-inner'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className={theme === 'light' ? 'text-blue-600' : 'text-blue-400'} size={18} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-900' : 'text-gray-100'}`}>
                      Grado di Preparazione Generale:
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border ${
                      theme === 'light'
                        ? 'text-blue-700 bg-blue-50 border-blue-200'
                        : 'text-blue-300 bg-blue-500/20 border-blue-500/30'
                    }`}>
                      {readiness.label}
                    </span>
                  </div>
                  <span className="text-base font-extrabold text-blue-500">
                    {readiness.percentage}%
                  </span>
                </div>

                <div className={`w-full h-2.5 rounded-full overflow-hidden border ${
                  theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-geminiDarkSecondary border-geminiBorder/60'
                }`}>
                  <div 
                    className="bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${readiness.percentage}%` }}
                  />
                </div>

                <div className={`flex flex-wrap items-center justify-between text-[11px] pt-0.5 ${
                  theme === 'light' ? 'text-slate-600' : 'text-gray-400'
                }`}>
                  <span>📖 Lezioni studiate: <strong className={theme === 'light' ? 'text-slate-900' : 'text-gray-200'}>{calculateGlobalProgress().completed}/{calculateGlobalProgress().total}</strong> ({calculateGlobalProgress().percent}%)</span>
                  <span>🏆 Verifiche svolte: <strong className={theme === 'light' ? 'text-slate-900' : 'text-gray-200'}>{readiness.testsCount}</strong> {readiness.testsCount > 0 && `(Media voto: ${readiness.averageQuizScore}/30)`}</span>
                </div>
              </div>
            </div>

            {/* GRIGLIA 3 SEZIONI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              
              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-geminiBorder/60 pb-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-gray-100">
                      <FileText size={16} className="text-blue-400" />
                      <span>Fonti e Materiali</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {activeProject?.sourceType === 'my_materials' ? `${activeProject?.files?.length || 0} file` : 'Online'}
                    </span>
                  </div>

                  {activeProject?.sourceType === 'my_materials' ? (
                    <div className="space-y-2 mt-3 max-h-40 overflow-y-auto pr-1">
                      {(activeProject?.files || []).map((f, i) => (
                        <div key={f.id || i} className="flex items-center justify-between p-2 rounded-xl bg-geminiDark border border-geminiBorder text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileCheck size={13} className="text-emerald-400 shrink-0" />
                            <span className="font-medium truncate text-[11px]">{f.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-indigo-300 mt-3 leading-relaxed">
                      Programma didattico strutturato sulla ricerca accademica online.
                    </p>
                  )}
                </div>

                <div className="pt-2 text-[11px] text-gray-500">
                  Fonti indicizzate e pronte
                </div>
              </div>

              <div className="bg-geminiDarkSecondary border border-geminiBorder p-6 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 font-bold text-sm text-gray-100 border-b border-geminiBorder/60 pb-3">
                    <Sparkles size={16} className="text-indigo-400" />
                    <span>Piano Didattico</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Accedi alle lezioni giornaliere per studiare e personalizzare gli appunti con il Tutor.
                  </p>
                  
                  <div className="mt-3 p-2.5 bg-geminiDark rounded-xl border border-geminiBorder flex items-center justify-between text-xs">
                    <span className="text-gray-400 text-[11px]">Avanzamento:</span>
                    <span className="font-bold text-emerald-400 text-[11px]">
                      {calculateGlobalProgress().completed} / {calculateGlobalProgress().total} ({calculateGlobalProgress().percent}%)
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setCurrentView('study_plan')}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition transform active:scale-98"
                >
                  <Sparkles size={13} />
                  <span>Avvia studio Tutor</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="bg-geminiDarkSecondary border border-amber-500/30 p-6 rounded-3xl shadow-lg space-y-4 flex flex-col justify-between bg-gradient-to-b from-geminiDarkSecondary to-amber-950/10">
                <div>
                  <div className="flex items-center justify-between border-b border-geminiBorder/60 pb-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-gray-100">
                      <GraduationCap size={18} className="text-amber-400" />
                      <span>Verifica Competenze</span>
                    </div>
                    <span className="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-500/20">
                      Prova Esame
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Avvia una prova su tutte le lezioni o su temi scelti con feedback costruttivo e valutazione modulare in /30.
                  </p>
                </div>

                <button 
                  onClick={handleOpenGeneralQuizModal}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition transform active:scale-98"
                >
                  <CheckCircle2 size={15} />
                  <span>Verifica</span>
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
                  Seleziona una giornata per consultare, personalizzare o verificare lezioni.
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
                      setSelectedImageEl(null);
                      setImageBoxRect(null);
                      setPreviousLessonBackup(null);
                      lastLoadedTopicIdRef.current = null;
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
                          {day.topics?.length || 0} argomenti ({dayCompletedTopics} completati)
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
        {/* VISTA 4: DETTAGLIO GIORNO CON EXPORT PDF E RESIZE IMMAGINI    */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'day_detail' && activeProject && currentDayData && (
          <main className={`flex-1 flex flex-col h-full w-full overflow-hidden ${theme === 'light' ? 'bg-white text-slate-800' : 'bg-geminiDark text-gray-200'}`}>

            
            <div className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-b shrink-0 transition ${
              theme === 'light' 
                ? 'bg-white border-slate-200 shadow-sm text-slate-800' 
                : 'bg-geminiDarkSecondary border-geminiBorder/60 text-gray-200'
            }`}>
              <button 
                onClick={() => setCurrentView('study_plan')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-geminiDark hover:bg-geminiHover text-gray-300 border-geminiBorder'
                }`}
              >
                <ArrowLeft size={14} />
                <span>Torna al Piano Giornaliero</span>
              </button>
              
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-xl border ${
                theme === 'light'
                  ? 'bg-blue-50/70 border-blue-100 text-blue-900'
                  : 'bg-blue-950/40 border-blue-900/50 text-blue-200'
              }`}>
                <CalendarIcon size={14} className="text-blue-500 shrink-0" />
                <span>{currentDayData?.date} • {currentDayData?.dayTitle}</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row h-full w-full overflow-hidden">
              
              {/* COLONNA SINISTRA: FOGLIO WYSIWYG CON EXPORT PDF E IMMAGINI */}
              <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-geminiBorder/40">
                
                <div className="px-4 py-2 border-b border-geminiBorder/40 bg-geminiDarkSecondary/30 shrink-0 space-y-2">
                  
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                    <div className="flex items-center gap-1.5">
                      {(currentDayData?.topics || []).map(topic => (
                        <button
                          key={topic.id}
                          onClick={() => {
                            setSelectedTopicId(topic.id);
                            setFloatingPopup(null);
                            setSelectedImageEl(null);
                            setImageBoxRect(null);
                            lastLoadedTopicIdRef.current = null;
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
                      <div className="flex items-center gap-2 shrink-0">
                        {/* TASTO SCARICA PDF */}
                        {currentSelectedTopic.lesson && (
                          <button
                            onClick={handleDownloadLessonPDF}
                            disabled={isExportingPDF}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition shadow-sm"
                            title="Scarica il documento PDF formattato di questa lezione"
                          >
                            {isExportingPDF ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                            <span>Scarica PDF</span>
                          </button>
                        )}

                        <button
                          onClick={handleOpenSingleLessonQuizModal}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 transition shadow-sm"
                          title="Avvia una verifica specifica solo su questa lezione"
                        >
                          <GraduationCap size={13} />
                          <span>Verifica Lezione</span>
                        </button>

                        <button
                          onClick={() => handleGenerateLesson(currentDayData.dayNumber, currentSelectedTopic)}
                          disabled={isGeneratingLesson}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${
                            isGeneratingLesson 
                              ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/20'
                          }`}
                        >
                          {isGeneratingLesson ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          <span>{currentSelectedTopic.lesson ? 'Rigenera' : 'Genera lezione'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* BARRA FORMATTAZIONE CON TASTO IMMAGINE */}
                  {currentSelectedTopic?.lesson && (
                    <div className="flex items-center gap-1 pt-1 overflow-x-auto text-xs text-gray-300 border-t border-geminiBorder/40">
                      
                      <select 
                        value={selectedFontFamily}
                        onChange={(e) => applyCustomFontFamily(e.target.value)}
                        className="bg-geminiDark border border-geminiBorder rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none"
                        title="Carattere testo selezionato"
                      >
                        <option value="sans-serif">Sans-serif</option>
                        <option value="serif">Serif (Georgia)</option>
                        <option value="monospace">Monospace</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                      </select>

                      <div className="flex items-center gap-1 bg-geminiDark border border-geminiBorder rounded-lg px-2 py-0.5">
                        <span className="text-[10px] text-gray-400">Dim:</span>
                        <select 
                          value={selectedFontSize}
                          onChange={(e) => applyCustomFontSize(Number(e.target.value))}
                          className="bg-transparent text-[11px] text-gray-200 focus:outline-none cursor-pointer"
                          title="Dimensione testo selezionato (4 - 32px)"
                        >
                          {fontSizes.map(size => (
                            <option key={size} value={size} className="bg-geminiDark text-gray-200">
                              {size}px
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      <button 
                        onClick={() => applyFormattingCommand('bold')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Grassetto"
                      >
                        <Bold size={13} />
                      </button>
                      <button 
                        onClick={() => applyFormattingCommand('italic')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Corsivo"
                      >
                        <Italic size={13} />
                      </button>
                      <button 
                        onClick={() => applyFormattingCommand('underline')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Sottolineato"
                      >
                        <UnderlineIcon size={13} />
                      </button>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      <button 
                        onClick={() => applyAlignment('left')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Allinea a sinistra"
                      >
                        <AlignLeft size={13} />
                      </button>
                      <button 
                        onClick={() => applyAlignment('center')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Centra"
                      >
                        <AlignCenter size={13} />
                      </button>
                      <button 
                        onClick={() => applyAlignment('right')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Allinea a destra"
                      >
                        <AlignRight size={13} />
                      </button>
                      <button 
                        onClick={() => applyAlignment('justify')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Giustifica testo"
                      >
                        <AlignJustify size={13} />
                      </button>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      <button 
                        onClick={() => applyFormattingCommand('insertUnorderedList')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Elenco puntato"
                      >
                        <List size={13} />
                      </button>
                      <button 
                        onClick={() => applyFormattingCommand('insertOrderedList')}
                        className="p-1.5 hover:bg-geminiHover rounded-lg text-gray-300 hover:text-white transition"
                        title="Elenco numerato"
                      >
                        <ListOrdered size={13} />
                      </button>

                      <div className="w-[1px] h-4 bg-geminiBorder mx-1" />

                      <input 
                        type="file" 
                        ref={imageUploadInputRef} 
                        accept="image/*" 
                        onChange={handleImageFileSelect} 
                        className="hidden" 
                      />
                      <button
                        onClick={() => imageUploadInputRef.current?.click()}
                        className="p-1.5 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 rounded-lg transition flex items-center gap-1 font-semibold"
                        title="Inserisci immagine nel documento"
                      >
                        <ImageIcon size={14} />
                        <span className="text-[10px]">Immagine</span>
                      </button>
                    </div>
                  )}

                </div>

                {/* CORPO DELLA LEZIONE CON SUPPORTO DRAG TO RESIZE */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 relative">
                  
                  {isGeneratingLesson ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-16">
                      <Sparkles size={28} className="text-blue-400 animate-bounce" />
                      <div className="text-sm font-semibold text-gray-200">Generazione della lezione in corso...</div>
                      <div className="text-xs text-gray-400">Elaborazione con formule LaTeX e schemi didattici</div>
                    </div>
                  ) : currentSelectedTopic?.lesson ? (
                    <div className="max-w-3xl mx-auto space-y-4">
                      
                      <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 bg-geminiDarkSecondary/60 px-4 py-2 rounded-2xl border border-geminiBorder gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]">✏️ <strong>Modifica testo attiva</strong> • Trascina gli angoli per ridimensionare le immagini</span>
                          {currentSelectedTopic.quizScore && (
                            <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30 text-[10px] font-bold">
                              Verifica: {currentSelectedTopic.quizScore}/30
                            </span>
                          )}
                        </div>
                        
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

                      <div className="bg-geminiDarkSecondary/70 border border-geminiBorder p-6 sm:p-8 rounded-3xl shadow-xl min-h-[520px]">
                        <div
                          ref={wysiwygEditorRef}
                          contentEditable="true"
                          suppressContentEditableWarning={true}
                          onInput={handleEditorInput}
                          onPaste={handleEditorPaste}
                          className="wysiwyg-editor focus:outline-none select-text"
                        />
                      </div>

                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-3">
                      <BookOpen size={32} className="mx-auto text-gray-500" />
                      <div className="text-sm font-semibold text-gray-300">Nessuna lezione presente per questo argomento</div>
                      <p className="text-xs text-gray-500 max-w-sm">
                        Clicca su <strong>"Genera lezione"</strong> in alto per creare la sintesi didattica completa con formule e tabelle.
                      </p>
                    </div>
                  )}

                </div>

              </div>

              {/* COLONNA DESTRA: CHATBOT LEZIONE */}
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
                          onClick={() => handleSendLessonChatMessage("Aggiungi una tabella riassuntiva dei concetti chiave")}
                          className="w-full text-[11px] p-2 rounded-xl bg-geminiDark hover:bg-geminiHover border border-geminiBorder text-gray-300 text-left transition"
                        >
                          + "Aggiungi una tabella riassuntiva"
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
                              <span>✨ Documento aggiornato direttamente</span>
                              {previousLessonBackup && (
                                <button
                                  onClick={handleUndoChatbotChange}
                                  className="text-gray-400 hover:text-red-300 underline font-normal ml-2"
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

                <div className="p-3 border-t border-geminiBorder/40 bg-geminiDarkSecondary shrink-0">
                  {/* Banner Dettatura Vocale Lezione */}
                  {isRecordingLessonAudio && (
                    <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-red-950/70 border border-red-500/60 rounded-xl text-[11px] text-red-200 animate-pulse">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span>Ascolto vocale in corso...</span>
                      </div>
                      <button
                        onClick={handleToggleLessonVoiceRecording}
                        className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[10px] transition"
                      >
                        Stop
                      </button>
                    </div>
                  )}

                  {isTranscribingLessonAudio && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-blue-950/70 border border-blue-500/50 rounded-xl text-[11px] text-blue-200">
                      <RefreshCw size={12} className="animate-spin text-blue-400" />
                      <span>Trascrizione Whisper...</span>
                    </div>
                  )}

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
                      placeholder="Chiedi, detta con Whisper o modifica..."
                      className="flex-1 bg-transparent text-xs text-gray-100 placeholder-gray-500 focus:outline-none"
                    />

                    {/* Bottone Microfono Whisper per Chat della Lezione */}
                    <button
                      type="button"
                      onClick={handleToggleLessonVoiceRecording}
                      disabled={isTranscribingLessonAudio}
                      className={`p-1.5 rounded-full transition ${
                        isRecordingLessonAudio 
                          ? 'bg-red-600 text-white animate-pulse' 
                          : 'text-gray-400 hover:text-amber-400 hover:bg-geminiHover'
                      }`}
                      title={isRecordingLessonAudio ? "Ferma registrazione" : "Dettatura vocale con OpenAI Whisper"}
                    >
                      {isRecordingLessonAudio ? <MicOff size={13} /> : <Mic size={13} />}
                    </button>

                    <button
                      onClick={() => handleSendLessonChatMessage()}
                      disabled={!lessonChatInput.trim() || isLessonChatLoading || isRecordingLessonAudio}
                      className={`p-1.5 rounded-full transition ${
                        lessonChatInput.trim() && !isLessonChatLoading && !isRecordingLessonAudio
                          ? 'bg-blue-600 text-white hover:bg-blue-500' 
                          : 'text-gray-600 cursor-not-allowed'
                      }`}
                      title="Invia messaggio"
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
        {/* VISTA 5: CHAT HOMEPAGE                                        */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'chat' && (
          <div 
            onDragOver={handleChatDragOver}
            onDragEnter={handleChatDragOver}
            onDragLeave={handleChatDragLeave}
            onDrop={handleChatDrop}
            className="flex-1 flex flex-col h-full w-full overflow-hidden relative"
          >
            
            {/* OVERLAY DRAG & DROP */}
            {isDraggingOverChat && (
              <div className="absolute inset-0 z-50 bg-blue-950/85 border-4 border-dashed border-blue-400 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fadeIn pointer-events-none">
                <UploadCloud size={48} className="text-blue-400 animate-bounce mb-3" />
                <h3 className="text-lg font-bold text-white">Rilascia qui i tuoi file</h3>
                <p className="text-xs text-blue-200 mt-1">Puoi caricare fino a 10 file (PDF, immagini, Word, PPTX o testi)</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto w-full px-4 sm:px-6">
              <div className="max-w-3xl mx-auto py-6 space-y-6 pb-40">
                
                {messages.length === 0 ? (
                  <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 flex items-center justify-center mb-6 shrink-0 overflow-hidden">
                      <img src={logoImg} alt="MinervaAI Logo" className="w-16 h-16 object-contain drop-shadow-md rounded-2xl" />
                    </div>
                    
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100 mb-3">
                      Cosa vuoi studiare oggi?
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base max-w-md mb-8">
                      Fai una domanda libera, usa la <strong>dettatura vocale</strong> o trascina fino a 10 file per un'analisi approfondita.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                      {[
                        { icon: BookOpen, text: "Spiegami un argomento complesso con parole semplici" },
                        { icon: FileText, text: "Crea uno schema riassuntivo con i punti chiave" },
                        { icon: GraduationCap, text: "Fammi 5 domande a risposta multipla per testarmi" },
                        { icon: Sparkles, text: "Analizza e confronta i file che trascino qui" }
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
                        <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-1 shadow-sm overflow-hidden p-1">
                          <img src={logoImg} alt="MinervaAI" className="w-full h-full object-contain" />
                        </div>
                      )}

                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words overflow-hidden ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-br-sm shadow-md whitespace-pre-wrap' 
                          : 'bg-geminiDarkSecondary border border-geminiBorder text-gray-200 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.files && msg.files.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {msg.files.map((f, fi) => (
                              <div key={fi} className="flex items-center gap-1.5 px-2 py-1 bg-black/30 rounded-lg text-xs text-gray-200 border border-white/10">
                                {f.isImage ? <ImageIcon size={12} className="text-indigo-300" /> : <FileText size={12} className="text-blue-300" />}
                                <span className="font-medium truncate max-w-[140px]">{f.name}</span>
                              </div>
                            ))}
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
                    <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-1 overflow-hidden p-1">
                      <img src={logoImg} alt="MinervaAI" className="w-full h-full object-contain" />
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

            <footer className={`absolute bottom-0 inset-x-0 p-4 z-10 ${theme === 'light' ? 'bg-gradient-to-t from-[#f8fafc] via-[#f8fafc]/95 to-transparent' : 'bg-gradient-to-t from-geminiDark via-geminiDark to-transparent'}`}>

              <div className="max-w-3xl mx-auto">
                
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1 bg-geminiDarkSecondary/80 rounded-2xl border border-geminiBorder shadow-md">
                    {attachedFiles.map(file => (
                      <div 
                        key={file.id} 
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-geminiDark border border-geminiBorder rounded-xl text-xs text-blue-300"
                      >
                        {file.isImage ? <ImageIcon size={13} className="text-indigo-400" /> : <FileText size={13} className="text-blue-400" />}
                        <span className="truncate max-w-[130px] font-medium text-[11px]">{file.name}</span>
                        <span className="text-gray-400 text-[10px]">({file.size})</span>
                        <button 
                          onClick={() => handleRemoveAttachedChatFile(file.id)}
                          className="p-0.5 hover:text-red-400 transition ml-0.5"
                          title="Rimuovi file"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <span className="text-[10px] text-gray-400 self-center px-1">
                      {attachedFiles.length}/10 file
                    </span>
                  </div>
                )}

                {isRecordingAudio && (
                  <div className="flex items-center justify-between gap-2 mb-2 px-4 py-2 bg-red-950/60 border border-red-500/50 rounded-2xl text-xs text-red-200 animate-pulse shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                      <span className="font-bold">Registrazione vocale in corso... Parla pure</span>
                    </div>
                    <button
                      onClick={handleToggleVoiceRecording}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition"
                    >
                      Termina e Trascrivi
                    </button>
                  </div>
                )}

                {isTranscribingAudio && (
                  <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-blue-950/60 border border-blue-500/50 rounded-2xl text-xs text-blue-200 shadow-lg">
                    <RefreshCw size={14} className="animate-spin text-blue-400" />
                    <span>Trascrizione intelligente in corso con OpenAI Whisper...</span>
                  </div>
                )}

                <div className="flex items-end gap-2 bg-geminiDarkSecondary border border-geminiBorder rounded-3xl px-4 py-2.5 shadow-xl focus-within:border-blue-500 transition">
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    multiple
                    onChange={handleChatFileSelect}
                    accept=".pdf,.txt,.docx,.pptx,image/*"
                    className="hidden"
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-geminiHover rounded-full transition mb-0.5"
                    title="Allega fino a 10 file (o trascinali qui)"
                  >
                    <Paperclip size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleVoiceRecording}
                    disabled={isTranscribingAudio}
                    className={`p-2 rounded-full transition mb-0.5 ${
                      isRecordingAudio 
                        ? 'bg-red-600 text-white animate-pulse' 
                        : 'text-gray-400 hover:text-amber-400 hover:bg-geminiHover'
                    }`}
                    title={isRecordingAudio ? "Ferma registrazione" : "Dettatura vocale con OpenAI Whisper"}
                  >
                    {isRecordingAudio ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <textarea 
                    ref={textareaRef}
                    value={inputPrompt}
                    onChange={handleTextareaInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Scrivi, detta con il microfono o trascina fino a 10 file..."
                    rows={1}
                    className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none py-1 max-h-44"
                  />

                  <button 
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={(!inputPrompt.trim() && attachedFiles.length === 0) || isLoading || isRecordingAudio}
                    className={`p-2 rounded-full transition mb-0.5 ${
                      (inputPrompt.trim() || attachedFiles.length > 0) && !isLoading && !isRecordingAudio
                        ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm' 
                        : 'text-gray-600 bg-transparent cursor-not-allowed'
                    }`}
                    title="Invia messaggio"
                  >
                    <Send size={16} />
                  </button>
                </div>
                
                <div className="text-center mt-2 text-[11px] text-gray-500">
                  Trascina file fino a 10 elementi • Dettatura vocale Whisper • Esportazione PDF
                </div>
              </div>
            </footer>

          </div>
        )}
      {/* ------------------------------------------------------------- */}
      {/* MODALE AUTENTICAZIONE SUPABASE (ACCEDI / REGISTRATI / RECUPERA) */}
      {/* ------------------------------------------------------------- */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-popup">
          <div className="bg-geminiDarkSecondary border border-geminiBorder w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-6">
            <button
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-geminiHover rounded-xl transition"
              title="Chiudi"
            >
              <X size={18} />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 mx-auto flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <GraduationCap size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-100">
                {authMode === 'login' && 'Accedi a MinervaAI'}
                {authMode === 'signup' && 'Crea il tuo Account'}
                {authMode === 'reset' && 'Recupera Password'}
              </h2>
              <p className="text-xs text-gray-400">
                {authMode === 'login' && 'Sincronizza le tue guide e le tue chat su tutti i tuoi dispositivi.'}
                {authMode === 'signup' && 'Unisciti a MinervaAI per salvare i tuoi piani di studio nel cloud.'}
                {authMode === 'reset' && 'Inserisci la tua email per ricevere il link di ripristino.'}
              </p>
            </div>

            {/* Switcher Tab Accedi / Registrati */}
            {authMode !== 'reset' && (
              <div className="flex bg-geminiDark p-1 rounded-2xl border border-geminiBorder">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
                    authMode === 'login'
                      ? 'bg-geminiDarkSecondary text-blue-400 shadow-md border border-geminiBorder/60'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Accedi
                </button>
                <button
                  onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthSuccess(''); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
                    authMode === 'signup'
                      ? 'bg-geminiDarkSecondary text-blue-400 shadow-md border border-geminiBorder/60'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Registrati
                </button>
              </div>
            )}

            {/* Banner Errore / Successo */}
            {authError && (
              <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{authError}</span>
              </div>
            )}
            {authSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-400">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                    Nome Completo
                  </label>
                  <div className="relative flex items-center">
                    <User size={16} className="absolute left-3.5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      placeholder="es. Mario Rossi"
                      className="w-full bg-geminiDark border border-geminiBorder rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                  Email
                </label>
                <div className="relative flex items-center">
                  <Mail size={16} className="absolute left-3.5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="nome@esempio.it"
                    className="w-full bg-geminiDark border border-geminiBorder rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {authMode !== 'reset' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                      Password
                    </label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setAuthMode('reset'); setAuthError(''); setAuthSuccess(''); }}
                        className="text-[11px] text-blue-400 hover:underline"
                      >
                        Password dimenticata?
                      </button>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <Lock size={16} className="absolute left-3.5 text-gray-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Minimo 6 caratteri"
                      className="w-full bg-geminiDark border border-geminiBorder rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthSubmitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl shadow-lg shadow-blue-600/25 transition transform active:scale-98 flex items-center justify-center gap-2 text-sm"
              >
                {isAuthSubmitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Elaborazione in corso...</span>
                  </>
                ) : (
                  <>
                    {authMode === 'login' && (
                      <>
                        <LogIn size={16} />
                        <span>Accedi</span>
                      </>
                    )}
                    {authMode === 'signup' && (
                      <>
                        <Sparkles size={16} />
                        <span>Crea Account</span>
                      </>
                    )}
                    {authMode === 'reset' && (
                      <>
                        <Mail size={16} />
                        <span>Invia Link di Recupero</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </form>

            {authMode === 'reset' && (
              <div className="text-center pt-2">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                  className="text-xs text-blue-400 hover:underline font-semibold"
                >
                  Torna al Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
