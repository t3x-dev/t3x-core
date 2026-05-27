import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type TemporaryChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type TemporaryChat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: TemporaryChatMessage[];
};

interface TemporaryChatsState {
  chats: TemporaryChat[];
  createChat: (title: string) => TemporaryChat;
  getOrCreateEmptyChat: (title: string) => TemporaryChat;
  removeChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  addMessage: (
    chatId: string,
    message: Omit<TemporaryChatMessage, 'createdAt'> & { createdAt?: string }
  ) => void;
  replaceMessages: (chatId: string, messages: TemporaryChatMessage[]) => void;
}

function nowIso() {
  return new Date().toISOString();
}

function createTemporaryChatId() {
  return `temp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFallbackStorage() {
  const ls = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  if (ls && typeof ls.setItem === 'function' && typeof ls.getItem === 'function') {
    return ls;
  }
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
}

export const useTemporaryChatsStore = create<TemporaryChatsState>()(
  persist(
    (set, get) => ({
      chats: [],
      createChat: (rawTitle) => {
        const timestamp = nowIso();
        const chat: TemporaryChat = {
          id: createTemporaryChatId(),
          title: rawTitle.trim() || 'Temporary chat',
          createdAt: timestamp,
          updatedAt: timestamp,
          messages: [],
        };
        set((state) => ({ chats: [chat, ...state.chats] }));
        return chat;
      },
      getOrCreateEmptyChat: (rawTitle) => {
        const reusable = get()
          .chats.filter((chat) => chat.messages.length === 0)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        if (reusable) {
          set((state) => ({
            chats: state.chats.filter(
              (chat) => chat.messages.length > 0 || chat.id === reusable.id
            ),
          }));
          return reusable;
        }

        const timestamp = nowIso();
        const chat: TemporaryChat = {
          id: createTemporaryChatId(),
          title: rawTitle.trim() || 'Temporary chat',
          createdAt: timestamp,
          updatedAt: timestamp,
          messages: [],
        };
        set((state) => ({ chats: [chat, ...state.chats] }));
        return chat;
      },
      removeChat: (id) => set((state) => ({ chats: state.chats.filter((chat) => chat.id !== id) })),
      renameChat: (id, rawTitle) => {
        const title = rawTitle.trim();
        if (!title) return;
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, title, updatedAt: nowIso() } : chat
          ),
        }));
      },
      addMessage: (chatId, message) => {
        const createdAt = message.createdAt ?? nowIso();
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  updatedAt: createdAt,
                  messages: [...chat.messages, { ...message, createdAt }],
                }
              : chat
          ),
        }));
      },
      replaceMessages: (chatId, messages) => {
        const updatedAt = messages.at(-1)?.createdAt ?? nowIso();
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, messages, updatedAt } : chat
          ),
        }));
      },
    }),
    {
      name: 't3x-temporary-chats',
      storage: createJSONStorage(getFallbackStorage),
      partialize: (state) => ({ chats: state.chats }),
    }
  )
);

export function getTemporaryChat(id: string | undefined): TemporaryChat | undefined {
  if (!id) return undefined;
  return useTemporaryChatsStore.getState().chats.find((chat) => chat.id === id);
}

export function isTemporaryChatId(id: string | undefined | null): boolean {
  return Boolean(id?.startsWith('temp_'));
}
