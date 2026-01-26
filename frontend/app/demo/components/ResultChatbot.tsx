'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Array<{
    regulation: string;
    articleId: string;
    text: string;
  }>;
}

interface ResultChatbotProps {
  sessionId: number | null;
  complianceStatus: 'accepted' | 'rejected' | 'review_required';
  onBack: () => void;
}

export default function ResultChatbot({ sessionId, complianceStatus, onBack }: ResultChatbotProps) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
    'Why did my BCR check fail?',
    'What regulations apply to my building?',
    'How can I fix the compliance issues?',
    'What are the next steps for approval?',
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionId = useRef(`result-chat-${sessionId}-${Date.now()}`);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  useEffect(() => {
    // Add initial greeting message
    const statusMessages: Record<string, string> = {
      accepted: t.resultChatbot?.greetingAccepted || 'Your building project has been approved! I can help you understand the compliance details or answer any questions about the regulations that apply to your project.',
      rejected: t.resultChatbot?.greetingRejected || 'Your building project needs some modifications to meet the regulations. I can help you understand which requirements were not met and how to address them.',
      review_required: t.resultChatbot?.greetingReview || 'Your building project requires additional review. I can help explain which areas need attention and what steps you can take next.',
    };

    setMessages([
      {
        role: 'assistant',
        content: statusMessages[complianceStatus] || statusMessages.review_required,
        timestamp: new Date(),
      },
    ]);
  }, [complianceStatus, t.resultChatbot]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (messageText: string = input) => {
    if (!messageText.trim() || loading || !sessionId) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/chatbot/result-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: messageText.trim(),
          sessionId: chatSessionId.current,
          demoSessionId: sessionId,
        }),
      });

      const data = await response.json();

      if (data.success && data.response) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response.message,
          timestamp: new Date(),
          sources: data.response.sources,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        if (data.response.suggestedQuestions) {
          setSuggestedQuestions(data.response.suggestedQuestions);
        }
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t.resultChatbot?.error || 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    sendMessage(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getStatusBadge = () => {
    const statusConfig = {
      accepted: {
        color: 'bg-green-100 text-green-700',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        label: t.result?.status?.accepted || 'Accepted',
      },
      rejected: {
        color: 'bg-red-100 text-red-700',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        label: t.result?.status?.rejected || 'Rejected',
      },
      review_required: {
        color: 'bg-yellow-100 text-yellow-700',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
        label: t.result?.status?.reviewRequired || 'Review Required',
      },
    };

    const config = statusConfig[complianceStatus];

    return (
      <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        {config.icon}
        <span>{config.label}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[700px] max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {t.resultChatbot?.title || 'Compliance Assistant'}
            </h2>
            <p className="text-xs text-slate-500">
              {t.resultChatbot?.subtitle || 'Ask questions about your compliance result'}
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                  : 'bg-white border border-slate-200 shadow-sm'
              }`}
            >
              <p className={`text-sm whitespace-pre-wrap ${message.role === 'user' ? 'text-white' : 'text-slate-700'}`}>
                {message.content}
              </p>

              {/* Sources */}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    {t.resultChatbot?.sources || 'Referenced Regulations:'}
                  </p>
                  <div className="space-y-2">
                    {message.sources.slice(0, 2).map((source, sIdx) => (
                      <div key={sIdx} className="text-xs bg-slate-50 rounded p-2">
                        <span className="font-medium text-purple-600">{source.articleId}</span>
                        <span className="text-slate-400 mx-1">•</span>
                        <span className="text-slate-500">{source.regulation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-purple-200' : 'text-slate-400'}`}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-slate-500">{t.common?.thinking || 'Thinking...'}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && messages.length <= 2 && (
        <div className="p-3 border-t border-slate-200 bg-white">
          <p className="text-xs text-slate-500 mb-2">
            {t.resultChatbot?.suggestedQuestions || 'Suggested questions:'}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestedQuestion(question)}
                disabled={loading}
                className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.resultChatbot?.placeholder || 'Ask about your compliance result...'}
              rows={1}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 resize-none text-sm"
              style={{ minHeight: '48px', maxHeight: '120px' }}
              disabled={loading}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="p-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
