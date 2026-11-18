import './style.css';
import type { Message } from './types/chat';
import { QUICK_PROMPTS } from './bot/botEngine';
import { formatMessageText, formatTime } from './utils/formatter';
import { sounds } from './utils/audio';

const API_BASE_URL = 'http://127.0.0.1:8000';
const SESSION_STORAGE_KEY = 'nova_session_id';
const CHAT_SESSION_STORAGE_KEY = 'nova_chat_session_id';
const AUTHENTICATED_USER_KEY = 'nova_authenticated_user';

interface ChatSessionResponse {
  success?: boolean;
  message: string;
  session_id: string;
  session_token: string;
  user: {
    id: number;
    name: string;
  };
}

interface ChatResponse {
  pergunta: string;
  palavras_chave: string[];
  artigos: {
    titulo: string;
    conteudo: string;
    pontuacao: number;
    fonte_api: string;
  }[];
  total: number;
}

function isChatSessionResponse(value: unknown): value is ChatSessionResponse {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof value.message === 'string'
    && 'session_id' in value
    && typeof value.session_id === 'string'
    && 'session_token' in value
    && typeof value.session_token === 'string'
    && 'user' in value
    && typeof value.user === 'object'
    && value.user !== null
    && 'id' in value.user
    && typeof value.user.id === 'number'
    && 'name' in value.user
    && typeof value.user.name === 'string';
}

function isChatResponse(value: unknown): value is ChatResponse {
  return typeof value === 'object'
    && value !== null
    && 'pergunta' in value
    && typeof value.pergunta === 'string'
    && 'palavras_chave' in value
    && Array.isArray(value.palavras_chave)
    && value.palavras_chave.every((keyword) => typeof keyword === 'string')
    && 'artigos' in value
    && Array.isArray(value.artigos)
    && value.artigos.every((article) => typeof article === 'object'
      && article !== null
      && 'titulo' in article
      && typeof article.titulo === 'string'
      && 'conteudo' in article
      && typeof article.conteudo === 'string'
      && 'pontuacao' in article
      && typeof article.pontuacao === 'number'
      && 'fonte_api' in article
      && typeof article.fonte_api === 'string')
    && 'total' in value
    && typeof value.total === 'number';
}

class ChatApp {
  private messages: Message[] = [];
  private isTyping: boolean = false;
  private currentTheme: 'dark' | 'light' = 'dark';

  // DOM elements
  private appEl!: HTMLElement;
  private messagesContainer!: HTMLElement;
  private chatForm!: HTMLFormElement;
  private chatInput!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private quickPromptsContainer!: HTMLElement;
  private themeBtn!: HTMLButtonElement;
  private soundBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private authStatusEl!: HTMLElement;

  constructor() {
    this.initTheme();
    this.renderLayout();
    this.bindElements();
    this.loadChatHistory();
    this.bindEvents();
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem('nova_theme') as 'dark' | 'light' | null;
    this.currentTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  private toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    localStorage.setItem('nova_theme', this.currentTheme);
    this.updateThemeButtonIcon();
  }

  private updateThemeButtonIcon(): void {
    if (!this.themeBtn) return;
    this.themeBtn.innerHTML = this.currentTheme === 'dark' 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    this.themeBtn.title = `Switch to ${this.currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`;
  }

  private toggleSound(): void {
    sounds.enabled = !sounds.enabled;
    localStorage.setItem('nova_sound', String(sounds.enabled));
    this.updateSoundButtonIcon();
  }

  private updateSoundButtonIcon(): void {
    if (!this.soundBtn) return;
    this.soundBtn.innerHTML = sounds.enabled
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    this.soundBtn.title = sounds.enabled ? 'Mute Sounds' : 'Unmute Sounds';
  }

