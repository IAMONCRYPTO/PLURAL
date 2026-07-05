import { Supabase } from './supabase.js';
import { Storage } from './storage.js';

let onModeChange = null;
let onChatSelect = null;
let onNewChat = null;
let currentMode = 'council';

/**
 * Initialize sidebar with callbacks.
 */
export function initSidebar({ onMode, onChat, onNew }) {
  onModeChange = onMode;
  onChatSelect = onChat;
  onNewChat = onNew;

  // ── Mode buttons ──
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === currentMode) return;
      setActiveMode(mode);
      onModeChange?.(mode);
      closeMobileSidebar();
    });
  });

  // ── New Chat ──
  document.getElementById('newChatBtn').addEventListener('click', () => {
    onNewChat?.(currentMode);
    closeMobileSidebar();
  });

  // ── Mobile hamburger ──
  document.getElementById('hamburgerBtn').addEventListener('click', toggleMobileSidebar);
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileSidebar);

  // ── Settings (placeholder) ──
  document.getElementById('settingsBtn').addEventListener('click', () => {
    // Could open a settings modal in future
  });

  // ── Chat Search ──
  const searchInput = document.getElementById('chatSearchInput');
  if (searchInput) {
    searchInput.value = ''; // Reset immediately
    
    let userFocusedSearch = false;
    searchInput.addEventListener('focus', () => {
      userFocusedSearch = true;
    });

    searchInput.addEventListener('input', () => {
      updateChatList(currentMode);
    });

    // Run an interval check for 2.5 seconds to immediately clear asynchronous browser autofill injections
    const autofillClearInterval = setInterval(() => {
      if (!userFocusedSearch && searchInput.value) {
        searchInput.value = '';
        updateChatList(currentMode);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(autofillClearInterval);
    }, 2500);
  }
}

/**
 * Set the visually active mode in the sidebar.
 */
export function setActiveMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  const newChatSection = document.querySelector('.new-chat-section');
  const chatHistorySection = document.querySelector('.chat-history');

  if (mode === 'vault' || mode === 'dev') {
    if (newChatSection) newChatSection.style.display = 'none';
    if (chatHistorySection) chatHistorySection.style.display = 'none';
  } else {
    if (newChatSection) newChatSection.style.display = 'block';
    if (chatHistorySection) chatHistorySection.style.display = 'block';
    updateChatList(mode);
  }
}

/**
 * Refresh the chat history list for a mode.
 */
export function updateChatList(mode) {
  const listEl = document.getElementById('chatList');
  const searchInput = document.getElementById('chatSearchInput');
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
  
  const targetMode = mode || currentMode;
  let chats = [];
  let activeChatId = '';

  chats = Storage.getChatList(targetMode);
  activeChatId = Storage.getCurrentChatId(targetMode);

  if (searchQuery) {
    chats = chats.filter(chat => 
      chat.title.toLowerCase().includes(searchQuery) ||
      chat.messages.some(m => m.content.toLowerCase().includes(searchQuery))
    );
  }

  if (chats.length === 0) {
    listEl.innerHTML = `<div style="padding: 12px 8px; font-size: 13px; color: var(--text-dim);">${searchQuery ? 'No matching items' : 'No items yet'}</div>`;
    return;
  }

  listEl.innerHTML = chats.map(chat => `
    <div class="chat-item ${chat.id === activeChatId ? 'active' : ''}" data-chat-id="${chat.id}">
      <span class="chat-item-title">${escapeHtml(chat.title)}</span>
      <button class="chat-item-rename" data-rename-id="${chat.id}" title="Rename">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
      </button>
      <button class="chat-item-delete" data-delete-id="${chat.id}" title="Delete">×</button>
    </div>
  `).join('');

  // ── Chat item clicks ──
  listEl.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-item-delete') || e.target.closest('.chat-item-rename')) return;
      const chatId = item.dataset.chatId;
      onChatSelect?.(currentMode, chatId);
      closeMobileSidebar();
    });
  });

  // ── Rename clicks ──
  listEl.querySelectorAll('.chat-item-rename').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chatId = btn.dataset.renameId;

      const chats = Storage.getChatList(currentMode);
      const chat = chats.find(c => c.id === chatId);
      if (!chat) return;

      const newTitle = window.prompt('Rename Chat:', chat.title);
      if (newTitle !== null) {
        const trimmed = newTitle.trim();
        if (trimmed) {
          Storage.renameChat(currentMode, chatId, trimmed);
          updateChatList(currentMode);
        }
      }
    });
  });

  // ── Delete clicks ──
  listEl.querySelectorAll('.chat-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chatId = btn.dataset.deleteId;

      Storage.deleteChat(currentMode, chatId);
      updateChatList(currentMode);

      if (chatId === activeChatId) {
        onNewChat?.(currentMode);
      }
    });
  });
}

/**
 * Toggle mobile sidebar.
 */
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('active');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('active');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
