import { useState } from "react";
import { FolderOpen, Key, Save } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  path: string;
  onSave: (apiKey: string, path: string) => void;
}

export function SettingsSheet({
  open,
  onOpenChange,
  apiKey,
  path,
  onSave,
}: SettingsSheetProps) {
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [tempPath, setTempPath] = useState(path);

  const handleSave = () => {
    onSave(tempApiKey, tempPath);
    onOpenChange(false);
  };

  // Reset temp values when sheet opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setTempApiKey(apiKey);
      setTempPath(path);
    }
    onOpenChange(newOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent 
        side="right" 
        className="w-[400px] bg-[#0a0a0a] border-l border-white/5 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-white/5">
          <SheetTitle className="text-white text-[15px]">Settings</SheetTitle>
          <SheetDescription className="text-white/40 text-[13px]">
            Configure your preferences
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-6 space-y-6">
          {/* Watch Folder */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5" />
              Watch Folder
            </label>
            <Input
              value={tempPath}
              onChange={(e) => setTempPath(e.target.value)}
              placeholder="/Users/you/Desktop/Select"
              className="
                bg-white/5 border-white/10 text-white text-[13px] font-mono
                placeholder:text-white/20
                focus:border-white/20 focus:ring-1 focus:ring-white/10
              "
            />
            <p className="text-[11px] text-white/30">
              The folder where your screenshots are saved
            </p>
          </div>

          <Separator className="bg-white/5" />

          {/* API Key */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-3.5 h-3.5" />
              Claude API Key
            </label>
            <Input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="
                bg-white/5 border-white/10 text-white text-[13px] font-mono
                placeholder:text-white/20
                focus:border-white/20 focus:ring-1 focus:ring-white/10
              "
            />
            <p className="text-[11px] text-white/30">
              Your Anthropic API key for Claude
            </p>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/5 bg-[#0a0a0a]">
          <Button
            onClick={handleSave}
            className="w-full bg-white text-black hover:bg-white/90 font-medium"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