  private renderLayout(): void {
    const savedSound = localStorage.getItem('nova_sound');
    if (savedSound !== null) {
      sounds.enabled = savedSound === 'true';
    }

    this.appEl = document.getElementById('app')!;
    this.appEl.innerHTML = `
      <header class="chat-header">
        <div class="bot-profile">
          <div class="bot-avatar-wrapper">
            <span>🤖</span>
            <span class="status-dot"></span>
          </div>
          <div class="bot-info">
            <h2>Assistente GLPI</h2>
            <p>Suporte e consulta à base de conhecimento</p>
            <p id="auth-status" class="auth-status" role="status" aria-live="polite">Não autenticado</p>
          </div>
        </div>
        <div class="header-actions">
          <button id="sound-btn" class="icon-btn" aria-label="Toggle sound"></button>
          <button id="theme-btn" class="icon-btn" aria-label="Toggle theme"></button>
          <button id="export-btn" class="icon-btn" title="Export Chat" aria-label="Export chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button id="clear-btn" class="icon-btn" title="Clear Chat" aria-label="Clear chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </header>

      <main id="chat-messages" class="chat-messages" aria-live="polite"></main>

      <section id="quick-prompts" class="quick-prompts-container" aria-label="Quick prompts"></section>

      <footer class="chat-input-area">
        <form id="chat-form" class="input-form">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Digite seu username para começar..."
            rows="1"
            maxlength="4000"
            required
          ></textarea>
          <button type="submit" id="send-btn" class="send-btn" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
        <div class="input-helper">
          <span>Enter to send, Shift+Enter for new line</span>
          <span id="char-count">0 chars</span>
        </div>
      </footer>
    `;
  }

  private bindElements(): void {
    this.messagesContainer = document.getElementById('chat-messages')!;
    this.chatForm = document.getElementById('chat-form') as HTMLFormElement;
    this.chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    this.quickPromptsContainer = document.getElementById('quick-prompts')!;
    this.themeBtn = document.getElementById('theme-btn') as HTMLButtonElement;
    this.soundBtn = document.getElementById('sound-btn') as HTMLButtonElement;
    this.exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    this.authStatusEl = document.getElementById('auth-status')!;

    this.updateThemeButtonIcon();
    this.updateSoundButtonIcon();
    this.updateAuthenticationStatus();
    this.renderQuickPrompts();
  }

