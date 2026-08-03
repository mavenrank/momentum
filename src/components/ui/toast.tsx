import * as React from "react";

import { cn } from "@/lib/utils";

interface ToastMessage {
  id: number;
  text: string;
  tone: "default" | "error";
}

interface ToastContextValue {
  toast: (text: string, tone?: ToastMessage["tone"]) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);
  const nextId = React.useRef(0);

  const toast = React.useCallback((text: string, tone: ToastMessage["tone"] = "default") => {
    const id = nextId.current++;
    setMessages((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setMessages((current) => current.filter((message) => message.id !== id));
    }, 3600);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {messages.map((message) => (
          <div
            key={message.id}
            role="status"
            className={cn(
              "pointer-events-auto animate-in fade-in-0 slide-in-from-bottom-2 rounded-md border px-3.5 py-2 text-sm shadow-lg",
              message.tone === "error"
                ? "border-destructive/40 bg-destructive text-destructive-foreground"
                : "bg-popover text-popover-foreground",
            )}
          >
            {message.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
