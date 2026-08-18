import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qxjamqwbgeysnoipqnih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kCmRAz-yQsd4VCDvtmV98g_y5phq6wZ';

let client = null;

try {
  if (typeof createClient === 'function') {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } else if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
} catch (err) {
  console.warn('Inizializzazione Supabase client:', err);
}

export const supabase = client;

export function isSupabaseConfigured() {
  return Boolean(client && SUPABASE_URL && SUPABASE_ANON_KEY);
}

// -------------------------------------------------------------
// HELPER AUTENTICAZIONE
// -------------------------------------------------------------
export async function signUpUser(email, password, fullName = '') {
  if (!client) throw new Error('Client Supabase non configurato.');
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInUser(email, password) {
  if (!client) throw new Error('Client Supabase non configurato.');
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function resetUserPassword(email) {
  if (!client) throw new Error('Client Supabase non configurato.');
  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
  if (error) throw error;
  return data;
}

export async function getSessionUser() {
  if (!client) return null;
  try {
    const { data: { session } } = await client.auth.getSession();
    return session ? session.user : null;
  } catch (err) {
    console.warn('Errore lettura sessione Supabase:', err);
    return null;
  }
}

// -------------------------------------------------------------
// HELPER SINCRONIZZAZIONE PROGETTI
// -------------------------------------------------------------
export async function fetchProjectsFromCloud(userId) {
  if (!client || !userId) return [];
  try {
    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Errore caricamento progetti da Supabase:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      examDate: row.exam_date,
      prepLevel: row.prep_level,
      examType: row.exam_type,
      languageStyle: row.language_style,
      sourceType: row.source_type,
      schedule: row.schedule || [],
      files: row.files || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.warn('Fetch projects exception:', err);
    return [];
  }
}

export async function saveProjectToCloud(userId, project) {
  if (!client || !userId || !project) return;
  try {
    const payload = {
      user_id: userId,
      title: project.description || 'Progetto di Studio',
      description: project.description,
      exam_date: project.examDate,
      prep_level: project.prepLevel,
      exam_type: project.examType,
      language_style: project.languageStyle,
      source_type: project.sourceType,
      schedule: project.schedule || [],
      files: (project.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        wordsCount: f.wordsCount || 0,
        pagesCount: f.pagesCount || 1,
      })),
      updated_at: new Date().toISOString(),
    };

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project.id);
    if (isUUID) {
      payload.id = project.id;
    }

    const { data, error } = await client
      .from('projects')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.warn('Errore salvataggio progetto Supabase:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Save project exception:', err);
    return null;
  }
}

export async function deleteProjectFromCloud(userId, projectId) {
  if (!client || !userId || !projectId) return;
  try {
    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) console.warn('Errore eliminazione progetto Supabase:', error);
  } catch (err) {
    console.warn('Delete project exception:', err);
  }
}

// -------------------------------------------------------------
// HELPER SINCRONIZZAZIONE CHAT
// -------------------------------------------------------------
export async function fetchChatsFromCloud(userId) {
  if (!client || !userId) return [];
  try {
    const { data, error } = await client
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Errore caricamento chat da Supabase:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      messages: row.messages || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.warn('Fetch chats exception:', err);
    return [];
  }
}

export async function saveChatToCloud(userId, chat) {
  if (!client || !userId || !chat) return;
  try {
    const firstMsg = (chat.messages || []).find((m) => m.role === 'user');
    const title = chat.title || (firstMsg ? firstMsg.text?.slice(0, 40) : 'Nuova Conversazione');

    const payload = {
      user_id: userId,
      title: title || 'Conversazione',
      messages: chat.messages || [],
      updated_at: new Date().toISOString(),
    };

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chat.id);
    if (isUUID) {
      payload.id = chat.id;
    }

    const { data, error } = await client
      .from('conversations')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.warn('Errore salvataggio chat Supabase:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Save chat exception:', err);
    return null;
  }
}

export async function deleteChatFromCloud(userId, chatId) {
  if (!client || !userId || !chatId) return;
  try {
    const { error } = await client
      .from('conversations')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);

    if (error) console.warn('Errore eliminazione chat Supabase:', error);
  } catch (err) {
    console.warn('Delete chat exception:', err);
  }
}

// -------------------------------------------------------------
// HELPER PROFILO E ABBONAMENTO STRIPE
// -------------------------------------------------------------
export async function fetchUserProfile(userId) {
  if (!client || !userId) return null;
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Errore lettura profilo:', error);
    }
    return data || null;
  } catch (err) {
    console.warn('Fetch user profile exception:', err);
    return null;
  }
}

export async function setSubscriptionActive(userId, plan = 'monthly_14.99') {
  if (!client || !userId) return false;
  try {
    const { data, error } = await client
      .from('profiles')
      .upsert({
        id: userId,
        subscription_status: 'active',
        plan_type: plan,
        subscription_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn('Errore attivazione abbonamento:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Set subscription exception:', err);
    return false;
  }
}