  private renderQuickPrompts(): void {
    this.quickPromptsContainer.innerHTML = '';
    QUICK_PROMPTS.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-prompt-btn';
      btn.innerHTML = `<span>${item.icon}</span> <span>${item.label}</span>`;
      btn.addEventListener('click', () => {
        if (!this.isTyping) {
          this.handleSendMessage(item.prompt);
        }
      });
      this.quickPromptsContainer.appendChild(btn);
    });
  }

  private bindEvents(): void {
    // Form submit
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (text && !this.isTyping) {
        this.handleSendMessage(text);
      }
    });

    // Keyboard handling in textarea
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = this.chatInput.value.trim();
        if (text && !this.isTyping) {
          this.handleSendMessage(text);
        }
      }
    });

    // Auto-resize textarea & character count
    const charCountEl = document.getElementById('char-count');
    this.chatInput.addEventListener('input', () => {
      this.chatInput.style.height = 'auto';
      this.chatInput.style.height = `${Math.min(this.chatInput.scrollHeight, 120)}px`;
      if (charCountEl) {
        charCountEl.textContent = `${this.chatInput.value.length} chars`;
      }
    });

    // Theme toggle
    this.themeBtn.addEventListener('click', () => this.toggleTheme());

    // Sound toggle
    this.soundBtn.addEventListener('click', () => this.toggleSound());

    // Clear chat
    this.clearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the chat history?')) {
        this.clearChat();
      }
    });

    // Export chat
    this.exportBtn.addEventListener('click', () => this.exportChat());
  }

  private loadChatHistory(): void {
    if (this.getChatSessionId()) {
      this.chatInput.placeholder = 'Digite sua mensagem...';
    }

    const saved = localStorage.getItem('nova_chat_history');
    if (saved) {
      try {
        this.messages = JSON.parse(saved);
      } catch {
        this.messages = [];
      }
    }

    // Default welcome message if empty
    if (this.messages.length === 0) {
      this.messages.push({
        id: 'identity-prompt',
        sender: 'bot',
        text: this.getChatSessionId()
          ? 'Olá! Como posso ajudar com o GLPI?'
          : '👋 **Bem-vindo ao ChatBot do GLPI!**\n\nPara começar, envie seu username como primeira mensagem.',
        timestamp: Date.now()
      });
      this.saveChatHistory();
    } else if (!this.getChatSessionId() && !this.messages.some((message) => message.id === 'identity-prompt')) {
      this.messages.push({
        id: 'identity-prompt',
        sender: 'bot',
        text: 'Para iniciar uma sessão, envie seu username como primeira mensagem.',
        timestamp: Date.now()
      });
      this.saveChatHistory();
    }

    this.renderAllMessages();
  }

  private saveChatHistory(): void {
    localStorage.setItem('nova_chat_history', JSON.stringify(this.messages));
  }

  private renderAllMessages(): void {
    this.messagesContainer.innerHTML = '';
    this.messages.forEach((msg) => this.appendMessageDOM(msg));
    this.scrollToBottom();
  }

  private appendMessageDOM(msg: Message): void {
    const row = document.createElement('div');
    row.className = `message-row ${msg.sender}`;
    row.id = `msg-${msg.id}`;

    const avatar = document.createElement('div');
    avatar.className = `msg-avatar ${msg.sender}`;
    avatar.textContent = msg.sender === 'bot' ? '🤖' : '👤';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'msg-content-wrapper';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = formatMessageText(msg.text);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.timestamp);

    contentWrapper.appendChild(bubble);
    contentWrapper.appendChild(time);

    row.appendChild(avatar);
    row.appendChild(contentWrapper);

    this.messagesContainer.appendChild(row);
  }

  private showTypingIndicator(): void {
    const existing = document.getElementById('typing-indicator');
    if (existing) return;

    const row = document.createElement('div');
    row.className = 'typing-indicator-row';
    row.id = 'typing-indicator';

    row.innerHTML = `
      <div class="msg-avatar bot">🤖</div>
      <div class="typing-bubble">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;

    this.messagesContainer.appendChild(row);
    this.scrollToBottom();
  }

  private hideTypingIndicator(): void {
    const existing = document.getElementById('typing-indicator');
    if (existing) {
      existing.remove();
    }
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private getSessionId(): string | null {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  }

  private getChatSessionId(): string | null {
    return localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  }

  private updateAuthenticationStatus(): void {
    const isAuthenticated = Boolean(this.getSessionId());
    const userName = localStorage.getItem(AUTHENTICATED_USER_KEY);

    this.authStatusEl.textContent = isAuthenticated
      ? `Autenticado${userName ? ` como ${userName}` : ''}`
      : 'Não autenticado';
    this.authStatusEl.classList.toggle('authenticated', isAuthenticated);
  }

  private createChatSessionId(): string {
    const sessionId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
    localStorage.setItem(CHAT_SESSION_STORAGE_KEY, sessionId);
    return sessionId;
  }

  private async readApiResponse(response: Response): Promise<unknown> {
    const responseText = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }

    if (!response.ok) {
      const detail = typeof payload === 'object' && payload !== null && 'detail' in payload
        ? payload.detail
        : null;
      const message = typeof detail === 'string'
        ? detail
        : `A API respondeu com erro HTTP ${response.status}.`;
      throw new Error(message);
    }

    if (typeof payload !== 'object' || payload === null) {
      throw new Error('A API retornou uma resposta inválida.');
    }

    return payload;
  }

  private async sendChatMessage(text: string): Promise<string> {
    const sessionId = this.getChatSessionId() ?? this.createChatSessionId();
    const authToken = this.getSessionId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const history = this.messages
      .slice(0, -1)
      .filter((message) => message.id !== 'identity-prompt' && message.sender !== 'system')
      .slice(-50)
      .map((message) => ({
        role: message.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: message.text.slice(0, 4000)
      }));

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: text, session_id: sessionId, history })
    });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(AUTHENTICATED_USER_KEY);
      this.updateAuthenticationStatus();
      throw new Error('A API não autorizou esta sessão. Verifique a autenticação do backend.');
    }

    const payload = await this.readApiResponse(response);
    if (isChatSessionResponse(payload)) {
      if (payload.success === false) {
        throw new Error(payload.message || 'Não foi possível autenticar o usuário.');
      }

      localStorage.setItem(SESSION_STORAGE_KEY, payload.session_token);
      localStorage.setItem(CHAT_SESSION_STORAGE_KEY, payload.session_id);
      localStorage.setItem(AUTHENTICATED_USER_KEY, payload.user.name);
      this.chatInput.placeholder = 'Digite sua mensagem...';
      this.updateAuthenticationStatus();
      return `${payload.message}\n\n✅ **Usuário autenticado como ${payload.user.name}.**`;
    }

    if (!isChatResponse(payload)) {
      throw new Error('A API retornou uma resposta de chat inválida.');
    }
    const result = payload;

    if (result.artigos.length === 0) {
      return 'Não encontrei artigos relacionados à sua pergunta.';
    }

    const articles = result.artigos
      .map((article) => `**${article.titulo}**\n\n${article.conteudo}\n\n_Fonte: ${article.fonte_api} · Relevância: ${article.pontuacao}_`)
      .join('\n\n---\n\n');
    const keywords = result.palavras_chave.length > 0
      ? `\n\n**Palavras-chave:** ${result.palavras_chave.join(', ')}`
      : '';

    return `Encontrei ${result.total} artigo(s) relacionado(s):\n\n${articles}${keywords}`;
  }

  private appendBotMessage(text: string): void {
    const botMsg: Message = {
      id: `bot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: 'bot',
      text,
      timestamp: Date.now()
    };

    this.messages.push(botMsg);
    this.appendMessageDOM(botMsg);
    this.saveChatHistory();
    this.scrollToBottom();
  }

  private async handleSendMessage(text: string): Promise<void> {
    if (!text || this.isTyping) return;

    // 1. Add User Message
    const userMsg: Message = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: 'user',
      text: text,
      timestamp: Date.now()
    };

    this.messages.push(userMsg);
    this.appendMessageDOM(userMsg);
    this.saveChatHistory();
    this.scrollToBottom();
    sounds.playSend();

    // Reset input
    this.chatInput.value = '';
    this.chatInput.style.height = 'auto';
    const charCountEl = document.getElementById('char-count');
    if (charCountEl) charCountEl.textContent = '0 chars';

    // 2. Set Typing State
    this.isTyping = true;
    this.sendBtn.disabled = true;
    this.showTypingIndicator();

    try {
      const response = await this.sendChatMessage(text);
      this.hideTypingIndicator();
      this.appendBotMessage(response);
      sounds.playReceive();
    } catch (error) {
      this.hideTypingIndicator();
      const detail = error instanceof Error ? error.message : 'Erro inesperado ao acessar o serviço.';
      this.appendBotMessage(`Não foi possível concluir sua solicitação: ${detail}`);
    } finally {
      this.isTyping = false;
      this.sendBtn.disabled = false;
      this.chatInput.focus();
    }
  }

  private clearChat(): void {
    this.messages = [];
    localStorage.removeItem('nova_chat_history');
    localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(AUTHENTICATED_USER_KEY);
    this.updateAuthenticationStatus();
    sounds.playClear();
    this.loadChatHistory();
  }

  private exportChat(): void {
    if (this.messages.length === 0) {
      alert('No messages to export.');
      return;
    }

    const textContent = this.messages
      .map((m) => `[${new Date(m.timestamp).toLocaleString()}] ${m.sender.toUpperCase()}:\n${m.text}\n`)
      .join('\n----------------------------------------\n\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-chat-export-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new ChatApp();
});
