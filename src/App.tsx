import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppShell } from "@/components/AppShell";

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <TooltipProvider delayDuration={300}>
          <AppShell />
        </TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
