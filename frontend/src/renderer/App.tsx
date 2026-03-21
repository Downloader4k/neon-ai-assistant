import { useState, useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  Sparkles, Settings, Trash2,
  Brain, Lightbulb, Activity, Puzzle, Search, Shield, ChevronDown, ChevronRight, Wrench,
  PanelLeft, SquarePen, Pin, PinOff, Edit2
} from 'lucide-react';
import ChatInterface from './components/ChatInterface';
import WelcomeScreen from './components/WelcomeScreen';
import { ConversationItem } from './components/ConversationItem';
import AdminPanel from './components/AdminPanel';
import MemoryDashboard from './components/MemoryDashboard';
import SemanticSearch from './components/SemanticSearch';
import SettingsPanel from './components/SettingsPanel';
import SkillStore from './components/SkillStore';
import EmotionDashboard from './components/EmotionDashboard';
import PredictiveAssistant from './components/PredictiveAssistant';
import ProactiveNotifications from './components/ProactiveNotifications';
import './index.css';

type ViewMode = 'welcome' | 'chat' | 'admin' | 'memory' | 'search' | 'settings' | 'skills' | 'emotions' | 'predictive';

export default function App() {
  const initializeSocket = useAppStore((state) => state.initializeSocket);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const [activeView, setActiveView] = useState<ViewMode>('welcome');
  const activeConversation = useAppStore((state) => state.currentConversation?.id || null);
  const conversations = useAppStore((state) => state.conversations);
  const loadConversations = useAppStore((state) => state.loadConversations);
  const isConnected = useAppStore((state) => state.isConnected);

  // Pinning & Renaming
  const pinnedIds = useAppStore((state) => state.pinnedIds);
  const togglePinConversation = useAppStore((state) => state.togglePinConversation);
  const renameConversation = useAppStore((state) => state.renameConversation);
  const deleteConversationStore = useAppStore((state) => state.deleteConversation);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeSocket();
  }, [initializeSocket]);

  useEffect(() => {
    if (isConnected) {
      loadConversations();
    }
  }, [isConnected, loadConversations]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const startNewChat = (initialMessage?: string, attachments?: any[]) => {
    useAppStore.getState().setCurrentConversation(null);
    setActiveView('chat');
    if ((initialMessage && typeof initialMessage === 'string' && initialMessage.trim()) || (attachments && attachments.length > 0)) {
      setTimeout(() => {
        useAppStore.getState().sendMessage(initialMessage || '', attachments);
      }, 0);
    }
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    deleteConversationStore(id);
    if (activeConversation === id) {
      setActiveView('welcome');
    }
    setContextMenu(null);
  };

  const startRenaming = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
    setContextMenu(null);
  };

  const saveRename = () => {
    if (editingId && editTitle.trim()) {
      renameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveRename();
    if (e.key === 'Escape') setEditingId(null);
  };

  const handlePin = (id: string) => {
    togglePinConversation(id);
    setContextMenu(null);
  };

  const renderContent = () => {
    switch (activeView) {
      case 'chat': return <ChatInterface key={activeConversation} />;
      case 'admin': return <AdminPanel onStartChat={startNewChat} />;
      case 'memory': return <MemoryDashboard />;
      case 'search': return <SemanticSearch onClose={() => setActiveView(activeConversation ? 'chat' : 'welcome')} onResultClick={(id) => { useAppStore.getState().loadConversation(id); setActiveView('chat'); }} />;
      case 'settings': return <SettingsPanel />;
      case 'skills': return <SkillStore />;
      case 'emotions': return <EmotionDashboard />;
      case 'predictive': return <PredictiveAssistant onAcceptPrediction={(text) => { useAppStore.getState().setCurrentConversation(null); useAppStore.getState().sendMessage(text); setActiveView('chat'); }} />;
      default: return <WelcomeScreen onStartChat={startNewChat} />;
    }
  };

  // Group Conversations
  const pinnedConversations = conversations.filter(c => pinnedIds.includes(c.id));
  const otherConversations = conversations.filter(c => !pinnedIds.includes(c.id));

  return (
    <div className="app-layout">
      {/* SIDEBAR (Left Rail) */}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>

        {/* Top Section */}
        <div className="sidebar-top-section">
          {/* Header Row */}
          <div className="sidebar-header-row">
            <div
              className="logo-container cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                setActiveView('welcome');
                useAppStore.getState().setCurrentConversation(null);
              }}
              title="Zur Startseite"
            >
              <Sparkles size={24} className="logo-icon text-accent" />
              {sidebarOpen && <h1 className="logo-text ml-2">NEON</h1>}
            </div>

            <div className="flex items-center gap-1">
              {sidebarOpen && (
                <button
                  className="icon-btn-ghost hover:bg-bg-hover"
                  onClick={() => startNewChat()}
                  title="Neuer Chat"
                >
                  <SquarePen size={20} className="text-text-secondary" />
                </button>
              )}

              <button
                className="icon-btn-ghost hover:bg-bg-hover"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? "Einklappen" : "Ausklappen"}
              >
                <PanelLeft size={20} className="text-text-secondary" />
              </button>
            </div>
          </div>

          {!sidebarOpen && (
            <div className="mt-4 px-2 flex justify-center">
              <button
                className="new-chat-btn-modern justify-center px-0 w-10 h-10"
                onClick={() => startNewChat()}
                title="Neuer Chat"
              >
                <SquarePen size={20} />
              </button>
            </div>
          )}

          <div className={`px-2 ${sidebarOpen ? 'mt-4' : 'mt-2'}`}>
            <button
              className={`nav-item ${activeView === 'search' ? 'active' : ''} ${!sidebarOpen ? 'justify-center px-0' : ''}`}
              onClick={() => setActiveView('search')}
              title="Suche"
            >
              <Search size={20} />
              {sidebarOpen && <span className="ml-3">Suche</span>}
            </button>
          </div>
        </div>

        {/* Middle Section: Chat History */}
        <div className="sidebar-middle-section">
          {sidebarOpen && (activeView === 'chat' || activeView === 'welcome') && (
            <div className="sidebar-conversations fade-in pb-4">

              <div className="sidebar-section-title px-4 mb-2 mt-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">
                Unterhaltungen
              </div>

              {/* Pinned Items First */}
              {pinnedConversations.map(c => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  isPinned={true}
                  isActive={activeConversation === c.id}
                  isEditing={editingId === c.id}
                  editTitle={editTitle}
                  setEditTitle={setEditTitle}
                  saveRename={saveRename}
                  handleKeyDown={handleKeyDown}
                  onContextMenu={(e, id) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, id });
                  }}
                  setActiveView={setActiveView}
                  setContextMenu={setContextMenu}
                  contextMenuId={contextMenu?.id}
                />
              ))}

              {/* Other Items */}
              {otherConversations.map(c => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  isPinned={false}
                  isActive={activeConversation === c.id}
                  isEditing={editingId === c.id}
                  editTitle={editTitle}
                  setEditTitle={setEditTitle}
                  saveRename={saveRename}
                  handleKeyDown={handleKeyDown}
                  onContextMenu={(e, id) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, id });
                  }}
                  setActiveView={setActiveView}
                  setContextMenu={setContextMenu}
                  contextMenuId={contextMenu?.id}
                />
              ))}

            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="sidebar-bottom-section mt-auto py-2 border-t border-border-subtle">
          {/* Tools Group */}
          <div className="tools-group px-2 mb-1">
            <button
              className={`nav-item w-full ${['memory', 'emotions', 'predictive', 'skills', 'admin'].includes(activeView) ? 'active' : ''} ${!sidebarOpen ? 'justify-center px-0' : ''}`}
              onClick={() => sidebarOpen ? setIsToolsOpen(!isToolsOpen) : setActiveView('memory')}
              title="Werkzeuge"
            >
              <Wrench size={20} />
              {sidebarOpen && (
                <>
                  <span className="ml-3 flex-1 text-left">Werkzeuge</span>
                  {isToolsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </>
              )}
            </button>

            {sidebarOpen && isToolsOpen && (
              <div className="tools-subitems ml-4 mt-1 space-y-1">
                {[
                  { id: 'memory', icon: Brain, label: 'Gedächtnis' },
                  { id: 'emotions', icon: Activity, label: 'Emotionen' },
                  { id: 'predictive', icon: Lightbulb, label: 'Vorhersagen' },
                  { id: 'skills', icon: Puzzle, label: 'Skills' },
                  { id: 'admin', icon: Shield, label: 'Admin' }
                ].map(tool => (
                  <button
                    key={tool.id}
                    className={`nav-item sub-item w-full ${activeView === tool.id ? 'active-sub' : ''}`}
                    onClick={() => setActiveView(tool.id as ViewMode)}
                  >
                    <tool.icon size={16} />
                    <span className="ml-2 text-sm">{tool.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-2">
            <button
              className={`nav-item w-full ${activeView === 'settings' ? 'active' : ''} ${!sidebarOpen ? 'justify-center px-0' : ''}`}
              onClick={() => setActiveView('settings')}
              title="Einstellungen"
            >
              <Settings size={20} />
              {sidebarOpen && <span className="ml-3">Einstellungen</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main flex-1 flex flex-col relative overflow-hidden">
        <div className="absolute top-4 right-4 z-50">
          <ProactiveNotifications />
        </div>

        <div className="app-content flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </main>

      {/* CONTEXT MENU PORTAL/OVERLAY */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-bg-secondary border border-border-subtle shadow-lg rounded-md overflow-hidden min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 170), // Prevent overflow right
            top: Math.min(contextMenu.y, window.innerHeight - 150)  // Prevent overflow bottom
          }}
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
          {/* Pin Action */}
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-bg-hover flex items-center gap-2"
            onClick={() => handlePin(contextMenu.id)}
          >
            {pinnedIds.includes(contextMenu.id) ? (
              <><PinOff size={14} /> Lösen</>
            ) : (
              <><Pin size={14} /> Anheften</>
            )}
          </button>

          {/* Rename Action */}
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-bg-hover flex items-center gap-2"
            onClick={() => {
              const conv = conversations.find(c => c.id === contextMenu.id);
              if (conv) startRenaming(contextMenu.id, conv.title);
            }}
          >
            <Edit2 size={14} /> Umbenennen
          </button>

          <div className="border-t border-border-subtle my-1"></div>

          {/* Delete Action (Red) */}
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-red-500/10 text-red-400 flex items-center gap-2"
            onClick={(e) => handleDelete(contextMenu.id, e)}
          >
            <Trash2 size={14} /> Löschen
          </button>
        </div>
      )}

      <style>{`
        .app-layout {
          display: flex;
          flex-direction: row;
          width: 100vw;
          height: 100vh;
          background: var(--bg-primary);
        }

        .app-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-subtle);
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
          z-index: 20;
          user-select: none;
        }

        .app-sidebar.open { width: 260px; }
        .app-sidebar.closed { width: 68px; }

        .sidebar-header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 0.5rem 0.75rem 1rem;
            height: 60px;
            flex-shrink: 0;
        }
        
        .sidebar-middle-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
        }

        .sidebar-conversations {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }

        .app-sidebar.closed .sidebar-header-row {
            justify-content: center;
            padding: 0.75rem 0;
            flex-direction: column;
            gap: 1rem;
            height: auto;
        }

        .logo-container {
            display: flex;
            align-items: center;
        }

        .logo-text {
            font-size: 1.25rem;
            font-weight: 700;
            background: var(--accent-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .new-chat-btn-modern {
            display: flex;
            align-items: center;
            width: 100%;
            padding: 0.6rem;
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            transition: all 0.2s;
        }
        
        .new-chat-btn-modern:hover {
            background: var(--bg-hover);
            border-color: var(--accent-primary);
             color: var(--accent-primary);
        }

        .nav-item {
            display: flex;
            align-items: center;
            padding: 0.6rem;
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            transition: all 0.2s;
            border: none;
            background: transparent;
            cursor: pointer;
        }

        .nav-item:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }

        .nav-item.active {
            background: var(--bg-hover);
            color: var(--accent-primary);
        } 
        
        .nav-item.active-sub {
             color: var(--accent-primary);
             background: rgba(249, 171, 0, 0.05);
        }

        .conversation-item {
            display: flex;
            align-items: center;
            padding: 0.5rem 0.75rem;
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            cursor: pointer;
            transition: background 0.2s;
            position: relative; /* For More Btn Logic inside */
        }
        
        .conversation-item:hover, .conversation-item.active {
            background: var(--bg-hover);
            color: var(--text-primary);
        }
        
        .conversation-item.active {
             color: var(--accent-primary);
             font-weight: 500;
        }

        .icon-btn-ghost {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: var(--radius-sm);
            border: none;
            background: transparent;
            cursor: pointer;
            transition: background 0.2s;
        }

        .more-btn {
             display: flex;
             align-items: center;
             justify-content: center;
        }

        .text-accent { color: var(--accent-primary); }
        .text-text-secondary { color: var(--text-secondary); }
        .text-text-tertiary { color: var(--text-tertiary); }
        .hover\\:bg-bg-hover:hover { background: var(--bg-hover); }

        .fade-in { animation: fadeIn 0.2s ease-in; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

      `}</style>
    </div>
  );
}
