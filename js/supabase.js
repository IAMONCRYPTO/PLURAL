const SUPABASE_URL = "https://yqknwwqndluklqqhhczq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxa253d3FuZGx1a2xxcWhoY3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDYwMjksImV4cCI6MjA5ODIyMjAyOX0.ZczbcNtlpYwkGqtchnFqUyfAKJOHO9TuMIoHzEg-ZGY";

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    if (typeof window.supabase === 'undefined') {
      console.error('Supabase library not loaded yet.');
      return null;
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export const Supabase = {
  // Auth Functions
  async signUp(email, password) {
    const client = getSupabase();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const client = getSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const client = getSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const client = getSupabase();
    if (!client) return null;
    const { data: { session }, error } = await client.auth.getSession();
    if (error) return null;
    return session;
  },

  onAuthStateChange(callback) {
    const client = getSupabase();
    if (!client) return;
    client.auth.onAuthStateChange(callback);
  },

  // Vault Functions
  async fetchVault() {
    const client = getSupabase();
    const { data, error } = await client
      .from('vault_items')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addVaultItem(userId, type, name, content) {
    const client = getSupabase();
    const { data, error } = await client
      .from('vault_items')
      .insert([{ user_id: userId, type, name, content }])
      .select();
    if (error) throw error;
    return data[0];
  },

  async deleteVaultItem(itemId) {
    const client = getSupabase();
    const { error } = await client
      .from('vault_items')
      .delete()
      .eq('id', itemId);
    if (error) throw error;
  },

  // Chat History Functions
  async fetchChats() {
    const client = getSupabase();
    const { data, error } = await client
      .from('chat_history')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async saveChat(userId, chatId, mode, messages, title) {
    const client = getSupabase();
    const payload = { id: chatId, user_id: userId, mode, messages, created_at: new Date().toISOString() };
    if (title) {
      payload.title = title;
    }
    const { data, error } = await client
      .from('chat_history')
      .upsert(payload)
      .select();
    if (error) throw error;
    return data[0];
  },

  async deleteChat(chatId) {
    const client = getSupabase();
    const { error } = await client
      .from('chat_history')
      .delete()
      .eq('id', chatId);
    if (error) throw error;
  },

  // Clone Profile Functions
  async getCloneProfile(userId) {
    const client = getSupabase();
    const { data, error } = await client
      .from('clone_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async saveCloneProfile(userId, profileData) {
    const client = getSupabase();
    const { data, error } = await client
      .from('clone_profile')
      .upsert({
        user_id: userId,
        explanation: profileData.explanation,
        detail_level: profileData.detail_level || profileData.detailLevel || 5,
        example_type: profileData.example_type || profileData.exampleType,
        comm_style: profileData.comm_style || profileData.commStyle,
        learned_patterns: profileData.learned_patterns || profileData.learnedPatterns,
        updated_at: new Date().toISOString()
      })
      .select();
    if (error) throw error;
    return data[0];
  },

  // Dev Reports Functions
  async fetchDevReports() {
    const client = getSupabase();
    const { data, error } = await client
      .from('dev_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async saveDevReport(userId, url, reportText, scores) {
    const client = getSupabase();
    const { data, error } = await client
      .from('dev_reports')
      .insert([{ user_id: userId, url, report: reportText, scores }])
      .select();
    if (error) throw error;
    return data[0];
  },

  async deleteDevReport(reportId) {
    const client = getSupabase();
    const { error } = await client
      .from('dev_reports')
      .delete()
      .eq('id', reportId);
    if (error) throw error;
  },

  async updateUserMetadata(metadata) {
    console.log('[Supabase]: updateUserMetadata called with:', metadata);
    const client = getSupabase();
    console.log('[Supabase]: Client instantiated status:', !!client);
    if (!client) throw new Error('Supabase client not initialized');
    
    console.log('[Supabase]: Initiating Promise.race (update vs 10s timeout)...');
    const updatePromise = client.auth.updateUser({ data: metadata });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out. Please check your internet connection or verify your email.')), 10000)
    );

    const result = await Promise.race([updatePromise, timeoutPromise]);
    console.log('[Supabase]: Promise.race settled. Result:', result);
    if (result.error) throw result.error;
    return result.data;
  },

  async fetchWebsProjects() {
    const client = getSupabase();
    if (!client) return [];
    try {
      const { data, error } = await client
        .from('webs_projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('[Supabase]: Failed to fetch webs_projects:', err.message);
      return [];
    }
  },

  async saveWebsProject(userId, id, name, html, version) {
    const client = getSupabase();
    if (!client) return null;
    try {
      const payload = {
        id,
        user_id: userId,
        name,
        html,
        version,
        created_at: new Date().toISOString()
      };
      const { data, error } = await client
        .from('webs_projects')
        .upsert(payload)
        .select();
      if (error) throw error;
      return data[0];
    } catch (err) {
      console.warn('[Supabase]: Failed to save webs_project:', err.message);
      return null;
    }
  },

  async deleteWebsProject(projectId) {
    const client = getSupabase();
    if (!client) return;
    try {
      const { error } = await client
        .from('webs_projects')
        .delete()
        .eq('id', projectId);
      if (error) throw error;
    } catch (err) {
      console.warn('[Supabase]: Failed to delete webs_project:', err.message);
    }
  }
};
