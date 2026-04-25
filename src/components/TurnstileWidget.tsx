import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  siteKey: string;
}

const SCRIPT_ID = 'turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** 全局脚本加载 Promise，多个组件实例共享，避免重复请求 */
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) { resolve(); return; }
      const onLoad = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Turnstile script load failed')); };
      const cleanup = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
      };
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Turnstile script load failed')); };
    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    document.head.appendChild(script);
  });

  scriptLoadPromise.catch(() => {
    // 加载失败时重置 promise，允许后续组件重试
    scriptLoadPromise = null;
  });

  return scriptLoadPromise;
}

function getTurnstileSize(): 'normal' | 'compact' {
  if (typeof window === 'undefined') return 'normal';
  return window.innerWidth < 640 ? 'compact' : 'normal';
}

export function TurnstileWidget({ onVerify, onError, onExpire, siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onVerify, onError, onExpire });
  const [size, setSize] = useState<'normal' | 'compact'>(getTurnstileSize);
  const [loadError, setLoadError] = useState(false);

  // 保持回调引用最新，避免 effect 因回调变化而频繁重建
  callbacksRef.current = { onVerify, onError, onExpire };

  useEffect(() => {
    const handleResize = () => setSize((prev) => (prev !== getTurnstileSize() ? getTurnstileSize() : prev));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current) return;
    try {
      const { onVerify: v, onError: e, onExpire: ex } = callbacksRef.current;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => v(token),
        'error-callback': () => e?.(),
        'expired-callback': () => ex?.(),
        theme: 'light',
        size,
      });
      setLoadError(false);
    } catch {
      setLoadError(true);
      callbacksRef.current.onError?.();
    }
  }, [siteKey, size]);

  useEffect(() => {
    if (!siteKey) {
      setLoadError(true);
      return;
    }

    let cancelled = false;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        // 先移除旧 widget，然后延迟渲染新 widget
        // 延迟是为了避免 React StrictMode 双重挂载时的 remove/render 竞态
        if (widgetIdRef.current) {
          try { window.turnstile?.remove(widgetIdRef.current); } catch { /* ignore */ }
          widgetIdRef.current = null;
        }
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
          if (!cancelled) renderWidget();
        }, 50);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          callbacksRef.current.onError?.();
        }
      });

    return () => {
      cancelled = true;
      if (renderTimer) clearTimeout(renderTimer);
      if (window.turnstile && widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, size, renderWidget]);

  if (loadError) {
    return (
      <div className="flex justify-center p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
        <span>⚠️ 人机验证加载失败，请刷新页面重试</span>
      </div>
    );
  }

  return <div ref={containerRef} className="flex justify-center" data-turnstile-widget />;
}


