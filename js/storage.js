import { Supabase } from './supabase.js';

let currentUserId = 'anonymous';
let vaultItems = [];

const KEYS = {
  CHATS: (uid) => `plural_${uid}_chats`,
  CLONE_PROFILE: (uid) => `plural_${uid}_clone_profile`,
  TWIN_PROFILE: (uid) => `plural_${uid}_twin_profile`,
  CLONE_ONBOARDED: (uid) => `plural_${uid}_clone_onboarded`,
  TWIN_ONBOARDED: (uid) => `plural_${uid}_twin_onboarded`,
  CURRENT_CHAT: (uid) => `plural_${uid}_current_chat`,
  WEBS_PROJECTS: (uid) => `plural_${uid}_webs_projects`,
};

function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage save failed:', e.message);
  }
}

export const Storage = {
  setUserId(userId) {
    currentUserId = userId || 'anonymous';
  },

  getUserId() {
    return currentUserId;
  },

  /* ── Syncing with Supabase ── */
  async syncFromSupabase() {
    if (currentUserId === 'anonymous') return;
    try {
      // 1. Fetch Chats from Supabase and merge with LocalStorage to avoid overwriting new local states
      const serverChats = await Supabase.fetchChats();
      const localChats = load(KEYS.CHATS(currentUserId), {});
      const chatMap = { ...localChats };

      serverChats.forEach(item => {
        if (!chatMap[item.mode]) chatMap[item.mode] = [];
        
        const existingLocalIdx = chatMap[item.mode].findIndex(c => c.id === item.id);
        const serverChatObj = {
          id: item.id,
          title: item.title || item.messages[0]?.content?.slice(0, 60) || 'Chat',
          createdAt: new Date(item.created_at).getTime(),
          messages: item.messages
        };

        if (existingLocalIdx !== -1) {
          const localChat = chatMap[item.mode][existingLocalIdx];
          // Keep local chat if it has more or equal messages (has newer/unsynced local typing)
          if (item.messages.length >= localChat.messages.length) {
            chatMap[item.mode][existingLocalIdx] = serverChatObj;
          }
        } else {
          chatMap[item.mode].push(serverChatObj);
        }
      });

      // Sort each mode
      Object.keys(chatMap).forEach(mode => {
        chatMap[mode].sort((a, b) => b.createdAt - a.createdAt);
      });
      save(KEYS.CHATS(currentUserId), chatMap);

      // 2. Fetch Clone Profile
      const cloneProfile = await Supabase.getCloneProfile(currentUserId);
      if (cloneProfile) {
        save(KEYS.CLONE_PROFILE(currentUserId), {
          explanationStyle: cloneProfile.explanation,
          detailLevel: cloneProfile.detail_level,
          examplePreference: cloneProfile.example_type,
          communicationStyle: cloneProfile.comm_style,
          learnedPatterns: cloneProfile.learned_patterns
        });
        save(KEYS.CLONE_ONBOARDED(currentUserId), true);
      }

      // 3. Fetch Webs Projects from Supabase
      const serverWebs = await Supabase.fetchWebsProjects();
      if (serverWebs && serverWebs.length > 0) {
        const localWebs = load(KEYS.WEBS_PROJECTS(currentUserId), []);
        const websMap = {};
        localWebs.forEach(p => { websMap[p.id] = p; });
        serverWebs.forEach(item => {
          const localItem = websMap[item.id];
          if (!localItem || item.version >= localItem.version) {
            websMap[item.id] = {
              id: item.id,
              name: item.name,
              html: item.html,
              version: item.version,
              createdAt: new Date(item.created_at).getTime()
            };
          }
        });
        const mergedWebs = Object.values(websMap).sort((a, b) => b.createdAt - a.createdAt);
        save(KEYS.WEBS_PROJECTS(currentUserId), mergedWebs);
      }
    } catch (err) {
      console.error('Failed to sync from Supabase:', err.message);
    }
  },

  /* ── Chat List ─────────────────────────── */

  getChatList(mode) {
    const chats = load(KEYS.CHATS(currentUserId), {});
    return (chats[mode] || []).sort((a, b) => b.createdAt - a.createdAt);
  },

  createChat(mode, title = 'New Chat') {
    const chats = load(KEYS.CHATS(currentUserId), {});
    if (!chats[mode]) chats[mode] = [];

    const chat = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      createdAt: Date.now(),
      messages: [],
    };

    chats[mode].unshift(chat);
    save(KEYS.CHATS(currentUserId), chats);

    // Sync to Supabase in background
    if (currentUserId !== 'anonymous') {
      Supabase.saveChat(currentUserId, chat.id, mode, chat.messages, chat.title).catch(err => {
        console.error('Failed to save new chat to Supabase:', err.message);
      });
    }

    return chat;
  },

  deleteChat(mode, chatId) {
    const chats = load(KEYS.CHATS(currentUserId), {});
    if (chats[mode]) {
      chats[mode] = chats[mode].filter(c => c.id !== chatId);
      save(KEYS.CHATS(currentUserId), chats);
    }

    // Sync to Supabase in background
    if (currentUserId !== 'anonymous') {
      Supabase.deleteChat(chatId).catch(err => {
        console.error('Failed to delete chat from Supabase:', err.message);
      });
    }
  },

  /* ── Messages ──────────────────────────── */

  getMessages(mode, chatId) {
    const chats = load(KEYS.CHATS(currentUserId), {});
    const chat = (chats[mode] || []).find(c => c.id === chatId);
    return chat ? chat.messages : [];
  },

  saveMessages(mode, chatId, messages) {
    const chats = load(KEYS.CHATS(currentUserId), {});
    if (!chats[mode]) chats[mode] = [];
    const chat = chats[mode].find(c => c.id === chatId);
    if (chat) {
      chat.messages = messages;
      const firstUser = messages.find(m => m.role === 'user');
      if (firstUser) {
        chat.title = firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '');
      }
      save(KEYS.CHATS(currentUserId), chats);

      // Sync to Supabase in background
      if (currentUserId !== 'anonymous') {
        Supabase.saveChat(currentUserId, chatId, mode, messages, chat.title).catch(err => {
          console.error('Failed to save messages to Supabase:', err.message);
        });
      }
    }
  },

  renameChat(mode, chatId, newTitle) {
    const chats = load(KEYS.CHATS(currentUserId), {});
    if (chats[mode]) {
      const chat = chats[mode].find(c => c.id === chatId);
      if (chat) {
        chat.title = newTitle;
        save(KEYS.CHATS(currentUserId), chats);
        
        // Sync to Supabase in background
        if (currentUserId !== 'anonymous') {
          Supabase.saveChat(currentUserId, chatId, mode, chat.messages, newTitle).catch(err => {
            console.error('Failed to save renamed chat to Supabase:', err.message);
          });
        }
      }
    }
  },

  /* ── Current Chat Tracking ─────────────── */

  getCurrentChatId(mode) {
    const current = load(KEYS.CURRENT_CHAT(currentUserId), {});
    return current[mode] || null;
  },

  setCurrentChatId(mode, chatId) {
    const current = load(KEYS.CURRENT_CHAT(currentUserId), {});
    current[mode] = chatId;
    save(KEYS.CURRENT_CHAT(currentUserId), current);
  },

  /* ── Clone Profile ─────────────────────── */

  getCloneProfile() {
    return load(KEYS.CLONE_PROFILE(currentUserId), null);
  },

  saveCloneProfile(profile) {
    save(KEYS.CLONE_PROFILE(currentUserId), profile);
    
    // Sync to Supabase in background
    if (currentUserId !== 'anonymous') {
      Supabase.saveCloneProfile(currentUserId, {
        explanation: profile.explanationStyle,
        detailLevel: profile.detailLevel,
        exampleType: profile.examplePreference,
        commStyle: profile.communicationStyle,
        learnedPatterns: profile.learnedPatterns
      }).catch(err => {
        console.error('Failed to save clone profile to Supabase:', err.message);
      });
    }
  },

  isCloneOnboarded() {
    return !!load(KEYS.CLONE_ONBOARDED(currentUserId), false);
  },

  setCloneOnboarded(v = true) {
    save(KEYS.CLONE_ONBOARDED(currentUserId), v);
  },

  /* ── Twin Profile ──────────────────────── */

  getTwinProfile() {
    return load(KEYS.TWIN_PROFILE(currentUserId), null);
  },

  saveTwinProfile(profile) {
    save(KEYS.TWIN_PROFILE(currentUserId), profile);
  },

  isTwinOnboarded() {
    return !!load(KEYS.TWIN_ONBOARDED(currentUserId), false);
  },

  setTwinOnboarded(v = true) {
    save(KEYS.TWIN_ONBOARDED(currentUserId), v);
  },

  /* ── Danger Zone ───────────────────────── */

  clearAll() {
    Object.values(KEYS).forEach(kFn => localStorage.removeItem(kFn(currentUserId)));
  },

  /* ── Knowledge Vault Context ───────────── */

  setVaultItems(items) {
    vaultItems = items || [];
  },

  getVaultItems() {
    return vaultItems;
  },

  getVaultContextString() {
    if (!vaultItems || vaultItems.length === 0) return '';
    return vaultItems.map((item, idx) => {
      // Extract up to 500 words
      const words = item.content.split(/\s+/).slice(0, 500).join(' ');
      const name = item.name;
      const typeLabel = item.type.toUpperCase();
      return `=== VAULT ITEM ${idx + 1} (${typeLabel}: ${name}) ===\n${words}`;
    }).join('\n\n');
  },

  /* ── WEBS Projects Storage ──────────────── */

  getWebsProjects() {
    return load(KEYS.WEBS_PROJECTS(currentUserId), []);
  },

  saveWebsProjects(projects) {
    save(KEYS.WEBS_PROJECTS(currentUserId), projects || []);
  },

  addWebsProject(project) {
    const projects = this.getWebsProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx !== -1) {
      projects[idx] = project;
    } else {
      projects.unshift(project);
    }
    this.saveWebsProjects(projects);
  },

  deleteWebsProjectLocal(projectId) {
    let projects = this.getWebsProjects();
    projects = projects.filter(p => p.id !== projectId);
    this.saveWebsProjects(projects);
  },

  load(key, fallback = null) {
    return load(key, fallback);
  },

  save(key, val) {
    save(key, val);
  }
};
