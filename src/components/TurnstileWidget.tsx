import { useEffect, useRef, useState } from 'react';

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

function getTurnstileSize(): 'normal' | 'compact' {
  if (typeof window === 'undefined') return 'normal';
  return window.innerWidth < 640 ? 'compact' : 'normal';
}

const SCRIPT_ID = 'turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const MAX_RETRIES = 50; // 最多重试 5 秒 (50 * 100ms)

export function TurnstileWidget({
  onVerify,
  onError,
  onExpire,
  siteKey,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [size, setSize] = useState<'normal' | 'compact'>(getTurnstileSize);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const newSize = getTurnstileSize();
      setSize((prev) => {
        if (prev !== newSize) {
          return newSize;
        }
        return prev;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // siteKey 无效时不尝试渲染，避免抛出异常导致白屏
    if (!siteKey) {
      setLoadError(true);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    const initWidget = () => {
      if (cancelled) return;
      if (window.turnstile && containerRef.current) {
        // 移除旧 widget 避免重复渲染
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // 忽略移除失败
          }
          widgetIdRef.current = null;
        }
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: onVerify,
            'error-callback': onError,
            'expired-callback': onExpire,
            theme: 'light',
            size,
          });
          setLoadError(false);
        } catch {
          // render 调用失败（如 sitekey 无效），通知父组件并停止重试
          if (!cancelled) {
            setLoadError(true);
            onError?.();
          }
        }
      } else {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          // 超过最大重试次数，认为加载失败
          if (!cancelled) {
            setLoadError(true);
            onError?.();
          }
          return;
        }
        // window.turnstile 尚未就绪（脚本还在加载中），100ms 后重试
        retryTimer = setTimeout(initWidget, 100);
      }
    };

    const ensureScript = () => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        // 脚本标签已存在，如果已经加载完成则直接初始化
        if (window.turnstile) {
          initWidget();
        } else {
          // 脚本还在加载中，等待 onload
          const prevOnload = existing.onload;
          existing.onload = () => {
            if (typeof prevOnload === 'function') prevOnload.call(existing);
            initWidget();
          };
        }
        return;
      }

      // 创建新的脚本标签
      const newScript = document.createElement('script');
      newScript.id = SCRIPT_ID;
      newScript.src = SCRIPT_SRC;
      newScript.async = true;
      newScript.onload = initWidget;
      newScript.onerror = () => {
        if (!cancelled) {
          setLoadError(true);
          onError?.();
        }
      };
      document.head.appendChild(newScript);
    };

    ensureScript();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // 忽略移除失败
        }
        widgetIdRef.current = null;
      }
    };
  }, [onVerify, onError, onExpire, siteKey, size]);

  if (loadError) {
    return (
      <div className="flex justify-center p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
        <span>⚠️ 人机验证加载失败，请刷新页面重试</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center"
      data-turnstile-widget
    />
  );
}


