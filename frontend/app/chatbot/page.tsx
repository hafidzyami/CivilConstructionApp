'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

type SearchMode = 'auto' | 'llm-generated' | 'similarity';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Array<{
    regulation: string;
    articleId: string;
    text: string;
  }>;
  suggestedQuestions?: string[];
  searchMethod?: 'llm-generated' | 'similarity' | 'fixed-query' | 'fulltext';
}

export default function ChatbotPage() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    handleSendMessage('hello', true);
  }, []);

  const handleSendMessage = async (messageText?: string, isInitial = false) => {
    const queryText = messageText || input.trim();
    if (!queryText && !isInitial) return;

    if (!isInitial) {
      const userMessage: Message = {
        role: 'user',
        content: queryText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6969/api';
      const response = await fetch(`${apiUrl}/chatbot/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: queryText,
          sessionId,
          searchMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response.message,
        timestamp: new Date(),
        sources: data.response.sources,
        suggestedQuestions: data.response.suggestedQuestions,
        searchMethod: data.response.searchMethod,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: t.chatbot.messages.error,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    handleSendMessage(question);
  };

  const handleClearChat = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6969/api';
      await fetch(`${apiUrl}/chatbot/history/${sessionId}`, {
        method: 'DELETE',
      });
      setMessages([]);
      handleSendMessage('hello', true);
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  const getSearchModeDisplay = (mode: SearchMode) => {
    switch (mode) {
      case 'auto':
        return { label: t.chatbot.searchMode.auto, desc: t.chatbot.searchMode.autoDesc };
      case 'similarity':
        return { label: t.chatbot.searchMode.similarity, desc: t.chatbot.searchMode.similarityDesc };
      case 'llm-generated':
        return { label: t.chatbot.searchMode.llmGenerated, desc: t.chatbot.searchMode.llmGeneratedDesc };
    }
  };

  const getSearchMethodBadge = (method?: string) => {
    if (!method) return null;

    const badges: Record<string, { color: string; label: string }> = {
      'similarity': { color: 'bg-green-500', label: t.chatbot.searchMethods.similarity },
      'llm-generated': { color: 'bg-purple-500', label: t.chatbot.searchMethods.llmGenerated },
      'fixed-query': { color: 'bg-blue-500', label: t.chatbot.searchMethods.directMatch },
      'fulltext': { color: 'bg-yellow-500', label: t.chatbot.searchMethods.fulltext },
    };

    const badge = badges[method] || { color: 'bg-gray-500', label: method };

    return (
      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${badge.color} ml-2`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 h-screen flex flex-col">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              <h1 className="text-4xl font-bold text-white mb-2">
                {t.chatbot.title}
              </h1>
              <p className="text-gray-300">
                {t.chatbot.subtitle}
              </p>
            </div>
            <LanguageSwitcher />
          </div>

          {/* Search Mode Toggle */}
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-4 border border-white/20">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-white text-sm font-semibold mb-2">
                  {t.chatbot.searchMode.title}
                </label>
                <div className="flex gap-2">
                  {(['auto', 'similarity', 'llm-generated'] as SearchMode[]).map((mode) => {
                    const display = getSearchModeDisplay(mode);
                    return (
                      <button
                        key={mode}
                        onClick={() => setSearchMode(mode)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                          searchMode === mode
                            ? 'bg-blue-600 text-white shadow-lg scale-105'
                            : 'bg-white/20 text-gray-300 hover:bg-white/30'
                        }`}
                        title={display.desc}
                      >
                        {display.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{t.chatbot.searchMode.current}:</span>{' '}
                  {getSearchModeDisplay(searchMode).desc}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 bg-white/10 backdrop-blur-lg rounded-lg shadow-2xl border border-white/20 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/90 text-gray-900'
                  }`}
                >
                  {/* Message Content */}
                  <div className="whitespace-pre-wrap break-words">
                    {message.content.split('\n').map((line, i) => {
                      if (line.startsWith('###')) {
                        return (
                          <h3 key={i} className="text-lg font-bold mt-2 mb-1">
                            {line.replace('###', '').trim()}
                          </h3>
                        );
                      }
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return (
                          <p key={i} className="font-semibold">
                            {line.replace(/\*\*/g, '')}
                          </p>
                        );
                      }
                      if (line.startsWith('-')) {
                        return (
                          <li key={i} className="ml-4">
                            {line.substring(1).trim()}
                          </li>
                        );
                      }
                      if (line.startsWith('>')) {
                        return (
                          <blockquote
                            key={i}
                            className="border-l-4 border-gray-400 pl-4 italic my-2"
                          >
                            {line.substring(1).trim()}
                          </blockquote>
                        );
                      }
                      return line ? (
                        <p key={i} className="mb-1">
                          {line}
                        </p>
                      ) : (
                        <br key={i} />
                      );
                    })}
                  </div>

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-300">
                      <p className="text-sm font-semibold mb-2">{t.chatbot.messages.sources}:</p>
                      <div className="space-y-2">
                        {message.sources.slice(0, 3).map((source, idx) => (
                          <div key={idx} className="text-xs bg-gray-100 p-2 rounded">
                            <p className="font-semibold">{source.regulation}</p>
                            <p className="text-gray-600 truncate">{source.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Questions */}
                  {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-300">
                      <p className="text-sm font-semibold mb-2">{t.chatbot.messages.suggestedQuestions}:</p>
                      <div className="flex flex-wrap gap-2">
                        {message.suggestedQuestions.map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestedQuestion(question)}
                            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded-full transition-colors"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamp and Search Method */}
                  <div className="flex items-center justify-between mt-2">
                    <div
                      className={`text-xs ${message.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                    {message.role === 'assistant' && message.searchMethod && (
                      <div className="text-xs">
                        {getSearchMethodBadge(message.searchMethod)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/90 rounded-lg p-4">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-white/20 p-4 bg-white/5">
            <div className="flex space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t.chatbot.input.placeholder}
                className="flex-1 px-4 py-3 rounded-lg bg-white/90 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !input.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
              >
                {t.chatbot.input.send}
              </button>
              <button
                onClick={handleClearChat}
                className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                {t.chatbot.input.clear}
              </button>
            </div>
            <p className="text-xs text-gray-300 mt-2">
              {t.chatbot.input.hint}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-gray-400 text-sm">
          <a href="/" className="hover:text-white transition-colors">
            ← {t.common.backToHome}
          </a>
        </div>
      </div>
    </div>
  );
}
